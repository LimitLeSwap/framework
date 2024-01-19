import { inject } from "tsyringe";
import {
  BlockProverPublicInput,
  BlockProverPublicOutput,
  DefaultProvableHashList,
  NetworkState,
  BlockHashMerkleTreeWitness,
} from "@proto-kit/protocol";
import { Field, Proof } from "o1js";
import { log, noop, RollupMerkleTree } from "@proto-kit/common";

import {
  sequencerModule,
  SequencerModule,
} from "../../sequencer/builder/SequencerModule";
import { BaseLayer } from "../baselayer/BaseLayer";
import { BlockStorage } from "../../storage/repositories/BlockStorage";
import { ComputedBlock } from "../../storage/model/Block";
import { CachedStateService } from "../../state/state/CachedStateService";
import { CachedMerkleTreeStore } from "../../state/merkle/CachedMerkleTreeStore";
import { AsyncStateService } from "../../state/async/AsyncStateService";
import { AsyncMerkleTreeStore } from "../../state/async/AsyncMerkleTreeStore";

import { BlockProverParameters } from "./tasks/BlockProvingTask";
import { StateTransitionProofParameters } from "./tasks/StateTransitionTaskParameters";
import { RuntimeProofParameters } from "./tasks/RuntimeTaskParameters";
import { TransactionTraceService } from "./TransactionTraceService";
import { BlockTaskFlowService } from "./BlockTaskFlowService";
import {
  UnprovenBlock,
  UnprovenBlockMetadata,
  UnprovenBlockWithMetadata,
} from "./unproven/TransactionExecutionService";
import { NewBlockProverParameters } from "./tasks/NewBlockTask";

export interface StateRecord {
  [key: string]: Field[] | undefined;
}

export interface TransactionTrace {
  runtimeProver: RuntimeProofParameters;
  stateTransitionProver: StateTransitionProofParameters[];
  blockProver: BlockProverParameters;
}

export interface BlockTrace {
  block: NewBlockProverParameters;
  stateTransitionProver: StateTransitionProofParameters[];
  transactions: TransactionTrace[];
}

export interface UnprovenBlockWithPreviousMetadata {
  block: UnprovenBlockWithMetadata;
  lastBlockMetadata?: UnprovenBlockMetadata;
}

interface ComputedBlockMetadata {
  block: ComputedBlock;
  stateService: CachedStateService;
  merkleStore: CachedMerkleTreeStore;
}

const errors = {
  blockWithoutTxs: () =>
    new Error("Can't create a block with zero transactions"),
};

/**
 * The BlockProducerModule has the resposiblity to oversee the block production
 * and combine all necessary parts for that to happen. The flow roughly follows
 * the following steps:
 *
 * 1. BlockTrigger triggers and executes the startup function
 * 2.
 */
@sequencerModule()
export class BlockProducerModule extends SequencerModule {
  private productionInProgress = false;

  public constructor(
    @inject("AsyncStateService")
    private readonly asyncStateService: AsyncStateService,
    @inject("AsyncMerkleStore")
    private readonly merkleStore: AsyncMerkleTreeStore,
    @inject("BaseLayer") private readonly baseLayer: BaseLayer,
    @inject("BlockStorage") private readonly blockStorage: BlockStorage,
    @inject("BlockTreeStore")
    private readonly blockTreeStore: AsyncMerkleTreeStore,
    private readonly traceService: TransactionTraceService,
    private readonly blockFlowService: BlockTaskFlowService
  ) {
    super();
  }

  private async applyStateChanges(
    unprovenBlocks: UnprovenBlock[],
    block: ComputedBlockMetadata
  ) {
    await block.stateService.mergeIntoParent();
    await block.merkleStore.mergeIntoParent();
  }

  /**
   * Main function to call when wanting to create a new block based on the
   * transactions that are present in the mempool. This function should also
   * be the one called by BlockTriggers
   */
  public async createBlock(
    unprovenBlocks: UnprovenBlockWithPreviousMetadata[]
  ): Promise<ComputedBlock | undefined> {
    log.info("Producing batch...");

    const blockMetadata = await this.tryProduceBlock(unprovenBlocks);

    if (blockMetadata !== undefined) {
      log.info(
        `Batch produced (${blockMetadata.block.bundles.length} bundles, ${
          blockMetadata.block.bundles.flat(1).length
        } txs)`
      );
      // Apply state changes to current StateService
      await this.applyStateChanges(
        unprovenBlocks.map((data) => data.block.block),
        blockMetadata
      );

      // Mock for now
      await this.blockStorage.pushBlock(blockMetadata.block);

      // Broadcast result on to baselayer
      await this.baseLayer.blockProduced(blockMetadata.block);
      log.info("Batch submitted onto baselayer");
    }
    return blockMetadata?.block;
  }

  public async start(): Promise<void> {
    noop();
  }

  private async tryProduceBlock(
    unprovenBlocks: UnprovenBlockWithPreviousMetadata[]
  ): Promise<ComputedBlockMetadata | undefined> {
    if (!this.productionInProgress) {
      try {
        return await this.produceBlock(unprovenBlocks);
      } catch (error: unknown) {
        if (error instanceof Error) {
          if (
            !error.message.includes(
              "Can't create a block with zero transactions"
            )
          ) {
            log.error(error);
          }

          this.productionInProgress = false;
          throw error;
        } else {
          log.error(error);
        }
      }
    } else {
      log.debug(
        "Skipping new block production because production is still in progress"
      );
    }
    return undefined;
  }

  private async produceBlock(
    unprovenBlocks: UnprovenBlockWithPreviousMetadata[]
  ): Promise<ComputedBlockMetadata | undefined> {
    this.productionInProgress = true;

    const blockId = unprovenBlocks[0].block.block.height.toBigInt();

    const block = await this.computeBlock(unprovenBlocks, Number(blockId));

    this.productionInProgress = false;

    const computedBundles = unprovenBlocks.map((bundle) =>
      bundle.block.block.transactions.map((tx) => {
        return {
          tx: tx.tx,
          status: tx.status.toBoolean(),
          statusMessage: tx.statusMessage,
        };
      })
    );

    return {
      block: {
        proof: block.proof,
        bundles: computedBundles,
      },

      stateService: block.stateService,
      merkleStore: block.merkleStore,
    };
  }

  /**
   * Very naive impl for now
   *
   * How we produce Blocks (batches):
   *
   * 1. We get all pending txs from the mempool and define an order
   * 2. We execute them to get results / intermediate state-roots.
   * We define a tuple of (tx data (methodId, args), state-input, state-output)
   * as a "tx trace"
   * 3. We create tasks based on those traces
   *
   */
  private async computeBlock(
    bundles: UnprovenBlockWithPreviousMetadata[],
    blockId: number
  ): Promise<{
    proof: Proof<BlockProverPublicInput, BlockProverPublicOutput>;
    stateService: CachedStateService;
    merkleStore: CachedMerkleTreeStore;
  }> {
    if (bundles.length === 0 || bundles.flat(1).length === 0) {
      throw errors.blockWithoutTxs();
    }

    const stateServices = {
      stateService: new CachedStateService(this.asyncStateService),
      merkleStore: new CachedMerkleTreeStore(this.merkleStore),
    };

    const blockTraces: BlockTrace[] = [];

    const eternalBundleTracker = new DefaultProvableHashList(
      Field,
      bundles[0].block.block.fromEternalTransactionsHash
    );

    for (const bundleWithMetadata of bundles) {
      const block = bundleWithMetadata.block.block;
      const txs = block.transactions;

      const bundleTracker = new DefaultProvableHashList(Field);

      const transactionTraces: TransactionTrace[] = [];

      for (const [index, tx] of txs.entries()) {
        // eslint-disable-next-line no-await-in-loop
        const result = await this.traceService.createTransactionTrace(
          tx,
          stateServices,
          block.networkState.during,
          bundleTracker,
          eternalBundleTracker
        );

        transactionTraces.push(result);
      }

      // eslint-disable-next-line no-await-in-loop
      const blockTrace = await this.traceService.createBlockTrace(
        transactionTraces,
        stateServices,
        this.blockTreeStore,
        Field(bundleWithMetadata.lastBlockMetadata?.stateRoot ?? RollupMerkleTree.EMPTY_ROOT),
        bundleWithMetadata.block
      );
      blockTraces.push(blockTrace);
    }

    const proof = await this.blockFlowService.executeFlow(blockTraces, blockId);

    return {
      proof,
      stateService: stateServices.stateService,
      merkleStore: stateServices.merkleStore,
    };
  }
}
