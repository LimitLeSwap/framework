import { Field } from "o1js";
import { injectable } from "tsyringe";
import { LinkedMerkleTreeWitness } from "@proto-kit/common/dist/trees/LinkedMerkleTree";
import { RollupMerkleTreeWitness } from "@proto-kit/common/dist/trees/RollupMerkleTree";

/**
 * Interface for providing merkle witnesses to the state-transition prover
 */
export interface StateTransitionWitnessProvider {
  /**
   * Provides the merkle witness corresponding to the given key
   * @param key Merkle-tree key
   */
  getWitness: (key: Field) => LinkedMerkleTreeWitness;
}

@injectable()
export class NoOpStateTransitionWitnessProvider
  implements StateTransitionWitnessProvider
{
  public getWitness(): LinkedMerkleTreeWitness {
    return new LinkedMerkleTreeWitness({
      merkleWitness: new RollupMerkleTreeWitness({ path: [], isLeft: [] }),
      leaf: { value: Field(0), path: Field(0), nextPath: Field(0) },
      nextFreeIndex: Field(1),
    });
  }
}
