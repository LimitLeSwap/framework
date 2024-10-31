import { Bool, Field, Poseidon, Provable, Struct } from "o1js";

import { TypedClass } from "../types";

import { LinkedMerkleTreeStore } from "./LinkedMerkleTreeStore";
import { InMemoryLinkedMerkleTreeStorage } from "./InMemoryLinkedMerkleTreeStorage";
import { StructTemplate, maybeSwap } from "./RollupMerkleTree";

export interface AbstractLinkedMerkleWitness extends StructTemplate {
  height(): number;

  /**
   * Calculates a root depending on the leaf value.
   * @param hash Value of the leaf node that belongs to this Witness.
   * @returns The calculated root.
   */
  calculateRoot(hash: Field): Field;

  /**
   * Calculates the index of the leaf node that belongs to this Witness.
   * @returns Index of the leaf.
   */
  calculateIndex(): Field;

  checkMembership(root: Field, key: Field, value: Field): Bool;

  checkMembershipGetRoots(
    root: Field,
    key: Field,
    value: Field
  ): [Bool, Field, Field];
}

class LinkedLeaf extends Struct({
  value: Field,
  path: Field,
  nextPath: Field,
}) {}

export interface AbstractLinkedMerkleTree {
  store: LinkedMerkleTreeStore;
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
   * @param path of the leaf node.
   * @param value New value.
   */
  setLeaf(path: number, value: bigint): void;

  /**
   * Returns a leaf which lives at a given path.
   * @param path Index of the node.
   * @returns The data of the leaf.
   */
  getLeaf(path: number): LinkedLeaf;

  /**
   * Returns a leaf which is closest to a given path.
   * @param path Index of the node.
   * @returns The data of the leaf.
   */
  getClosestPath(path: number): LinkedLeaf;

  /**
   * Returns the witness (also known as
   * [Merkle Proof or Merkle Witness](https://computersciencewiki.org/index.php/Merkle_proof))
   * for the leaf at the given path.
   * @param path Position of the leaf node.
   * @returns The witness that belongs to the leaf.
   */
  getWitness(path: number): AbstractLinkedMerkleWitness;
}

export interface AbstractLinkedMerkleTreeClass {
  new (store: LinkedMerkleTreeStore): AbstractLinkedMerkleTree;

  WITNESS: TypedClass<AbstractLinkedMerkleWitness> & typeof StructTemplate;

  HEIGHT: number;

  EMPTY_ROOT: bigint;
}

export function createLinkedMerkleTree(
  height: number
): AbstractLinkedMerkleTreeClass {
  class LinkedMerkleWitness
    extends Struct({
      path: Provable.Array(Field, height - 1),
      isLeft: Provable.Array(Bool, height - 1),
    })
    implements AbstractLinkedMerkleWitness
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
    public calculateRoot(leaf: Field): Field {
      let hash = leaf;
      const n = this.height();

      for (let index = 1; index < n; ++index) {
        const isLeft = this.isLeft[index - 1];

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
  }

  return class AbstractLinkedRollupMerkleTree
    implements AbstractLinkedMerkleTree
  {
    public static HEIGHT = height;

    public static EMPTY_ROOT = new AbstractLinkedRollupMerkleTree(
      new InMemoryLinkedMerkleTreeStorage()
    )
      .getRoot()
      .toBigInt();

    public static WITNESS = LinkedMerkleWitness;

    readonly zeroes: bigint[];

    readonly store: LinkedMerkleTreeStore;

    public constructor(store: LinkedMerkleTreeStore) {
      this.store = store;
      this.zeroes = [0n];
      for (
        let index = 1;
        index < AbstractLinkedRollupMerkleTree.HEIGHT;
        index += 1
      ) {
        const previousLevel = Field(this.zeroes[index - 1]);
        this.zeroes.push(
          Poseidon.hash([previousLevel, previousLevel]).toBigInt()
        );
      }
      this.setLeafInitialisation();
    }

    public getNode(level: number, index: bigint): Field {
      const node = this.store.getNode(index, level);
      if (node === undefined) {
        throw new Error("Path does not exist in tree.");
      }
      return Field(node);
    }

    /**
     * Returns leaf which lives at a given path, or closest path
     * @param path path of the node.
     * @returns The data of the node.
     */
    public getLeaf(path: number): LinkedLeaf {
      const index = this.store.getLeafIndex(path);
      if (index === undefined) {
        throw new Error("Path does not exist in tree.");
      }
      const leaf = this.store.getLeaf(BigInt(index));
      if (leaf === undefined) {
        throw new Error("Index does not exist in tree.");
      }
      return {
        value: Field(leaf.value),
        path: Field(leaf.path),
        nextPath: Field(leaf.nextPath),
      };
    }

    /**
     * Returns the leaf with a path either equal to or less than the path specified.
     * @param path Position of the leaf node.
     * */
    public getClosestPath(path: number): LinkedLeaf {
      const closestLeaf = this.store.getClosestPath(path);
      return {
        value: Field(closestLeaf.value),
        path: Field(closestLeaf.path),
        nextPath: Field(closestLeaf.nextPath),
      };
    }

    /**
     * Returns the root of the [Merkle Tree](https://en.wikipedia.org/wiki/Merkle_tree).
     * @returns The root of the Merkle Tree.
     */
    public getRoot(): Field {
      return this.getNode(
        AbstractLinkedRollupMerkleTree.HEIGHT - 1,
        0n
      ).toConstant();
    }

    // private in interface
    private setNode(level: number, index: bigint, value: Field) {
      this.store.setNode(index, level, value.toBigInt());
    }

    /**
     * Sets the value of a leaf node at a given path to a given value.
     * @param path Position of the leaf node.
     * @param value New value.
     */
    public setLeaf(path: number, value: bigint) {
      const prevLeaf = this.store.getClosestPath(path);
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      let prevLeafIndex = this.store.getLeafIndex(path) as bigint;
      const newPrevLeaf = {
        value: prevLeaf.value,
        path: prevLeaf.path,
        nextPath: path,
      };
      this.store.setLeaf(prevLeafIndex, newPrevLeaf);
      const prevLeafFields = this.getLeaf(prevLeaf.path);
      this.setNode(
        0,
        prevLeafIndex,
        Poseidon.hash([
          prevLeafFields.value,
          prevLeafFields.path,
          prevLeafFields.nextPath,
        ])
      );

      const newLeaf = {
        value: value,
        path: path,
        nextPath: prevLeaf.nextPath,
      };
      let newLeafIndex = this.store.getMaximumIndex() + 1n;
      this.store.setLeaf(newLeafIndex, newLeaf);
      const newLeafFields = this.getLeaf(path);
      this.setNode(
        0,
        newLeafIndex,
        Poseidon.hash([
          newLeafFields.value,
          newLeafFields.path,
          newLeafFields.nextPath,
        ])
      );

      for (
        let level = 1;
        level < AbstractLinkedRollupMerkleTree.HEIGHT;
        level += 1
      ) {
        prevLeafIndex /= 2n;
        newLeafIndex /= 2n;

        const leftPrev = this.getNode(level - 1, prevLeafIndex * 2n);
        const rightPrev = this.getNode(level - 1, prevLeafIndex * 2n + 1n);
        const leftNew = this.getNode(level - 1, newLeafIndex * 2n);
        const rightNew = this.getNode(level - 1, newLeafIndex * 2n + 1n);

        this.setNode(
          level,
          prevLeafIndex,
          Poseidon.hash([leftPrev, rightPrev])
        );
        this.setNode(level, prevLeafIndex, Poseidon.hash([leftNew, rightNew]));
      }
    }

    /**
     * Sets the value of a leaf node at initialisation,
     * i.e.  {vale: 0, path: 0, nextPath: Field.Max}
     */
    private setLeafInitialisation() {
      const MAX_FIELD_VALUE = 2 ** 1000000;
      this.store.setLeaf(0n, {
        value: 0n,
        path: 0,
        nextPath: MAX_FIELD_VALUE,
      });
      const initialLeaf = this.getLeaf(0);
      this.setNode(
        0,
        0n,
        Poseidon.hash([
          initialLeaf.value,
          initialLeaf.path,
          initialLeaf.nextPath,
        ])
      );
      for (
        let level = 1;
        level < AbstractLinkedRollupMerkleTree.HEIGHT;
        level += 1
      ) {
        const leftNode = this.getNode(level - 1, 0n);
        const rightNode = this.getNode(level - 1, 1n);

        this.setNode(level, 0n, Poseidon.hash([leftNode, rightNode]));
      }
    }

    /**
     * Returns the witness (also known as
     * [Merkle Proof or Merkle Witness](https://computersciencewiki.org/index.php/Merkle_proof))
     * for the leaf at the given index.
     * @param path of the leaf node.
     * @returns The witness that belongs to the leaf.
     */
    public getWitness(path: number): LinkedMerkleWitness {
      const index = this.store.getLeafIndex(path);
      if (index === undefined) {
        throw new Error("Path does not exist in tree.");
      }

      const pathArray = [];
      const isLefts = [];
      let currentIndex = index;
      for (
        let level = 0;
        level < AbstractLinkedRollupMerkleTree.HEIGHT - 1;
        level += 1
      ) {
        const isLeft = currentIndex % 2n === 0n;
        const sibling = this.getNode(
          level,
          isLeft ? currentIndex + 1n : currentIndex - 1n
        );
        isLefts.push(Bool(isLeft));
        pathArray.push(sibling);
        currentIndex /= 2n;
      }
      return new LinkedMerkleWitness({
        isLeft: isLefts,
        path: pathArray,
      });
    }
  };
}

export class LinkedMerkleTree extends createLinkedMerkleTree(40) {}
export class LinkedMerkleTreeWitness extends LinkedMerkleTree.WITNESS {}
