import {
  ProvableStateTransition,
  ProvableStateTransitionType,
  StateTransitionProverPublicInput,
} from "@proto-kit/protocol";
import { Bool } from "o1js";
import { LinkedMerkleTreeWitness } from "@proto-kit/common/dist/trees/LinkedMerkleTree";

import { TaskSerializer } from "../../../worker/flow/Task";

export interface StateTransitionProofParameters {
  publicInput: StateTransitionProverPublicInput;
  stateTransitions: {
    transition: ProvableStateTransition;
    type: ProvableStateTransitionType;
  }[];
  merkleWitnesses: LinkedMerkleTreeWitness[];
}

interface StateTransitionParametersJSON {
  publicInput: ReturnType<typeof StateTransitionProverPublicInput.toJSON>;
  stateTransitions: {
    transition: ReturnType<typeof ProvableStateTransition.toJSON>;
    type: boolean;
  }[];
  merkleWitnesses: ReturnType<typeof LinkedMerkleTreeWitness.toJSON>[];
}

export class StateTransitionParametersSerializer
  implements TaskSerializer<StateTransitionProofParameters>
{
  public toJSON(parameters: StateTransitionProofParameters) {
    return JSON.stringify({
      publicInput: StateTransitionProverPublicInput.toJSON(
        parameters.publicInput
      ),

      stateTransitions: parameters.stateTransitions.map((st) => {
        return {
          transition: ProvableStateTransition.toJSON(st.transition),
          type: st.type.type.toBoolean(),
        };
      }),

      merkleWitnesses: parameters.merkleWitnesses.map((witness) =>
        LinkedMerkleTreeWitness.toJSON(witness)
      ),
    } satisfies StateTransitionParametersJSON);
  }

  public fromJSON(json: string): StateTransitionProofParameters {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const parsed = JSON.parse(json) as StateTransitionParametersJSON;

    return {
      publicInput: StateTransitionProverPublicInput.fromJSON(
        parsed.publicInput
      ),

      stateTransitions: parsed.stateTransitions.map((st) => {
        return {
          transition: new ProvableStateTransition(
            ProvableStateTransition.fromJSON(st.transition)
          ),

          type: new ProvableStateTransitionType({ type: Bool(st.type) }),
        };
      }),

      merkleWitnesses: parsed.merkleWitnesses.map(
        (witness) =>
          new LinkedMerkleTreeWitness(LinkedMerkleTreeWitness.fromJSON(witness))
      ),
    };
  }
}
