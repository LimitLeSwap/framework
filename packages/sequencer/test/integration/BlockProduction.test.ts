// eslint-disable-next-line max-len
/* eslint-disable jest/no-restricted-matchers,@typescript-eslint/no-non-null-assertion */
import "reflect-metadata";
// eslint-disable-next-line @typescript-eslint/no-shadow
import { beforeEach } from "@jest/globals";
import { Fieldable, InMemoryStateService, Runtime } from "@proto-kit/module";
// eslint-disable-next-line no-warning-comments
// TODO this is acutally a big issue
// eslint-disable-next-line import/no-extraneous-dependencies
import { AppChain } from "@proto-kit/sdk";
import { Path, VanillaProtocol } from "@proto-kit/protocol";
import { Bool, Field, PrivateKey, PublicKey, UInt64 } from "snarkyjs";
import { log } from "@proto-kit/common";

import { PrivateMempool } from "../../src/mempool/private/PrivateMempool";
import { LocalTaskQueue } from "../../src/worker/queue/LocalTaskQueue";
import { UnsignedTransaction } from "../../src/mempool/PendingTransaction";
import { Sequencer } from "../../src/sequencer/executor/Sequencer";
import {
  AsyncStateService,
  BlockProducerModule,
  ManualBlockTrigger,
  TaskQueue,
} from "../../src";
import { LocalTaskWorkerModule } from "../../src/worker/worker/LocalTaskWorkerModule";

import { Balance } from "./mocks/Balance";
import { NoopBaseLayer } from "../../src/protocol/baselayer/NoopBaseLayer";

describe("block production", () => {
  let runtime: Runtime<{ Balance: typeof Balance }>;
  let sequencer: Sequencer<{
    Mempool: typeof PrivateMempool;
    LocalTaskWorkerModule: typeof LocalTaskWorkerModule;
    BaseLayer: typeof NoopBaseLayer;
    BlockProducerModule: typeof BlockProducerModule;
    BlockTrigger: typeof ManualBlockTrigger;
  }>;

  let blockTrigger: ManualBlockTrigger;
  let mempool: PrivateMempool;

  beforeEach(async () => {
    log.setLevel("TRACE");

    runtime = Runtime.from({
      modules: {
        Balance,
      },

      config: {
        Balance: {},
      },

      state: new InMemoryStateService(),
    });

    sequencer = Sequencer.from({
      modules: {
        Mempool: PrivateMempool,
        LocalTaskWorkerModule,
        BaseLayer: NoopBaseLayer,
        BlockProducerModule,
        BlockTrigger: ManualBlockTrigger,
      },

      config: {
        BlockTrigger: {},
        Mempool: {},
        BlockProducerModule: {},
        LocalTaskWorkerModule: {},
        BaseLayer: {},
      },
    });

    sequencer.dependencyContainer.register<TaskQueue>("TaskQueue", {
      useValue: new LocalTaskQueue(0),
    });

    const app = AppChain.from({
      runtime,
      sequencer,
      protocol: VanillaProtocol.create(),
      modules: {},
    });

    // Start AppChain
    await app.start();

    blockTrigger = sequencer.resolve("BlockTrigger");
    mempool = sequencer.resolve("Mempool");
  });

  function createTransaction(spec: {
    privateKey: PrivateKey;
    method: [string, string];
    args: Fieldable[];
    nonce: number;
  }) {
    return new UnsignedTransaction({
      methodId: Field(runtime.getMethodId(spec.method[0], spec.method[1])),
      args: spec.args.flatMap((parameter) => parameter.toFields()),
      sender: spec.privateKey.toPublicKey(),
      nonce: UInt64.from(spec.nonce),
    }).sign(spec.privateKey);
  }

  // eslint-disable-next-line max-statements
  it("should produce a dummy block proof", async () => {
    expect.assertions(10);

    const privateKey = PrivateKey.random();
    const publicKey = privateKey.toPublicKey();

    mempool.add(
      createTransaction({
        method: ["Balance", "setBalanceIf"],
        privateKey,
        args: [publicKey, UInt64.from(100), Bool(true)],
        nonce: 0,
      })
    );

    let block = await blockTrigger.produceBlock();

    expect(block).toBeDefined();

    expect(block!.txs).toHaveLength(1);
    expect(block!.proof.proof).toBe("mock-proof");

    const stateService =
      sequencer.dependencyContainer.resolve<AsyncStateService>(
        "AsyncStateService"
      );
    const balanceModule = runtime.resolve("Balance");
    const balancesPath = Path.fromKey(
      balanceModule.balances.path!,
      balanceModule.balances.keyType,
      publicKey
    );
    const newState = await stateService.getAsync(balancesPath);

    expect(newState).toBeDefined();
    expect(UInt64.fromFields(newState!)).toStrictEqual(UInt64.from(100));

    // Second tx
    mempool.add(
      createTransaction({
        method: ["Balance", "addBalanceToSelf"],
        privateKey,
        args: [UInt64.from(100), UInt64.from(1)],
        nonce: 0,
      })
    );

    console.log("Starting second block");

    block = await blockTrigger.produceBlock();

    expect(block).toBeDefined();

    expect(block!.txs).toHaveLength(1);
    expect(block!.proof.proof).toBe("mock-proof");

    const state2 = await stateService.getAsync(balancesPath);

    expect(state2).toBeDefined();
    expect(UInt64.fromFields(state2!)).toStrictEqual(UInt64.from(200));
  }, 60_000);

  it("should reject tx and not apply the state", async () => {
    expect.assertions(3);

    const privateKey = PrivateKey.random();

    mempool.add(
      createTransaction({
        method: ["Balance", "setBalanceIf"],
        privateKey,
        args: [PublicKey.empty(), UInt64.from(100), Bool(false)],
        nonce: 0,
      })
    );

    let block = await blockTrigger.produceBlock();

    const stateService =
      sequencer.dependencyContainer.resolve<AsyncStateService>(
        "AsyncStateService"
      );
    const balanceModule = runtime.resolve("Balance");
    const balancesPath = Path.fromKey(
      balanceModule.balances.path!,
      balanceModule.balances.keyType,
      PublicKey.empty()
    );
    const newState = await stateService.getAsync(balancesPath);

    // Assert that state is not set
    expect(newState).toBeUndefined();

    expect(block?.txs[0].status).toBe(false);
    expect(block?.txs[0].statusMessage).toBe("Condition not met");
  }, 30_000);
});
