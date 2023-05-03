/* eslint-disable @typescript-eslint/naming-convention */
import 'reflect-metadata';
import { Poseidon, PrivateKey, PublicKey, UInt64, isReady } from 'snarkyjs';

import { ProvableStateTransition } from '../../src/stateTransition/StateTransition.js';
import { Balances } from './Balances.js';
import { Path } from '../../src/path/Path.js';
import { State } from '../../src/state/State.js';
import { Option } from '../../src/option/Option.js';
import { container } from 'tsyringe';
import { Chain } from '../../src/chain/Chain.js';
import { Admin } from './Admin.js';
import { MethodExecutionContext } from '../../src/method/MethodExecutionContext.js';

import log from 'loglevel';

log.enableAll();

describe('balances', () => {
  // eslint-disable-next-line @typescript-eslint/init-declarations
  let balances: Balances;

  beforeEach(() => {
    const chain = Chain.from({
      Balances,
      Admin,
    });
    balances = chain.getRuntimeModule('Balances');
  });

  describe('getTotalSupply', () => {
    describe('state transitions', () => {
      // eslint-disable-next-line @typescript-eslint/init-declarations
      let stateTransitions: ProvableStateTransition[];

      beforeEach(() => {
        const executionContext = container.resolve(MethodExecutionContext);
        balances.getTotalSupply();
        stateTransitions = executionContext.result.stateTransitions;
      });

      it('should return a single state transition', () => {
        expect.assertions(1);
        expect(stateTransitions).toHaveLength(1);
      });

      it('should have a state transition for the correct path', () => {
        expect.assertions(1);

        const path = Path.fromProperty('Balances', 'totalSupply');

        expect(stateTransitions[0].path.toString()).toStrictEqual(
          path.toString()
        );
      });

      it('should produce a from-only state transition', () => {
        expect.assertions(3);

        const [stateTransition] = stateTransitions;
        const value = State.dummyValue<UInt64>(UInt64);
        const treeValue = Poseidon.hash(value.toFields());

        expect(stateTransition.from.isSome.toBoolean()).toBe(true);
        expect(stateTransition.from.value.toString()).toBe(
          treeValue.toString()
        );
        expect(stateTransition.to.isSome.toBoolean()).toBe(false);
      });
    });
  });

  describe('setTotalSupply', () => {
    describe('state transitions', () => {
      // eslint-disable-next-line @typescript-eslint/init-declarations
      let stateTransitions: ProvableStateTransition[];

      beforeEach(() => {
        const executionContext = container.resolve(MethodExecutionContext);
        balances.setTotalSupply();
        stateTransitions = executionContext.result.stateTransitions;
      });

      it('should return a single state transition', () => {
        expect.assertions(1);
        expect(stateTransitions).toHaveLength(1);
      });

      it('should have a state transition for the correct path', () => {
        expect.assertions(1);

        const path = Path.fromProperty('Balances', 'totalSupply');

        expect(stateTransitions[0].path.toString()).toStrictEqual(
          path.toString()
        );
      });

      it('should produce a from-to state transition', () => {
        expect.assertions(4);

        const [stateTransition] = stateTransitions;
        const fromValue = State.dummyValue<UInt64>(UInt64);
        const fromTreeValue = Poseidon.hash(fromValue.toFields());

        const toValue = UInt64.from(20);
        const toTreeValue = Poseidon.hash(toValue.toFields());

        expect(stateTransition.from.isSome.toBoolean()).toBe(true);
        expect(stateTransition.from.value.toString()).toBe(
          fromTreeValue.toString()
        );

        expect(stateTransition.to.isSome.toBoolean()).toBe(true);
        expect(stateTransition.to.value.toString()).toBe(
          toTreeValue.toString()
        );
      });
    });
  });

  describe('getBalance', () => {
    describe('state transitions', () => {
      // eslint-disable-next-line @typescript-eslint/init-declarations
      let stateTransitions: ProvableStateTransition[];
      let balance: Option<UInt64>;
      const address = PrivateKey.random().toPublicKey();

      beforeEach(() => {
        const executionContext = container.resolve(MethodExecutionContext);
        balances.getBalance(address);
        stateTransitions = executionContext.result.stateTransitions;
      });

      it('should return a single state transition', () => {
        expect.assertions(1);
        expect(stateTransitions).toHaveLength(1);
      });

      it('should have a state transition for the correct path', () => {
        expect.assertions(1);

        const path = Path.fromKey<PublicKey>(
          Path.fromProperty('Balances', 'balances'),
          PublicKey,
          address
        );

        expect(stateTransitions[0].path.toString()).toStrictEqual(
          path.toString()
        );
      });

      it('should produce a from-only state transition', () => {
        expect.assertions(3);

        const [stateTransition] = stateTransitions;
        const value = State.dummyValue<UInt64>(UInt64);
        const treeValue = Poseidon.hash(value.toFields());

        expect(stateTransition.from.isSome.toBoolean()).toBe(true);
        expect(stateTransition.from.value.toString()).toBe(
          treeValue.toString()
        );
        expect(stateTransition.to.isSome.toBoolean()).toBe(false);
      });
    });
  });
});
