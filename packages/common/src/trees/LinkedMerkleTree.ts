import { Bool, Field, Poseidon, Struct } from "o1js";

import { TypedClass } from "../types";

import { LinkedMerkleTreeStore } from "./LinkedMerkleTreeStore";
import { InMemoryLinkedMerkleTreeStorage } from "./InMemoryLinkedMerkleTreeStorage";
import { RollupMerkleTreeWitness } from "./RollupMerkleTree";

class LinkedLeaf extends Struct({
  value: Field,
  path: Field,
  nextPath: Field,
}) {}

export class LinkedStructTemplate extends Struct({
  leaf: LinkedLeaf,
  merkleWitness: RollupMerkleTreeWitness,
}) {}

export interface AbstractLinkedMerkleWitness extends LinkedStructTemplate {}

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
  setValue(path: bigint, value: bigint): void;

  /**
   * Returns a leaf which lives at a given path.
   * @param path Index of the node.
   * @returns The data of the leaf.
   */
  getLeaf(path: bigint): LinkedLeaf;

  /**
   * Returns the witness (also known as
   * [Merkle Proof or Merkle Witness](https://computersciencewiki.org/index.php/Merkle_proof))
   * for the leaf at the given path.
   * @param path Position of the leaf node.
   * @returns The witness that belongs to the leaf.
   */
  getWitness(path: bigint): AbstractLinkedMerkleWitness;
}

export interface AbstractLinkedMerkleTreeClass {
  new (store: LinkedMerkleTreeStore): AbstractLinkedMerkleTree;

  WITNESS: TypedClass<AbstractLinkedMerkleWitness> &
    typeof LinkedStructTemplate;

  HEIGHT: number;

  EMPTY_ROOT: bigint;
}

export function createLinkedMerkleTree(
  height: number
): AbstractLinkedMerkleTreeClass {
  class LinkedMerkleWitness
    extends LinkedStructTemplate
    implements AbstractLinkedMerkleWitness {}

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
      return Field(node ?? this.zeroes[level]);
    }

    /**
     * Returns leaf which lives at a given path, or closest path
     * @param path path of the node.
     * @returns The data of the node.
     */
    public getLeaf(path: bigint): LinkedLeaf {
      return this.getPathLessOrEqual(path);
    }

    /**
     * Returns the leaf with a path either equal to or less than the path specified.
     * @param path Position of the leaf node.
     * */
    private getPathLessOrEqual(path: bigint): LinkedLeaf {
      const closestLeaf = this.store.getPathLessOrEqual(path);
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
     * Sets the value of a leaf node at a given index to a given value.
     * @param index Position of the leaf node.
     * @param leaf New value.
     */
    private setLeaf(index: bigint, leaf: LinkedLeaf) {
      this.setNode(
        0,
        index,
        Poseidon.hash([leaf.value, leaf.path, leaf.nextPath])
      );
      let tempIndex = index;
      for (
        let level = 1;
        level < AbstractLinkedRollupMerkleTree.HEIGHT;
        level += 1
      ) {
        tempIndex /= 2n;
        const leftPrev = this.getNode(level - 1, tempIndex * 2n);
        const rightPrev = this.getNode(level - 1, tempIndex * 2n + 1n);
        this.setNode(level, tempIndex, Poseidon.hash([leftPrev, rightPrev]));
      }
    }

    /**
     * Sets the value of a node at a given index to a given value.
     * @param path Position of the leaf node.
     * @param value New value.
     */
    public setValue(path: bigint, value: bigint) {
      let index = this.store.getLeafIndex(path);
      const prevLeaf = this.store.getPathLessOrEqual(path);
      if (index === undefined) {
        // The above means the path doesn't already exist and we are inserting, not updating.
        // This requires us to update the node with the previous path, as well.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const prevLeafIndex = this.store.getLeafIndex(prevLeaf.path) as bigint;
        const newPrevLeaf = {
          value: prevLeaf.value,
          path: prevLeaf.path,
          nextPath: path,
        };
        this.store.setLeaf(prevLeafIndex, newPrevLeaf);
        this.setLeaf(prevLeafIndex, {
          value: Field(newPrevLeaf.value),
          path: Field(newPrevLeaf.path),
          nextPath: Field(newPrevLeaf.nextPath),
        });
        index = this.store.getMaximumIndex() + 1n;
      }
      const newLeaf = {
        value: value,
        path: path,
        nextPath: prevLeaf.nextPath,
      };
      this.store.setLeaf(index, newLeaf);
      this.setLeaf(index, {
        value: Field(newLeaf.value),
        path: Field(newLeaf.path),
        nextPath: Field(newLeaf.nextPath),
      });
    }

    /**
     * Sets the value of a leaf node at initialisation,
     * i.e.  {vale: 0, path: 0, nextPath: Field.Max}
     */
    private setLeafInitialisation() {
      const MAX_FIELD_VALUE: bigint = BigInt(2 ** 53 - 1);
      this.store.setLeaf(0n, {
        value: 0n,
        path: 0n,
        nextPath: MAX_FIELD_VALUE,
      });
      const initialLeaf = this.getLeaf(0n);
      this.setLeaf(0n, initialLeaf);
    }

    /**
     * Returns the witness (also known as
     * [Merkle Proof or Merkle Witness](https://computersciencewiki.org/index.php/Merkle_proof))
     * for the leaf at the given index.
     * @param path of the leaf node.
     * @returns The witness that belongs to the leaf.
     */
    public getWitness(path: bigint): LinkedMerkleWitness {
      const leaf = this.getPathLessOrEqual(path);

      const pathArray = [];
      const isLefts = [];
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      let currentIndex = this.store.getLeafIndex(
        leaf.path.toBigInt()
      ) as bigint;
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
        merkleWitness: new RollupMerkleTreeWitness({
          path: pathArray,
          isLeft: isLefts,
        }),
        leaf: leaf,
      });
    }
  };
}

export class LinkedMerkleTree extends createLinkedMerkleTree(40) {}
export class LinkedMerkleTreeWitness extends LinkedMerkleTree.WITNESS {}
