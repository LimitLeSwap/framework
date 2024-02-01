/* eslint-disable max-lines */
import { inject, injectable, Lifecycle, scoped } from "tsyringe";
import {
  BlockProverExecutionData,
  BlockProverState,
  DefaultProvableHashList,
  NetworkState,
  Protocol,
  ProtocolModulesRecord,
  ProvableTransactionHook,
  RuntimeMethodExecutionContext,
  RuntimeMethodExecutionData,
  RuntimeProvableMethodExecutionResult,
  RuntimeTransaction,
  StateTransition,
  ProvableBlockHook,
  BlockHashMerkleTree,
  BlockHashMerkleTreeWitness,
  StateServiceProvider,
  BlockHashTreeEntry,
  ACTIONS_EMPTY_HASH,
  MinaActions,
  MinaActionsHashList,
} from "@proto-kit/protocol";
import { Bool, Field, Poseidon } from "o1js";
import {
  AreProofsEnabled,
  log,
  RollupMerkleTree,
} from "@proto-kit/common";
import {
  MethodParameterEncoder,
  Runtime,
  RuntimeModule,
  RuntimeModulesRecord,
} from "@proto-kit/module";

import { PendingTransaction } from "../../../mempool/PendingTransaction";
import { CachedStateService } from "../../../state/state/CachedStateService";
import { distinctByString } from "../../../helpers/utils";
import { AsyncStateService } from "../../../state/async/AsyncStateService";
import { CachedMerkleTreeStore } from "../../../state/merkle/CachedMerkleTreeStore";
import { AsyncMerkleTreeStore } from "../../../state/async/AsyncMerkleTreeStore";
import { UntypedStateTransition } from "../helpers/UntypedStateTransition";
import type { StateRecord } from "../BlockProducerModule";

import { RuntimeMethodExecution } from "./RuntimeMethodExecution";

const errors = {
  methodIdNotFound: (methodId: string) =>
    new Error(`Can't find runtime method with id ${methodId}`),
};

export interface TransactionExecutionResult {
  tx: PendingTransaction;
  stateTransitions: UntypedStateTransition[];
  protocolTransitions: UntypedStateTransition[];
  status: Bool;
  statusMessage?: string;
  /**
   * TODO Remove
   * @deprecated
   */
  stateDiff: StateRecord;
}

export interface UnprovenBlock {
  height: Field;
  networkState: {
    before: NetworkState;
    during: NetworkState;
  };
  transactions: TransactionExecutionResult[];
  transactionsHash: Field;
  toEternalTransactionsHash: Field;
  fromEternalTransactionsHash: Field;
  fromBlockHashRoot: Field;
  fromMessagesHash: Field;
  toMessagesHash: Field;
}

export interface UnprovenBlockMetadata {
  stateRoot: bigint;
  blockHashRoot: bigint;
  afterNetworkState: NetworkState;
  blockStateTransitions: UntypedStateTransition[];
  blockHashWitness: BlockHashMerkleTreeWitness;
}

export interface UnprovenBlockWithMetadata {
  block: UnprovenBlock;
  metadata: UnprovenBlockMetadata;
}

export const UnprovenBlockWithMetadata = {
  createEmpty: () =>
    ({
      block: {
        height: Field(0),
        transactionsHash: Field(0),
        fromEternalTransactionsHash: Field(0),
        toEternalTransactionsHash: Field(0),
        transactions: [],
        networkState: {
          before: NetworkState.empty(),
          during: NetworkState.empty(),
        },
        fromBlockHashRoot: Field(BlockHashMerkleTree.EMPTY_ROOT),
        fromMessagesHash: Field(0),
        toMessagesHash: ACTIONS_EMPTY_HASH,
      },
      metadata: {
        afterNetworkState: NetworkState.empty(),
        stateRoot: RollupMerkleTree.EMPTY_ROOT,
        blockHashRoot: BlockHashMerkleTree.EMPTY_ROOT,
        blockStateTransitions: [],
        blockHashWitness: BlockHashMerkleTree.WITNESS.dummy(),
      },
    } satisfies UnprovenBlockWithMetadata),
};

@injectable()
@scoped(Lifecycle.ContainerScoped)
export class TransactionExecutionService {
  private readonly transactionHooks: ProvableTransactionHook<unknown>[];

  private readonly blockHooks: ProvableBlockHook<unknown>[];

  private readonly runtimeMethodExecution: RuntimeMethodExecution;

  public constructor(
    @inject("Runtime") private readonly runtime: Runtime<RuntimeModulesRecord>,
    @inject("Protocol")
    private readonly protocol: Protocol<ProtocolModulesRecord>,
    private readonly executionContext: RuntimeMethodExecutionContext,
    // Coming in from the appchain scope (accessible by protocol & runtime)
    @inject("StateServiceProvider")
    private readonly stateServiceProvider: StateServiceProvider
  ) {
    this.transactionHooks = protocol.dependencyContainer.resolveAll(
      "ProvableTransactionHook"
    );
    this.blockHooks =
      protocol.dependencyContainer.resolveAll("ProvableBlockHook");

    this.runtimeMethodExecution = new RuntimeMethodExecution(
      this.runtime,
      this.protocol,
      this.runtime.dependencyContainer.resolve(RuntimeMethodExecutionContext)
    );
  }

  private allKeys(stateTransitions: StateTransition<unknown>[]): Field[] {
    // We have to do the distinct with strings because
    // array.indexOf() doesn't work with fields
    return stateTransitions.map((st) => st.path).filter(distinctByString);
  }

  private decodeTransaction(tx: PendingTransaction): {
    method: (...args: unknown[]) => unknown;
    args: unknown[];
    module: RuntimeModule<unknown>;
  } {
    const methodDescriptors = this.runtime.methodIdResolver.getMethodNameFromId(
      tx.methodId.toBigInt()
    );

    const method = this.runtime.getMethodById(tx.methodId.toBigInt());

    if (methodDescriptors === undefined || method === undefined) {
      throw errors.methodIdNotFound(tx.methodId.toString());
    }

    const [moduleName, methodName] = methodDescriptors;
    const module: RuntimeModule<unknown> = this.runtime.resolve(moduleName);

    const parameterDecoder = MethodParameterEncoder.fromMethod(
      module,
      methodName
    );
    const args = parameterDecoder.decode(tx.argsJSON);

    return {
      method,
      args,
      module,
    };
  }

  private getAppChainForModule(
    module: RuntimeModule<unknown>
  ): AreProofsEnabled {
    if (module.runtime === undefined) {
      throw new Error("Runtime on RuntimeModule not set");
    }
    if (module.runtime.appChain === undefined) {
      throw new Error("AppChain on Runtime not set");
    }
    const { appChain } = module.runtime;
    return appChain;
  }

  private executeRuntimeMethod(
    method: (...args: unknown[]) => unknown,
    args: unknown[],
    contextInputs: RuntimeMethodExecutionData
  ): RuntimeProvableMethodExecutionResult {
    // Set up context
    const executionContext = this.runtime.dependencyContainer.resolve(
      RuntimeMethodExecutionContext
    );
    executionContext.setup(contextInputs);

    // Execute method
    method(...args);

    const runtimeResult = executionContext.current().result;

    // Clear executionContext
    executionContext.afterMethod();
    executionContext.clear();

    return runtimeResult;
  }

  private executeProtocolHooks(
    runtimeContextInputs: RuntimeMethodExecutionData,
    blockContextInputs: BlockProverExecutionData,
    runUnchecked = false
  ): RuntimeProvableMethodExecutionResult {
    // Set up context
    const executionContext = this.runtime.dependencyContainer.resolve(
      RuntimeMethodExecutionContext
    );
    executionContext.setup(runtimeContextInputs);
    if (runUnchecked) {
      executionContext.setSimulated(true);
    }

    this.transactionHooks.forEach((transactionHook) => {
      transactionHook.onTransaction(blockContextInputs);
    });

    const protocolResult = executionContext.current().result;
    executionContext.afterMethod();
    executionContext.clear();

    return protocolResult;
  }

  /**
   * Main entry point for creating a unproven block with everything
   * attached that is needed for tracing
   */
  public async createUnprovenBlock(
    stateService: CachedStateService,
    transactions: PendingTransaction[],
    lastBlockWithMetadata: UnprovenBlockWithMetadata,
    allowEmptyBlocks: boolean
  ): Promise<UnprovenBlock | undefined> {
    const lastMetadata = lastBlockWithMetadata.metadata;
    const lastBlock = lastBlockWithMetadata.block;
    const executionResults: TransactionExecutionResult[] = [];

    const transactionsHashList = new DefaultProvableHashList(Field);
    const eternalTransactionsHashList = new DefaultProvableHashList(
      Field,
      Field(lastBlock.toEternalTransactionsHash)
    );

    const incomingMessagesList = new MinaActionsHashList(
      Field(lastBlock.toMessagesHash)
    );

    // Get used networkState by executing beforeBlock() hooks
    const networkState = this.blockHooks.reduce<NetworkState>(
      (reduceNetworkState, hook) =>
        hook.beforeBlock(reduceNetworkState, {
          blockHashRoot: Field(lastMetadata.blockHashRoot),
          eternalTransactionsHash: lastBlock.toEternalTransactionsHash,
          stateRoot: Field(lastMetadata.stateRoot),
          transactionsHash: Field(0),
          networkStateHash: lastMetadata.afterNetworkState.hash(),
          incomingMessagesHash: lastBlock.toMessagesHash,
        }),
      lastMetadata.afterNetworkState
    );

    for (const [index, tx] of transactions.entries()) {
      try {
        // Create execution trace
        // eslint-disable-next-line no-await-in-loop
        const executionTrace = await this.createExecutionTrace(
          stateService,
          tx,
          networkState
        );

        // Push result to results and transaction onto bundle-hash
        executionResults.push(executionTrace);
        if (!tx.isMessage) {
          transactionsHashList.push(tx.hash());
          eternalTransactionsHashList.push(tx.hash());
        } else {
          const actionHash = MinaActions.actionHash(
            tx.toRuntimeTransaction().hashData()
          );

          incomingMessagesList.push(actionHash);
        }
      } catch (error) {
        if (error instanceof Error) {
          log.error("Error in inclusion of tx, skipping", error);
        }
      }
    }

    if (executionResults.length === 0 && !allowEmptyBlocks) {
      log.info(
        "After sequencing, block has no sequencable transactions left, skipping block"
      );
      return undefined;
    }

    return {
      transactions: executionResults,
      transactionsHash: transactionsHashList.commitment,
      fromEternalTransactionsHash: lastBlock.toEternalTransactionsHash,
      toEternalTransactionsHash: eternalTransactionsHashList.commitment,
      height: lastBlock.height.add(1),
      fromBlockHashRoot: Field(lastMetadata.blockHashRoot),
      fromMessagesHash: lastBlock.toMessagesHash,
      toMessagesHash: incomingMessagesList.commitment,

      networkState: {
        before: new NetworkState(lastMetadata.afterNetworkState),
        during: networkState,
      },
    };
  }

  public async generateMetadataForNextBlock(
    block: UnprovenBlock,
    merkleTreeStore: CachedMerkleTreeStore,
    blockHashTreeStore: AsyncMerkleTreeStore,
    modifyTreeStore = true
  ): Promise<UnprovenBlockMetadata> {
    // Flatten diff list into a single diff by applying them over each other
    const combinedDiff = block.transactions
      .map((tx) => tx.stateDiff)
      .reduce<StateRecord>((accumulator, diff) => {
        // accumulator properties will be overwritten by diff's values
        return Object.assign(accumulator, diff);
      }, {});

    // If we modify the parent store, we use it, otherwise we abstract over it.
    const inMemoryStore = modifyTreeStore
      ? merkleTreeStore
      : new CachedMerkleTreeStore(merkleTreeStore);
    const tree = new RollupMerkleTree(inMemoryStore);
    const blockHashInMemoryStore = new CachedMerkleTreeStore(
      blockHashTreeStore
    );
    const blockHashTree = new BlockHashMerkleTree(blockHashInMemoryStore);

    for (const key of Object.keys(combinedDiff)) {
      // eslint-disable-next-line no-await-in-loop
      await inMemoryStore.preloadKey(BigInt(key));
    }
    // In case the diff is empty, we preload key 0 in order to
    // retrieve the root, which we need later
    if (Object.keys(combinedDiff).length === 0) {
      await inMemoryStore.preloadKey(0n);
    }

    // TODO This can be optimized a lot (we are only interested in the root at this step)
    await blockHashInMemoryStore.preloadKey(block.height.toBigInt());

    Object.entries(combinedDiff).forEach(([key, state]) => {
      const treeValue = state !== undefined ? Poseidon.hash(state) : Field(0);
      tree.setLeaf(BigInt(key), treeValue);
    });

    const stateRoot = tree.getRoot();
    const fromBlockHashRoot = blockHashTree.getRoot();

    const state: BlockProverState = {
      stateRoot,
      transactionsHash: block.transactionsHash,
      networkStateHash: block.networkState.during.hash(),
      eternalTransactionsHash: block.toEternalTransactionsHash,
      blockHashRoot: fromBlockHashRoot,
      incomingMessagesHash: block.toMessagesHash,
    };

    this.executionContext.clear();
    this.executionContext.setup({
      networkState: block.networkState.during,
      transaction: RuntimeTransaction.dummyTransaction(),
    });

    const resultingNetworkState = this.blockHooks.reduce<NetworkState>(
      (networkState, hook) => hook.afterBlock(networkState, state),
      block.networkState.during
    );

    const { stateTransitions } = this.executionContext.result;
    this.executionContext.clear();

    // Update the block hash tree with this block
    blockHashTree.setLeaf(
      block.height.toBigInt(),
      new BlockHashTreeEntry({
        transactionsHash: block.transactionsHash,
        closed: Bool(true),
      }).hash()
    );
    const blockHashWitness = blockHashTree.getWitness(block.height.toBigInt());
    const newBlockHashRoot = blockHashTree.getRoot();
    await blockHashInMemoryStore.mergeIntoParent();

    return {
      afterNetworkState: resultingNetworkState,
      stateRoot: stateRoot.toBigInt(),
      blockHashRoot: newBlockHashRoot.toBigInt(),
      blockHashWitness,

      blockStateTransitions: stateTransitions.map((st) =>
        UntypedStateTransition.fromStateTransition(st)
      ),
    };
  }

  private collectStateDiff(
    stateService: CachedStateService,
    stateTransitions: StateTransition<unknown>[]
  ): StateRecord {
    const keys = this.allKeys(stateTransitions);

    return keys.reduce<Record<string, Field[] | undefined>>((state, key) => {
      state[key.toString()] = stateService.get(key);
      return state;
    }, {});
  }

  private async applyTransitions(
    stateService: CachedStateService,
    stateTransitions: StateTransition<unknown>[]
  ): Promise<void> {
    await Promise.all(
      // Use updated stateTransitions since only they will have the
      // right values
      stateTransitions
        .filter((st) => st.to.isSome.toBoolean())
        .map(async (st) => {
          await stateService.setAsync(st.path, st.to.toFields());
        })
    );
  }

  // eslint-disable-next-line no-warning-comments
  // TODO Here exists a edge-case, where the protocol hooks set
  // some state that is then consumed by the runtime and used as a key.
  // In this case, runtime would generate a wrong key here.
  private async extractAccessedKeys(
    method: (...args: unknown[]) => unknown,
    args: unknown[],
    runtimeContextInputs: RuntimeMethodExecutionData,
    blockContextInputs: BlockProverExecutionData,
    parentStateService: AsyncStateService
  ): Promise<{
    runtimeKeys: Field[];
    protocolKeys: Field[];
  }> {
    // eslint-disable-next-line no-warning-comments
    // TODO unsafe to re-use params here?
    const stateTransitions =
      await this.runtimeMethodExecution.simulateMultiRound(
        () => {
          method(...args);
        },
        runtimeContextInputs,
        parentStateService
      );

    const protocolTransitions =
      await this.runtimeMethodExecution.simulateMultiRound(
        () => {
          this.transactionHooks.forEach((transactionHook) => {
            transactionHook.onTransaction(blockContextInputs);
          });
        },
        runtimeContextInputs,
        parentStateService
      );

    log.debug(`Got ${stateTransitions.length} StateTransitions`);
    log.debug(`Got ${protocolTransitions.length} ProtocolStateTransitions`);

    return {
      runtimeKeys: this.allKeys(stateTransitions),
      protocolKeys: this.allKeys(protocolTransitions),
    };
  }

  // eslint-disable-next-line max-statements
  private async createExecutionTrace(
    stateService: CachedStateService,
    tx: PendingTransaction,
    networkState: NetworkState
  ): Promise<TransactionExecutionResult> {
    const { method, args, module } = this.decodeTransaction(tx);

    // Disable proof generation for tracing
    const appChain = this.getAppChainForModule(module);
    const previousProofsEnabled = appChain.areProofsEnabled;
    appChain.setProofsEnabled(false);

    const signedTransaction = tx.toProtocolTransaction();
    const blockContextInputs: BlockProverExecutionData = {
      networkState,
      transaction: signedTransaction.transaction,
      signature: signedTransaction.signature,
    };
    const runtimeContextInputs = {
      transaction: blockContextInputs.transaction,
      networkState: blockContextInputs.networkState,
    };

    const { runtimeKeys, protocolKeys } = await this.extractAccessedKeys(
      method,
      args,
      runtimeContextInputs,
      blockContextInputs,
      stateService
    );

    // Preload keys
    await stateService.preloadKeys(
      runtimeKeys.concat(protocolKeys).filter(distinctByString)
    );

    // Execute second time with preloaded state. The following steps
    // generate and apply the correct STs with the right values
    this.stateServiceProvider.setCurrentStateService(stateService);

    const protocolResult = this.executeProtocolHooks(
      runtimeContextInputs,
      blockContextInputs
    );

    if (!protocolResult.status.toBoolean()) {
      throw new Error(
        `Protocol hooks not executable: ${
          protocolResult.statusMessage ?? "unknown"
        }`
      );
    }

    log.debug(
      "PSTs:",
      JSON.stringify(
        protocolResult.stateTransitions.map((x) => x.toJSON()),
        null,
        2
      )
    );

    // Apply protocol STs
    await this.applyTransitions(stateService, protocolResult.stateTransitions);

    let stateDiff = this.collectStateDiff(
      stateService,
      protocolResult.stateTransitions
    );

    const runtimeResult = this.executeRuntimeMethod(
      method,
      args,
      runtimeContextInputs
    );

    log.debug(
      "STs:",
      JSON.stringify(
        runtimeResult.stateTransitions.map((x) => x.toJSON()),
        null,
        2
      )
    );

    // Apply runtime STs (only if the tx succeeded)
    if (runtimeResult.status.toBoolean()) {
      await this.applyTransitions(stateService, runtimeResult.stateTransitions);

      stateDiff = this.collectStateDiff(
        stateService,
        protocolResult.stateTransitions.concat(runtimeResult.stateTransitions)
      );
    }

    // Reset global stateservice
    this.stateServiceProvider.popCurrentStateService();

    // Reset proofs enabled
    appChain.setProofsEnabled(previousProofsEnabled);

    return {
      tx,
      status: runtimeResult.status,
      statusMessage: runtimeResult.statusMessage,

      stateTransitions: runtimeResult.stateTransitions.map((st) =>
        UntypedStateTransition.fromStateTransition(st)
      ),

      protocolTransitions: protocolResult.stateTransitions.map((st) =>
        UntypedStateTransition.fromStateTransition(st)
      ),

      stateDiff,
    };
  }
}
