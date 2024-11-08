import "reflect-metadata";
import {
  AppChain,
  BlockStorageNetworkStateModule,
  InMemorySigner,
  InMemoryTransactionSender,
  StateServiceQueryModule,
} from "@proto-kit/sdk";
import {
  Runtime,
  runtimeMethod,
  runtimeModule,
  state,
} from "@proto-kit/module";
import { Protocol, State } from "@proto-kit/protocol";
import {
  Balance,
  VanillaProtocolModules,
  VanillaRuntimeModules,
  Balances as BaseBalances,
  TokenId,
} from "@proto-kit/library";
import { PrismaRedisDatabase } from "@proto-kit/persistance";
import { NoConfig, log } from "@proto-kit/common";
import { PrivateKey, PublicKey } from "o1js";

import {
  BlockProducerModule,
  DatabasePruneModule,
  LocalTaskQueue,
  ManualBlockTrigger,
  Sequencer,
} from "../src";
// we import PrivateMempool from dist to satisfy constraints of InMemoryTransactionSender
import { PrivateMempool } from "../dist";

@runtimeModule()
export class Balances extends BaseBalances<NoConfig> {
  @state() public circulatingSupply = State.from<Balance>(Balance);

  @runtimeMethod()
  public async addBalance(
    tokenId: TokenId,
    address: PublicKey,
    amount: Balance
  ): Promise<void> {
    await this.mint(tokenId, address, amount);
  }
}

export async function duration<Result>(cb: () => Promise<Result>) {
  const startTime = performance.now();
  const result = await cb();

  return {
    duration: performance.now() - startTime,
    result,
  };
}

export async function createAppChain() {
  const appChain = AppChain.from({
    Runtime: Runtime.from({
      modules: VanillaRuntimeModules.with({
        Balances,
      }),
    }),
    Protocol: Protocol.from({
      modules: VanillaProtocolModules.with({}),
    }),
    Sequencer: Sequencer.from({
      modules: {
        Database: PrismaRedisDatabase,
        Mempool: PrivateMempool,
        BlockProducerModule: BlockProducerModule,
        TaskQueue: LocalTaskQueue,
        DatabasePruneModule: DatabasePruneModule,
        BlockTrigger: ManualBlockTrigger,
      },
    }),
    modules: {
      Signer: InMemorySigner,
      TransactionSender: InMemoryTransactionSender,
      QueryTransportModule: StateServiceQueryModule,
      NetworkStateTransportModule: BlockStorageNetworkStateModule,
    },
  });

  appChain.configure({
    Runtime: {
      Balances: {},
    },
    Protocol: {
      ...VanillaProtocolModules.defaultConfig(),
    },
    Sequencer: {
      DatabasePruneModule: {
        pruneOnStartup: false,
      },
      Database: {
        redis: {
          host: "localhost",
          port: 6379,
          password: "password",
        },
        prisma: {
          connection:
            "postgresql://admin:password@localhost:5432/protokit?schema=public",
        },
      },
      BlockProducerModule: {},
      BlockTrigger: {},
      Mempool: {},
      TaskQueue: {},
    },
    Signer: {
      signer: PrivateKey.random(),
    },
    QueryTransportModule: {},
    TransactionSender: {},
    NetworkStateTransportModule: {},
  });

  await appChain.start();

  return appChain;
}

const timeout = 600000;

// TODO: make this run in CI
// run this first in stack:
// docker compose up --build
// and then from sequencer:
// npx dotenv-cli -e ./../stack/.env -- npm run prisma:migrate
describe("tps", () => {
  let appChain: Awaited<ReturnType<typeof createAppChain>>;
  let privateKeys: PrivateKey[] = [];
  let balances: Balances;

  async function mint(signer: PrivateKey, amount: number, nonce: number = 0) {
    appChain.resolve("Signer").config.signer = signer;

    const address = signer.toPublicKey();
    const tx = await appChain.transaction(
      address,
      async () => {
        await balances.addBalance(
          TokenId.from(0),
          address,
          Balance.from(amount)
        );
      },
      {
        nonce,
      }
    );

    await tx.sign();
    await tx.send();
  }

  async function fundKeys(totalKeys: number) {
    const batchSize = 20;

    for (let i = 0; i < totalKeys / batchSize; i++) {
      for (let j = 0; j < batchSize; j++) {
        const privateKey = PrivateKey.random();
        privateKeys.push(privateKey);
        await mint(privateKey, 100_000);
      }
      await appChain.sequencer.resolve("BlockTrigger").produceBlock();
    }
  }

  beforeEach(async () => {
    appChain = await createAppChain();

    const db = appChain.sequencer.resolve("Database");
    await db.pruneDatabase();

    balances = appChain.runtime.resolve("Balances");

    await fundKeys(200);
    // log.enableTiming();
  }, timeout);

  it("should produce an empty block", async () => {
    const produceBlockDuration = await duration(async () => {
      return await appChain.sequencer.resolve("BlockTrigger").produceBlock();
    });

    expect(produceBlockDuration.duration).toBeLessThan(200);
  });

  it(
    "should produce a block with unique txs",
    async () => {
      console.log("should produce a block with unique txs");
      const transactionCount = 100;
      for (let i = 0; i < transactionCount; i++) {
        const fromPrivateKey = privateKeys[0];
        const toPrivateKey = privateKeys[1];
        privateKeys.splice(0, 2);

        appChain.resolve("Signer").config.signer = fromPrivateKey;

        const from = fromPrivateKey.toPublicKey();
        const to = toPrivateKey.toPublicKey();

        const tx = await appChain.transaction(
          from,
          // eslint-disable-next-line @typescript-eslint/no-loop-func
          async () => {
            await balances.transferSigned(
              TokenId.from(0),
              from,
              to,
              Balance.from(1)
            );
          }
        );

        await tx.sign();
        await tx.send();
      }

      const produceBlockDuration = await duration(async () => {
        return await appChain.sequencer.resolve("BlockTrigger").produceBlock();
      });

      console.log("txs", produceBlockDuration.result?.transactions.length);

      const tps = transactionCount / (produceBlockDuration.duration / 1000);

      console.log("duration multiple txs", produceBlockDuration.duration);
      console.log("tps with state unique txs", tps);

      expect(tps).toBeGreaterThan(2.5);
    },
    timeout
  );

  it("should produce a block with state cachable txs", async () => {
    const transactionCount = 100;

    const fromPrivateKey = privateKeys[0];
    const from = fromPrivateKey.toPublicKey();
    const toPrivateKey = privateKeys[1];
    const to = toPrivateKey.toPublicKey();

    appChain.resolve("Signer").config.signer = fromPrivateKey;

    for (let i = 0; i < transactionCount; i++) {
      const tx = await appChain.transaction(
        from,
        // eslint-disable-next-line @typescript-eslint/no-loop-func
        async () => {
          await balances.transferSigned(
            TokenId.from(0),
            from,
            to,
            Balance.from(1)
          );
        },
        { nonce: i }
      );

      await tx.sign();
      await tx.send();
    }

    const produceBlockDuration = await duration(async () => {
      return await appChain.sequencer.resolve("BlockTrigger").produceBlock();
    });

    const tps = transactionCount / (produceBlockDuration.duration / 1000);

    console.log("duration multiple txs", produceBlockDuration.duration);
    console.log("tps with state cachable txs", tps);

    expect(tps).toBeGreaterThan(10);
  }, 600000);

  afterEach(async () => {
    privateKeys = [];
    log.disableTiming();
    const db = appChain.sequencer.resolve("Database");
    await db.close();
  });
});
