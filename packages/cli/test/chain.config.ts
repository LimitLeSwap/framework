/* eslint-disable import/no-unused-modules */
import { ModulesConfig, Presets, TypedClass } from "@proto-kit/common";
import {
  Runtime,
  runtimeMethod,
  RuntimeModule,
  runtimeModule,
  RuntimeModulesRecord,
  state,
} from "@proto-kit/module";
import { Option, State, StateMap } from "@proto-kit/protocol";
import { PublicKey, Field } from "o1js";
import { LocalhostAppChain } from "./../src/LocalhostAppChain";
import { UInt64 } from "packages/library/dist/math/UInt64";

@runtimeModule()
export class Balances extends RuntimeModule<object> {
  /**
   * We use `satisfies` here in order to be able to access
   * presets by key in a type safe way.
   */
  public static presets = {} satisfies Presets<object>;

  @state() public balances = StateMap.from<PublicKey, UInt64>(
    PublicKey,
    UInt64
  );

  @state() public totalSupply = State.from<UInt64>(UInt64);

  @runtimeMethod()
  public getBalance(address: PublicKey): Option<UInt64> {
    return this.balances.get(address);
  }

  @runtimeMethod()
  public setBalance(address: PublicKey, balance: UInt64) {
    this.balances.set(address, balance);
  }
}

const appChain = LocalhostAppChain.fromRuntime({
  Balances,
});

appChain.configurePartial({
  Runtime: {
    Balances: {},
  },
});

export default appChain;
