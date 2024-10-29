import "reflect-metadata";

import { runtimeMethod, runtimeModule, RuntimeModule } from "@proto-kit/module";
import { PrivateKey } from "o1js";
import { expectDefined, noop } from "@proto-kit/common";
import { inject } from "tsyringe";
import { Balance, Balances, BalancesKey, TokenId } from "@proto-kit/library";

import { TestingAppChain } from "../src";

// This test is designed to check what happens when we have multiple zkPrograms.
// Currently, the hardcoded maximum for methods per zkProgram is 8 (see Runtime.ts).
// We will create 20 runtime methods to ensure 2 zkPrograms are created.

@runtimeModule()
class TestModule1 extends RuntimeModule<unknown> {
  @runtimeMethod()
  public async Method_1() {
    noop();
  }

  @runtimeMethod()
  public async Method_2() {
    noop();
  }

  @runtimeMethod()
  public async Method_3() {
    noop();
  }

  @runtimeMethod()
  public async Method_4() {
    noop();
  }

  @runtimeMethod()
  public async Method_5() {
    noop();
  }

  @runtimeMethod()
  public async Method_6() {
    noop();
  }

  @runtimeMethod()
  public async Method_7() {
    noop();
  }

  @runtimeMethod()
  public async Method_8() {
    noop();
  }

  @runtimeMethod()
  public async Method_9() {
    noop();
  }

  @runtimeMethod()
  public async Method_10() {
    noop();
  }
}

@runtimeModule()
class TestModule2 extends RuntimeModule<unknown> {
  @runtimeMethod()
  public async Method_1() {
    noop();
  }

  @runtimeMethod()
  public async Method_2() {
    noop();
  }

  @runtimeMethod()
  public async Method_3() {
    noop();
  }

  @runtimeMethod()
  public async Method_4() {
    noop();
  }

  @runtimeMethod()
  public async Method_5() {
    noop();
  }

  @runtimeMethod()
  public async Method_6() {
    noop();
  }

  @runtimeMethod()
  public async Method_7() {
    noop();
  }

  @runtimeMethod()
  public async Method_8() {
    noop();
  }

  @runtimeMethod()
  public async Method_9() {
    noop();
  }

  @runtimeMethod()
  public async Method_10() {
    noop();
  }
}

@runtimeModule()
class Faucet extends RuntimeModule<unknown> {
  public constructor(@inject("Balances") public balances: Balances) {
    super();
  }

  @runtimeMethod()
  public async drip() {
    await this.balances.mint(
      TokenId.from(0),
      this.transaction.sender.value,
      Balance.from(1000)
    );
  }
}

describe("check fee analyzer", () => {
  const feeRecipientKey = PrivateKey.random();
  const senderKey = PrivateKey.random();

  const appChain = TestingAppChain.fromRuntime({
    TestModule1,
    TestModule2,
    Faucet,
  });

  beforeAll(async () => {
    appChain.configurePartial({
      Runtime: {
        TestModule1,
        TestModule2,
        Faucet,
        Balances,
      },

      Protocol: {
        ...appChain.config.Protocol!,
        TransactionFee: {
          tokenId: 0n,
          feeRecipient: feeRecipientKey.toPublicKey().toBase58(),
          baseFee: 0n,
          perWeightUnitFee: 0n,
          methods: {
            "TestModule1.Method_1": {
              baseFee: 10n,
              weight: 0n,
              perWeightUnitFee: 0n,
            },
            "TestModule1.Method_10": {
              baseFee: 10n,
              weight: 0n,
              perWeightUnitFee: 0n,
            },
            "TestModule2.Method_4": {
              baseFee: 10n,
              weight: 0n,
              perWeightUnitFee: 0n,
            },
            "TestModule2.Method_7": {
              baseFee: 10n,
              weight: 0n,
              perWeightUnitFee: 0n,
            },
          },
        },
      },
    });

    await appChain.start();
    appChain.setSigner(senderKey);
  });

  it("with multiple zk programs", async () => {
    expect.assertions(4);
    const testModule1 = appChain.runtime.resolve("TestModule1");
    const testModule2 = appChain.runtime.resolve("TestModule2");
    const faucet = appChain.runtime.resolve("Faucet");

    const tx1 = await appChain.transaction(
      senderKey.toPublicKey(),
      async () => {
        await faucet.drip();
      }
    );

    await tx1.sign();
    await tx1.send();

    await appChain.produceBlock();

    const tx2 = await appChain.transaction(
      senderKey.toPublicKey(),
      async () => {
        await testModule1.Method_1();
      }
    );

    await tx2.sign();
    await tx2.send();

    const tx3 = await appChain.transaction(
      senderKey.toPublicKey(),
      async () => {
        await testModule2.Method_4();
      }
    );

    await tx3.sign();
    await tx3.send();

    const tx4 = await appChain.transaction(
      senderKey.toPublicKey(),
      async () => {
        await testModule2.Method_7();
      }
    );

    await tx4.sign();
    await tx4.send();

    const tx5 = await appChain.transaction(
      senderKey.toPublicKey(),
      async () => {
        await testModule1.Method_10();
      }
    );

    await tx5.sign();
    await tx5.send();

    await appChain.produceBlock();

    const senderBalance = await appChain.query.runtime.Balances.balances.get(
      new BalancesKey({
        tokenId: new TokenId(0),
        address: senderKey.toPublicKey(),
      })
    );

    const feeRecipientBalance =
      await appChain.query.runtime.Balances.balances.get(
        new BalancesKey({
          tokenId: new TokenId(0),
          address: feeRecipientKey.toPublicKey(),
        })
      );

    expectDefined(senderBalance);
    expect(senderBalance.toString()).toBe("990");

    expectDefined(feeRecipientBalance);
    expect(feeRecipientBalance.toString()).toBe("10");
  });
});
