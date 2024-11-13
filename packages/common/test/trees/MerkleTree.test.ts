import { beforeEach } from "@jest/globals";
import { Field, Poseidon } from "o1js";

import {
  createLinkedMerkleTree,
  InMemoryLinkedMerkleTreeStorage,
  log,
} from "../../src";

describe.each([4, 16, 256])("cachedMerkleTree - %s", (height) => {
  class LinkedMerkleTree extends createLinkedMerkleTree(height) {}

  let store: InMemoryLinkedMerkleTreeStorage;
  let tree: LinkedMerkleTree;

  beforeEach(() => {
    log.setLevel("INFO");

    store = new InMemoryLinkedMerkleTreeStorage();
    tree = new LinkedMerkleTree(store);
  });

  it("should have the same root when empty", () => {
    expect.assertions(1);

    expect(tree.getRoot().toBigInt()).toStrictEqual(
      LinkedMerkleTree.EMPTY_ROOT
    );
  });

  it("should have a different root when not empty", () => {
    expect.assertions(1);

    tree.setValue(1n, 1n);

    expect(tree.getRoot().toBigInt()).not.toStrictEqual(
      LinkedMerkleTree.EMPTY_ROOT
    );
  });

  it("should provide correct witnesses", () => {
    expect.assertions(1);

    tree.setValue(1n, 1n);
    tree.setValue(5n, 5n);

    const witness = tree.getWitness(5n).leafCurrent;

    expect(
      witness.merkleWitness
        .calculateRoot(
          Poseidon.hash([
            witness.leaf.value,
            witness.leaf.path,
            witness.leaf.nextPath,
          ])
        )
        .toBigInt()
    ).toStrictEqual(tree.getRoot().toBigInt());
  });

  it("should have invalid witnesses with wrong values", () => {
    expect.assertions(1);

    tree.setValue(1n, 1n);
    tree.setValue(5n, 5n);

    const witness = tree.getWitness(5n);

    expect(
      witness.leafCurrent.merkleWitness.calculateRoot(Field(6)).toBigInt()
    ).not.toStrictEqual(tree.getRoot().toBigInt());
  });

  it("should have valid witnesses with changed value on the same leafs", () => {
    expect.assertions(1);

    tree.setValue(1n, 1n);
    tree.setValue(5n, 5n);

    const witness = tree.getWitness(5n).leafCurrent;

    tree.setValue(5n, 10n);

    expect(
      witness.merkleWitness
        .calculateRoot(
          Poseidon.hash([Field(10), witness.leaf.path, witness.leaf.nextPath])
        )
        .toBigInt()
    ).toStrictEqual(tree.getRoot().toBigInt());
  });

  it("should return zeroNode ", () => {
    expect.assertions(3);
    const MAX_FIELD_VALUE: bigint = BigInt(2 ** 53 - 1);
    const zeroLeaf = tree.getLeaf(0n);
    expect(zeroLeaf.value.toBigInt()).toStrictEqual(0n);
    expect(zeroLeaf.path.toBigInt()).toStrictEqual(0n);
    expect(zeroLeaf.nextPath.toBigInt()).toStrictEqual(MAX_FIELD_VALUE);
  });

  it("throw for invalid index", () => {
    expect(() => {
      for (let i = 0; i < 2n ** BigInt(height) + 1n; i++) {
        tree.setValue(BigInt(i), 2n);
      }
    }).toThrow("Index greater than maximum leaf number");
  });
});

// Separate describe here since we only want small trees for this test.
describe("Error check", () => {
  class LinkedMerkleTree extends createLinkedMerkleTree(4) {}
  let store: InMemoryLinkedMerkleTreeStorage;
  let tree: LinkedMerkleTree;

  it("throw for invalid index", () => {
    log.setLevel("INFO");

    store = new InMemoryLinkedMerkleTreeStorage();
    tree = new LinkedMerkleTree(store);
    expect(() => {
      for (let i = 0; i < 2n ** BigInt(4) + 1n; i++) {
        tree.setValue(BigInt(i), 2n);
      }
    }).toThrow("Index greater than maximum leaf number");
  });
});
