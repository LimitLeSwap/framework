import { Bool, PublicKey, UInt64 } from "o1js";
import { Option, State, StateMap } from "@proto-kit/protocol";
import { Presets } from "@proto-kit/common";

import { RuntimeModule, runtimeMethod, runtimeModule, state } from "../../src";

import { Admin } from "./Admin.js";

interface BalancesConfig {}

@runtimeModule()
export class Balances extends RuntimeModule<BalancesConfig> {
  /**
   * We use `satisfies` here in order to be able to access
   * presets by key in a type safe way.
   */
  public static presets = {} satisfies Presets<BalancesConfig>;

  @state() public totalSupply = State.from<UInt64>(UInt64);

  @state() public balances = StateMap.from<PublicKey, UInt64>(
    PublicKey,
    UInt64
  );

  public constructor(public admin: Admin) {
    super();
  }

  @runtimeMethod()
  public getTotalSupply() {
    this.totalSupply.get();
  }

  @runtimeMethod()
  public setTotalSupply() {
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    this.totalSupply.set(UInt64.from(20));
    this.admin.isAdmin(this.transaction.sender.value);
  }

  @runtimeMethod()
  public getBalance(address: PublicKey): Option<UInt64> {
    return this.balances.get(address);
  }

  @runtimeMethod()
  public transientState() {
    const totalSupply = this.totalSupply.get();
    this.totalSupply.set(totalSupply.orElse(UInt64.zero).add(100));

    const totalSupply2 = this.totalSupply.get();
    this.totalSupply.set(totalSupply2.orElse(UInt64.zero).add(100));
  }
}
