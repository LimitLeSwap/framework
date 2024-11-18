import { expectDefined, LinkedMerkleTree } from "@proto-kit/common";
import { beforeEach, expect } from "@jest/globals";
import { Field, Poseidon } from "o1js";

import { CachedLinkedMerkleTreeStore } from "../../src/state/merkle/CachedLinkedMerkleTreeStore";
import { InMemoryAsyncLinkedMerkleTreeStore } from "../../src/storage/inmemory/InMemoryAsyncLinkedMerkleTreeStore";
import { SyncCachedLinkedMerkleTreeStore } from "../../src/state/merkle/SyncCachedLinkedMerkleTreeStore";

describe("cached linked merkle store", () => {
  const mainStore = new InMemoryAsyncLinkedMerkleTreeStore();

  let cache1: CachedLinkedMerkleTreeStore;
  let tree1: LinkedMerkleTree;

  beforeEach(async () => {
    const cachedStore = new CachedLinkedMerkleTreeStore(mainStore);

    const tmpTree = new LinkedMerkleTree(cachedStore);
    tmpTree.setLeaf(5n, 10n);
    await cachedStore.mergeIntoParent();

    cache1 = new CachedLinkedMerkleTreeStore(mainStore);
    tree1 = new LinkedMerkleTree(cache1);
  });

  it("should cache multiple keys correctly", async () => {
    expect.assertions(7);

    const cache2 = new CachedLinkedMerkleTreeStore(cache1);
    const tree2 = new LinkedMerkleTree(cache2);

    tree1.setLeaf(16n, 16n);
    tree1.setLeaf(46n, 46n);

    // Need to preload 0n, as well since the nextPath of the leaf would have changed
    // when other leaves were added.
    await cache2.preloadKeys([0n, 16n, 46n]);

    const leaf1 = tree1.getLeaf(16n);
    const leaf2 = tree1.getLeaf(46n);

    const leaf1Index = cache2.getLeafIndex(16n);
    const leaf2Index = cache2.getLeafIndex(46n);

    expectDefined(leaf1Index);
    expectDefined(leaf2Index);

    // Note that 5n hasn't been loaded so indices are off by 1.
    expect(leaf1Index).toStrictEqual(1n);
    expect(leaf2Index).toStrictEqual(2n);

    expect(tree2.getNode(0, leaf1Index).toBigInt()).toBe(
      Poseidon.hash([leaf1.value, leaf1.path, leaf1.nextPath]).toBigInt()
    );
    expect(tree2.getNode(0, leaf2Index).toBigInt()).toBe(
      Poseidon.hash([leaf2.value, leaf2.path, leaf2.nextPath]).toBigInt()
    );

    expect(tree2.getRoot().toString()).toStrictEqual(
      tree1.getRoot().toString()
    );
  });

  it("should preload through multiple levels", async () => {
    const cache2 = new CachedLinkedMerkleTreeStore(cache1);

    await cache2.preloadKeys([0n, 5n]);

    const leaf = tree1.getLeaf(5n);
    expect(cache2.getNode(5n, 0)).toStrictEqual(
      Poseidon.hash([leaf.value, leaf.path, leaf.nextPath]).toBigInt()
    );
  });

  it("should cache correctly", async () => {
    expect.assertions(9);

    const cache2 = new SyncCachedLinkedMerkleTreeStore(cache1);
    const tree2 = new LinkedMerkleTree(cache2);

    const leaf1 = tree2.getLeaf(5n);
    await expect(
      mainStore.getNodesAsync([{ key: 5n, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([leaf1.value, leaf1.path, leaf1.nextPath]).toBigInt(),
    ]);

    await cache1.preloadKey(5n);

    tree1.setLeaf(10n, 20n);

    const leaf2 = tree2.getLeaf(10n);
    expect(tree2.getNode(0, 10n).toBigInt()).toBe(
      Poseidon.hash([leaf2.value, leaf2.path, leaf2.nextPath]).toBigInt()
    );

    const witness = tree2.getWitness(5n);

    expect(
      witness.leafCurrent.merkleWitness.calculateRoot(Field(10)).toString()
    ).toBe(tree1.getRoot().toString());
    expect(
      witness.leafCurrent.merkleWitness.calculateRoot(Field(11)).toString()
    ).not.toBe(tree1.getRoot().toString());

    const witness2 = tree1.getWitness(10n);

    expect(
      witness2.leafCurrent.merkleWitness.calculateRoot(Field(20)).toString()
    ).toBe(tree2.getRoot().toString());

    tree2.setLeaf(15n, 30n);

    expect(tree1.getRoot().toString()).not.toBe(tree2.getRoot().toString());

    cache2.mergeIntoParent();

    expect(tree1.getRoot().toString()).toBe(tree2.getRoot().toString());
    expect(tree1.getNode(0, 15n).toString()).toBe("30");

    await cache1.mergeIntoParent();

    const cachedStore = new CachedLinkedMerkleTreeStore(mainStore);
    await cachedStore.preloadKey(15n);

    expect(new LinkedMerkleTree(cachedStore).getRoot().toString()).toBe(
      tree2.getRoot().toString()
    );
  });
});
