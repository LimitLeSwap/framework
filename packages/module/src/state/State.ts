/* eslint-disable max-classes-per-file */
/* eslint-disable new-cap */
/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */

import { Mixin } from 'ts-mixer';
import {
  Bool,
  Circuit,
  Field,
  type FlexibleProvablePure,
} from 'snarkyjs';
import { container } from 'tsyringe';

import { Option } from '@yab/protocol';
import {
  StateTransition,
} from '@yab/protocol';
import type { Path } from '@yab/protocol';
import { MethodExecutionContext } from '../method/MethodExecutionContext.js';
import type { Chain, RuntimeModules } from '../chain/Chain.js';

export class WithPath {
  public path?: Field;

  public hasPathOrFail(): asserts this is { path: Path } {
    if (!this.path) {
      throw new Error(
        `Could not find 'path', did you forget to add '@state' to your state property?`
      );
    }
  }
}

// eslint-disable-next-line import/no-unused-modules
export class WithChain {
  public chain?: Chain<RuntimeModules>;

  public hasChainOrFail(): asserts this is { chain: Chain<RuntimeModules> } {
    if (!this.chain) {
      throw new Error(
        `Could not find 'chain', did you forget to add '@state' to your state property?`
      );
    }
  }
}

/**
 * Utilities for runtime module state, such as get/set
 */
export class State<Value> extends Mixin(WithPath, WithChain) {
  /**
   * Creates a new state wrapper for the provided value type.
   *
   * @param valueType - Type of value to be stored (e.g. UInt64, Struct, ...)
   * @returns New state for the given value type.
   */
  public static from<Value>(valueType: FlexibleProvablePure<Value>) {
    return new State<Value>(valueType);
  }

  /**
   * Computes a dummy value for the given value type.
   *
   * @param valueType - Value type to generate the dummy value for
   * @returns Dummy value for the given value type
   */
  public static dummyValue<Value>(
    valueType: FlexibleProvablePure<Value>
  ): Value {
    const length = valueType.sizeInFields();
    const fields = Array.from({ length }, () => Field(0));

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return valueType.fromFields(fields) as Value;
  }

  public constructor(public valueType: FlexibleProvablePure<Value>) {
    super();
  }

  /**
   * Provides an in-circuit witness for the current state representation,
   * and constructs an Option out of it.
   *
   * @returns Optional value of the current state
   */
  private witnessState() {
    // get the value from storage, or return a dummy value instead
    const value = Circuit.witness(this.valueType, () => {
      this.hasChainOrFail();
      this.hasPathOrFail();

      const fields = this.chain.config.state.get(this.path);
      if (fields) {
        // eslint-disable-next-line max-len
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return this.valueType.fromFields(fields) as Value;
      }

      return State.dummyValue(this.valueType);
    });

    // check if the value exists in the storage or not
    const isSome = Circuit.witness(Bool, () => {
      this.hasChainOrFail();
      this.hasPathOrFail();

      const fields = this.chain.config.state.get(this.path);

      return Bool(fields !== undefined);
    });

    return Option.from(isSome, value, this.valueType);
  }

  /**
   * Retrieves the current state and creates a state transition
   * anchoring the use of the current state value in the circuit.
   *
   * @returns Option representation of the current state.
   */
  public get(): Option<Value> {
    const option = this.witnessState();

    this.hasPathOrFail();

    const stateTransition = StateTransition.from(this.path, option);

    container
      .resolve(MethodExecutionContext)
      .addStateTransition(stateTransition);

    return option;
  }

  /**
   * Sets a new state value by creating a state transition from
   * the current value to the newly set value.
   *
   * The newly set value isn't available via state.get(), since the
   * state transitions are not applied within the same circuit.
   * You can however store and access your new value in
   * a separate circuit variable.
   *
   * @param value - Value to be set as the current state
   */
  public set(value: Value) {
    // link the transition to the current state
    const fromOption = this.witnessState();
    const toOption = Option.from(Bool(true), value, this.valueType);

    this.hasPathOrFail();

    const stateTransition = StateTransition.fromTo(
      this.path,
      fromOption,
      toOption,
      value
    );

    container
      .resolve(MethodExecutionContext)
      .addStateTransition(stateTransition);
  }
}
