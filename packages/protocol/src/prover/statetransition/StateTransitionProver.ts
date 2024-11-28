import {
  AreProofsEnabled,
  LinkedLeafStruct,
  PlainZkProgram,
  provableMethod,
  ZkProgrammable,
} from "@proto-kit/common";
import { Bool, Field, Provable, SelfProof, ZkProgram } from "o1js";
import { injectable } from "tsyringe";
import { LinkedMerkleTreeWitness } from "@proto-kit/common/dist/trees/LinkedMerkleTree";

import { constants } from "../../Constants";
import { ProvableStateTransition } from "../../model/StateTransition";
import {
  ProvableStateTransitionType,
  StateTransitionProvableBatch,
} from "../../model/StateTransitionProvableBatch";
import { StateTransitionProverType } from "../../protocol/Protocol";
import { ProtocolModule } from "../../protocol/ProtocolModule";
import {
  DefaultProvableHashList,
  ProvableHashList,
} from "../../utils/ProvableHashList";

import {
  StateTransitionProof,
  StateTransitionProvable,
  StateTransitionProverPublicInput,
  StateTransitionProverPublicOutput,
} from "./StateTransitionProvable";

const errors = {
  propertyNotMatching: (property: string, step: string) =>
    `${property} not matching ${step}`,

  merkleWitnessNotCorrect: (index: number, type: string) =>
    `MerkleWitness not valid for StateTransition (${index}, type ${type})`,

  noWitnessProviderSet: () =>
    new Error(
      "WitnessProvider not set, set it before you use StateTransitionProvider"
    ),
};

interface StateTransitionProverExecutionState {
  stateRoot: Field;
  protocolStateRoot: Field;
  stateTransitionList: ProvableHashList<ProvableStateTransition>;
  protocolTransitionList: ProvableHashList<ProvableStateTransition>;
}

const StateTransitionSelfProofClass = SelfProof<
  StateTransitionProverPublicInput,
  StateTransitionProverPublicOutput
>;

/**
 * StateTransitionProver is the prover that proves the application of some state
 * transitions and checks and updates their merkle-tree entries
 */
export class StateTransitionProverProgrammable extends ZkProgrammable<
  StateTransitionProverPublicInput,
  StateTransitionProverPublicOutput
> {
  public constructor(
    private readonly stateTransitionProver: StateTransitionProver
  ) {
    super();
  }

  public get appChain(): AreProofsEnabled | undefined {
    return this.stateTransitionProver.appChain;
  }

  public zkProgramFactory(): PlainZkProgram<
    StateTransitionProverPublicInput,
    StateTransitionProverPublicOutput
  >[] {
    const instance = this;

    const program = ZkProgram({
      name: "StateTransitionProver",
      publicInput: StateTransitionProverPublicInput,
      publicOutput: StateTransitionProverPublicOutput,

      methods: {
        proveBatch: {
          privateInputs: [StateTransitionProvableBatch],

          async method(
            publicInput: StateTransitionProverPublicInput,
            batch: StateTransitionProvableBatch
          ) {
            return await instance.runBatch(publicInput, batch);
          },
        },

        merge: {
          privateInputs: [
            StateTransitionSelfProofClass,
            StateTransitionSelfProofClass,
          ],

          async method(
            publicInput: StateTransitionProverPublicInput,
            proof1: StateTransitionProof,
            proof2: StateTransitionProof
          ) {
            return await instance.merge(publicInput, proof1, proof2);
          },
        },
      },
    });

    const methods = {
      proveBatch: program.proveBatch.bind(program),
      merge: program.merge.bind(program),
    };

    const SelfProofClass = ZkProgram.Proof(program);

    return [
      {
        compile: program.compile.bind(program),
        verify: program.verify.bind(program),
        analyzeMethods: program.analyzeMethods.bind(program),
        Proof: SelfProofClass,
        methods,
      },
    ];
  }

  /**
   * Applies the state transitions to the current stateRoot
   * and returns the new prover state
   */
  public applyTransitions(
    stateRoot: Field,
    protocolStateRoot: Field,
    stateTransitionCommitmentFrom: Field,
    protocolTransitionCommitmentFrom: Field,
    transitionBatch: StateTransitionProvableBatch
  ): StateTransitionProverExecutionState {
    const state: StateTransitionProverExecutionState = {
      stateRoot,
      protocolStateRoot,

      stateTransitionList: new DefaultProvableHashList(
        ProvableStateTransition,
        stateTransitionCommitmentFrom
      ),

      protocolTransitionList: new DefaultProvableHashList(
        ProvableStateTransition,
        protocolTransitionCommitmentFrom
      ),
    };

    const transitions = transitionBatch.batch;
    const types = transitionBatch.transitionTypes;
    const { merkleWitnesses } = transitionBatch;
    for (
      let index = 0;
      index < constants.stateTransitionProverBatchSize;
      index++
    ) {
      this.applyTransition(
        state,
        transitions[index],
        types[index],
        merkleWitnesses[index],
        index
      );
    }

    return state;
  }

  /**
   * Applies a single state transition to the given state
   * and mutates it in place
   */
  public applyTransition(
    state: StateTransitionProverExecutionState,
    transition: ProvableStateTransition,
    type: ProvableStateTransitionType,
    merkleWitness: LinkedMerkleTreeWitness,
    index = 0
  ) {
    const isUpdate = merkleWitness.leafPrevious.leaf.nextPath.equals(Field(0));

    const isDummy = transition.path.equals(0);
    const isNotDummy = isDummy.not();

    // The following checks if this is an update or insert
    // If it's an update then the leafCurrent will be the current leaf,
    // rather than the zero/dummy leaf if it's an insert.
    // If it's an insert then we need to check the leafPrevious is
    // a valid leaf, i.e. path is less than transition.path and nextPath
    // greater than transition.path.
    // Even if we're just reading (rather than writing) then we expect
    // the path for the current leaf to be populated.
    const pathValid = Provable.if(
      isUpdate, // nextPath equal to 0 only if it's a dummy., which is when we update
      merkleWitness.leafCurrent.leaf.path.equals(transition.path), // update
      merkleWitness.leafPrevious.leaf.path
        .lessThan(transition.path)
        .and(
          merkleWitness.leafPrevious.leaf.nextPath.greaterThan(transition.path)
        ) // insert
    );
    // This is for dummy STs
    Provable.if(isNotDummy, pathValid, new Bool(true)).assertTrue();

    // Only if we're doing an insert is this valid.
    const previousWitnessValid =
      merkleWitness.leafPrevious.merkleWitness.checkMembershipSimple(
        state.stateRoot,
        merkleWitness.leafPrevious.leaf.hash()
      );

    // Combine previousWitnessValid and if it's an update
    // it should just be true, as the prev leaf is just a dummy leaf
    // so should always be true.
    const prevWitnessOrCurrentWitness = Provable.if(
      isUpdate,
      Bool(true),
      previousWitnessValid
    );

    // We need to check the sequencer had fetched the correct previousLeaf,
    // specifically that the previousLeaf is what is verified.
    // We check the stateRoot matches.
    // For an insert the prev leaf is not a dummy,
    // and for an update the prev leaf is a dummy.

    // We assert that the previous witness is valid in case of this one being an update
    Provable.if(
      isNotDummy,
      prevWitnessOrCurrentWitness,
      Bool(true)
    ).assertTrue();

    // Need to calculate the new state root after the previous leaf is changed.
    // This is only relevant if it's an insert. If an update, we will just use
    // the existing state root.
    const rootWithLeafChanged =
      merkleWitness.leafPrevious.merkleWitness.calculateRoot(
        new LinkedLeafStruct({
          value: merkleWitness.leafPrevious.leaf.value,
          path: merkleWitness.leafPrevious.leaf.path,
          nextPath: transition.path,
        }).hash()
      );

    const rootAfterFirstStep = Provable.if(
      isUpdate,
      state.stateRoot,
      rootWithLeafChanged
    );

    // Need to check the second leaf is correct, i.e. leafCurrent.
    // is what the sequencer claims it is.
    // Again, we check whether we have an update or insert as the value
    // depends on this. If insert then we have the current path would be 0.
    // We use the existing state root if it's only an update as the prev leaf
    // wouldn't have changed and therefore the state root should be the same.
    const currentWitnessLeaf = Provable.if(
      isUpdate,
      new LinkedLeafStruct({
        value: transition.from.value,
        path: transition.path,
        nextPath: merkleWitness.leafCurrent.leaf.nextPath,
      }).hash(),
      Field(0)
    );
    const currentWitnessValid =
      merkleWitness.leafCurrent.merkleWitness.checkMembershipSimple(
        rootAfterFirstStep,
        currentWitnessLeaf
      );

    Provable.if(isNotDummy, currentWitnessValid, Bool(true)).assertTrue();

    // Compute the new final root.
    // For an insert we have to hash the new leaf and use the leafPrev's nextPath
    // For an update we just use the new value, but keep the leafCurrents
    // next path the same.
    const newCurrentNextPath = Provable.if(
      isUpdate,
      merkleWitness.leafCurrent.leaf.nextPath,
      merkleWitness.leafPrevious.leaf.nextPath
    );

    const newCurrentLeaf = new LinkedLeafStruct({
      value: transition.to.value,
      path: transition.path,
      nextPath: newCurrentNextPath,
    });

    const newRoot = merkleWitness.leafCurrent.merkleWitness.calculateRoot(
      newCurrentLeaf.hash()
    );

    // TODO Make sure that path == 0 -> both isSomes == false

    // This is checking if we have a read or write.
    // If a read the state root should stay the same.
    state.stateRoot = Provable.if(
      transition.to.isSome,
      newRoot,
      state.stateRoot
    );

    // Only update protocol state root if ST is also of type protocol
    // Since protocol STs are all at the start of the batch, this works
    state.protocolStateRoot = Provable.if(
      transition.to.isSome.and(type.isProtocol()),
      newRoot,
      state.protocolStateRoot
    );

    state.stateTransitionList.pushIf(
      transition,
      isNotDummy.and(type.isNormal())
    );
    state.protocolTransitionList.pushIf(
      transition,
      isNotDummy.and(type.isProtocol())
    );
  }

  /**
   * Applies a whole batch of StateTransitions at once
   */
  @provableMethod()
  public async runBatch(
    publicInput: StateTransitionProverPublicInput,
    batch: StateTransitionProvableBatch
  ): Promise<StateTransitionProverPublicOutput> {
    const result = this.applyTransitions(
      publicInput.stateRoot,
      publicInput.protocolStateRoot,
      publicInput.stateTransitionsHash,
      publicInput.protocolTransitionsHash,
      batch
    );

    return new StateTransitionProverPublicOutput({
      stateRoot: result.stateRoot,
      stateTransitionsHash: result.stateTransitionList.commitment,
      protocolTransitionsHash: result.protocolTransitionList.commitment,
      protocolStateRoot: result.protocolStateRoot,
    });
  }

  @provableMethod()
  public async merge(
    publicInput: StateTransitionProverPublicInput,
    proof1: StateTransitionProof,
    proof2: StateTransitionProof
  ): Promise<StateTransitionProverPublicOutput> {
    proof1.verify();
    proof2.verify();

    // Check state
    publicInput.stateRoot.assertEquals(
      proof1.publicInput.stateRoot,
      errors.propertyNotMatching("stateRoot", "publicInput.from -> proof1.from")
    );
    proof1.publicOutput.stateRoot.assertEquals(
      proof2.publicInput.stateRoot,
      errors.propertyNotMatching("stateRoot", "proof1.to -> proof2.from")
    );

    // Check ST list
    publicInput.stateTransitionsHash.assertEquals(
      proof1.publicInput.stateTransitionsHash,
      errors.propertyNotMatching(
        "stateTransitionsHash",
        "publicInput.from -> proof1.from"
      )
    );
    proof1.publicOutput.stateTransitionsHash.assertEquals(
      proof2.publicInput.stateTransitionsHash,
      errors.propertyNotMatching(
        "stateTransitionsHash",
        "proof1.to -> proof2.from"
      )
    );

    // Check Protocol ST list
    publicInput.protocolTransitionsHash.assertEquals(
      proof1.publicInput.protocolTransitionsHash,
      errors.propertyNotMatching(
        "protocolTransitionsHash",
        "publicInput.from -> proof1.from"
      )
    );
    proof1.publicOutput.protocolTransitionsHash.assertEquals(
      proof2.publicInput.protocolTransitionsHash,
      errors.propertyNotMatching(
        "protocolTransitionsHash",
        "proof1.to -> proof2.from"
      )
    );

    // Check protocol state root
    publicInput.protocolStateRoot.assertEquals(
      proof1.publicInput.protocolStateRoot,
      errors.propertyNotMatching(
        "protocolStateRoot",
        "publicInput.from -> proof1.from"
      )
    );
    proof1.publicOutput.protocolStateRoot.assertEquals(
      proof2.publicInput.protocolStateRoot,
      errors.propertyNotMatching(
        "protocolStateRoot",
        "proof1.to -> proof2.from"
      )
    );

    return new StateTransitionProverPublicInput({
      stateRoot: proof2.publicOutput.stateRoot,
      stateTransitionsHash: proof2.publicOutput.stateTransitionsHash,
      protocolTransitionsHash: proof2.publicOutput.protocolTransitionsHash,
      protocolStateRoot: proof2.publicOutput.protocolStateRoot,
    });
  }
}

@injectable()
export class StateTransitionProver
  extends ProtocolModule
  implements StateTransitionProvable, StateTransitionProverType
{
  public zkProgrammable: StateTransitionProverProgrammable;

  public constructor() {
    super();
    this.zkProgrammable = new StateTransitionProverProgrammable(this);
  }

  public runBatch(
    publicInput: StateTransitionProverPublicInput,
    batch: StateTransitionProvableBatch
  ): Promise<StateTransitionProverPublicOutput> {
    return this.zkProgrammable.runBatch(publicInput, batch);
  }

  public merge(
    publicInput: StateTransitionProverPublicInput,
    proof1: StateTransitionProof,
    proof2: StateTransitionProof
  ): Promise<StateTransitionProverPublicOutput> {
    return this.zkProgrammable.merge(publicInput, proof1, proof2);
  }
}
