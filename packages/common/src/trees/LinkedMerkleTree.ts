import { Bool, Field, Poseidon, Provable, Struct } from "o1js";

import { range } from "../utils";
import { TypedClass } from "../types";

import { LinkedMerkleTreeStore } from "./LinkedMerkleTreeStore";
import { InMemoryMerkleTreeStorage } from "./InMemoryMerkleTreeStorage";
import { AbstractMerkleWitness, StructTemplate } from "./RollupMerkleTree";

class LinkedLeaf extends Struct({
  value: Field,
  path: Field,
  nextPath: Field,
}) {}

export interface AbstractLinkedMerkleTree {
  store: LinkedMerkleTreeStore;
  readonly leafCount: bigint;

  assertIndexRange(index: bigint): void;

  /**
   * Returns a node which lives at a given index and level.
   * @param level Level of the node.
   * @param index Index of the node.
   * @returns The data of the node.
   */
  getNode(level: number, index: bigint): Field;

  /**
   * Returns the root of the [Merkle Tree](https://en.wikipedia.org/wiki/Merkle_tree).
   * @returns The root of the Merkle Tree.
   */
  getRoot(): Field;

  /**
   * Sets the value of a leaf node at a given index to a given value.
   * @param index Position of the leaf node.
   * @param leaf New value.
   */
  setLeaf(index: bigint, leaf: Field): void;

  /**
   * Returns the witness (also known as
   * [Merkle Proof or Merkle Witness](https://computersciencewiki.org/index.php/Merkle_proof))
   * for the leaf at the given index.
   * @param index Position of the leaf node.
   * @returns The witness that belongs to the leaf.
   */
  getWitness(index: bigint): AbstractMerkleWitness;

  /**
   * Fills all leaves of the tree.
   * @param leaves Values to fill the leaves with.
   */
  fill(leaves: Field[]): void;
}

export interface AbstractLinkedMerkleTreeClass {
  new (store: LinkedMerkleTreeStore): AbstractLinkedMerkleTree;

  WITNESS: TypedClass<AbstractMerkleWitness> &
    typeof StructTemplate & { dummy: () => AbstractMerkleWitness };

  HEIGHT: number;

  EMPTY_ROOT: bigint;

  get leafCount(): bigint;
}

export function createLinkedMerkleTree(
  height: number
): AbstractLinkedMerkleTreeClass {
  class LinkedMerkleWitness
    extends Struct({
      path: Provable.Array(Field, height - 1),
      isLeft: Provable.Array(Bool, height - 1),
    })
    implements AbstractMerkleWitness
  {
    public static height = height;

    public height(): number {
      return LinkedMerkleWitness.height;
    }

    /**
     * Calculates a root depending on the leaf value.
     * @param leaf Value of the leaf node that belongs to this Witness.
     * @returns The calculated root.
     */
    public calculateRoot(leaf: LinkedLeaf): Field {
      let hash = Poseidon.hash([leaf.value, leaf.path, leaf.nextPath]);
      const n = this.height();

      for (let index = 1; index < n; ++index) {
        const isLeft = this.isLeft[index - 1];

        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const [left, right] = maybeSwap(isLeft, hash, this.path[index - 1]);
        hash = Poseidon.hash([left, right]);
      }

      return hash;
    }

    /**
     * Calculates the index of the leaf node that belongs to this Witness.
     * @returns Index of the leaf.
     */
    public calculateIndex(): Field {
      let powerOfTwo = Field(1);
      let index = Field(0);
      const n = this.height();

      for (let i = 1; i < n; ++i) {
        index = Provable.if(this.isLeft[i - 1], index, index.add(powerOfTwo));
        powerOfTwo = powerOfTwo.mul(2);
      }

      return index;
    }

    public checkMembership(root: Field, key: Field, value: Field): Bool {
      const calculatedRoot = this.calculateRoot(value);
      const calculatedKey = this.calculateIndex();
      // We don't have to range-check the key, because if it would be greater
      // than leafCount, it would not match the computedKey
      key.assertEquals(calculatedKey, "Keys of MerkleWitness does not match");
      return root.equals(calculatedRoot);
    }

    public checkMembershipGetRoots(
      root: Field,
      key: Field,
      value: Field
    ): [Bool, Field, Field] {
      const calculatedRoot = this.calculateRoot(value);
      const calculatedKey = this.calculateIndex();
      key.assertEquals(calculatedKey, "Keys of MerkleWitness does not match");
      return [root.equals(calculatedRoot), root, calculatedRoot];
    }

    public toShortenedEntries() {
      return range(0, 5)
        .concat(range(this.height() - 4, this.height()))
        .map((index) =>
          [
            this.path[index].toString(),
            this.isLeft[index].toString(),
          ].toString()
        );
    }

    public static dummy() {
      return new LinkedMerkleWitness({
        isLeft: Array<Bool>(height - 1).fill(Bool(false)),
        path: Array<Field>(height - 1).fill(Field(0)),
      });
    }
  }

  return class AbstractRollupMerkleTree implements AbstractLinkedMerkleTree {
    public static HEIGHT = height;

    public static EMPTY_ROOT = new AbstractRollupMerkleTree(
      new InMemoryMerkleTreeStorage()
    )
      .getRoot()
      .toBigInt();

    public static get leafCount(): bigint {
      return 2n ** BigInt(AbstractRollupMerkleTree.HEIGHT - 1);
    }

    public static WITNESS = LinkedMerkleWitness;

    // private in interface
    readonly zeroes: bigint[];

    readonly store: LinkedMerkleTreeStore;

    public constructor(store: LinkedMerkleTreeStore) {
      this.store = store;
      this.zeroes = [0n];
      for (let index = 1; index < AbstractRollupMerkleTree.HEIGHT; index += 1) {
        const previousLevel = Field(this.zeroes[index - 1]);
        this.zeroes.push(
          Poseidon.hash([previousLevel, previousLevel]).toBigInt()
        );
      }
    }

    public assertIndexRange(index: bigint) {
      if (index > this.leafCount) {
        throw new Error("Index greater than maximum leaf number");
      }
    }

    /**
     * Returns a node which lives at a given index and level.
     * @param level Level of the node.
     * @param index Index of the node.
     * @returns The data of the node.
     */
    public getNode(level: number, index: bigint): Field {
      this.assertIndexRange(index);
      return Field(this.store.getNode(index, level) ?? this.zeroes[level]);
    }

    /**
     * Returns the root of the [Merkle Tree](https://en.wikipedia.org/wiki/Merkle_tree).
     * @returns The root of the Merkle Tree.
     */
    public getRoot(): Field {
      return this.getNode(AbstractRollupMerkleTree.HEIGHT - 1, 0n).toConstant();
    }

    // private in interface
    private setNode(level: number, index: bigint, value: Field) {
      this.store.setNode(index, level, value.toBigInt());
    }

    /**
     * Sets the value of a leaf node at a given index to a given value.
     * @param index Position of the leaf node.
     * @param leaf New value.
     */
    public setLeaf(index: bigint, leaf: Field) {
      this.assertIndexRange(index);

      this.setNode(0, index, leaf);
      let currentIndex = index;
      for (let level = 1; level < AbstractRollupMerkleTree.HEIGHT; level += 1) {
        currentIndex /= 2n;

        const left = this.getNode(level - 1, currentIndex * 2n);
        const right = this.getNode(level - 1, currentIndex * 2n + 1n);

        this.setNode(level, currentIndex, Poseidon.hash([left, right]));
      }
    }

    /**
     * Returns the witness (also known as
     * [Merkle Proof or Merkle Witness](https://computersciencewiki.org/index.php/Merkle_proof))
     * for the leaf at the given index.
     * @param index Position of the leaf node.
     * @returns The witness that belongs to the leaf.
     */
    public getWitness(index: bigint): LinkedMerkleWitness {
      this.assertIndexRange(index);

      const path = [];
      const isLefts = [];
      let currentIndex = index;
      for (
        let level = 0;
        level < AbstractRollupMerkleTree.HEIGHT - 1;
        level += 1
      ) {
        const isLeft = currentIndex % 2n === 0n;
        const sibling = this.getNode(
          level,
          isLeft ? currentIndex + 1n : currentIndex - 1n
        );
        isLefts.push(Bool(isLeft));
        path.push(sibling);
        currentIndex /= 2n;
      }
      return new LinkedMerkleWitness({
        isLeft: isLefts,
        path,
      });
    }

    // TODO: should this take an optional offset? should it fail if the array is too long?
    /**
     * Fills all leaves of the tree.
     * @param leaves Values to fill the leaves with.
     */
    public fill(leaves: Field[]) {
      leaves.forEach((value, index) => {
        this.setLeaf(BigInt(index), value);
      });
    }

    /**
     * Returns the amount of leaf nodes.
     * @returns Amount of leaf nodes.
     */
    public get leafCount(): bigint {
      return AbstractRollupMerkleTree.leafCount;
    }
  };
}

export class LinkedMerkleTree extends createLinkedMerkleTree(256) {}
export class LinkedMerkleTreeWitness extends LinkedMerkleTree.WITNESS {}

/**
 * More efficient version of `maybeSwapBad` which
 * reuses an intermediate variable
 */
function maybeSwap(b: Bool, x: Field, y: Field): [Field, Field] {
  const m = b.toField().mul(x.sub(y)); // b*(x - y)
  const x1 = y.add(m); // y + b*(x - y)
  const y2 = x.sub(m); // x - b*(x - y) = x + b*(y - x)
  return [x1, y2];
}
