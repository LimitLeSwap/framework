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
    const cachedStore = await CachedLinkedMerkleTreeStore.new(mainStore);

    const tmpTree = new LinkedMerkleTree(cachedStore);
    await tmpTree.setLeaf(5n, 10n);
    await cachedStore.mergeIntoParent();

    cache1 = await CachedLinkedMerkleTreeStore.new(mainStore);
    tree1 = new LinkedMerkleTree(cache1);
  });

  it("should cache multiple keys correctly", async () => {
    expect.assertions(10);

    await tree1.setLeaf(16n, 16n);
    await tree1.setLeaf(46n, 46n);

    const cache2 = await CachedLinkedMerkleTreeStore.new(cache1);
    const tree2 = new LinkedMerkleTree(cache2);
    // Need to preload 0n, as well since the nextPath of the leaf would have changed
    // when other leaves were added.
    await cache2.preloadKeys([0n, 16n, 46n]);

    const leaf0 = tree1.getLeaf(0n);
    const leaf1 = tree1.getLeaf(16n);
    const leaf2 = tree1.getLeaf(46n);

    const leaf1Index = cache2.getLeafIndex(16n);
    const leaf2Index = cache2.getLeafIndex(46n);

    expectDefined(leaf1Index);
    expectDefined(leaf2Index);

    // The new leaves are at index 2 and 3, as the index 5 is auto-preloaded
    // as it is next to 0, and 0 is always preloaded as well as any relevant
    // nodes.
    expect(leaf1Index).toStrictEqual(2n);
    expect(leaf2Index).toStrictEqual(3n);

    expect(tree2.getNode(0, leaf1Index).toBigInt()).toBe(
      Poseidon.hash([leaf1.value, leaf1.path, leaf1.nextPath]).toBigInt()
    );
    expect(tree2.getNode(0, leaf2Index).toBigInt()).toBe(
      Poseidon.hash([leaf2.value, leaf2.path, leaf2.nextPath]).toBigInt()
    );

    expect(tree2.getLeaf(0n)).toEqual(leaf0);
    expect(tree2.getLeaf(16n)).toEqual(leaf1);
    expect(tree2.getLeaf(46n)).toEqual(leaf2);

    expect(tree2.getRoot().toString()).toStrictEqual(
      tree1.getRoot().toString()
    );
  });

  it("should preload through multiple levels and insert correctly at right index", async () => {
    await tree1.setLeaf(10n, 10n);
    await tree1.setLeaf(11n, 11n);
    await tree1.setLeaf(12n, 12n);
    await tree1.setLeaf(13n, 13n);

    // Nodes 0 and 5 should be auto-preloaded when cache2 is created
    // as 0 is the first and 5 is its sibling. Similarly, 12 and 13
    // should be preloaded as 13 is in the maximum index and 12 is its sibling.
    // Nodes 10 and 11 shouldn't be preloaded.
    // We auto-preload 0 whenever the parent cache is already created.

    const cache2 = await CachedLinkedMerkleTreeStore.new(cache1);
    const tree2 = new LinkedMerkleTree(cache2);

    // When we set this leaf the missing nodes are preloaded
    // as when we do a set we have to go through all the leaves to find
    // the one with the nextPath that is suitable
    await tree2.setLeaf(14n, 14n);

    const leaf = tree1.getLeaf(5n);
    const leaf2 = tree2.getLeaf(14n);

    const leaf5Index = cache2.getLeafIndex(5n);
    const leaf10Index = cache2.getLeafIndex(10n);
    const leaf11Index = cache2.getLeafIndex(11n);
    const leaf12Index = cache2.getLeafIndex(12n);
    const leaf13Index = cache2.getLeafIndex(13n);
    const leaf14Index = cache2.getLeafIndex(14n);

    expectDefined(leaf5Index);
    expectDefined(leaf10Index);
    expectDefined(leaf11Index);
    expectDefined(leaf12Index);
    expectDefined(leaf13Index);
    expectDefined(leaf14Index);

    expect(leaf5Index).toStrictEqual(1n);
    expect(leaf10Index).toStrictEqual(2n);
    expect(leaf11Index).toStrictEqual(3n);
    expect(leaf12Index).toStrictEqual(4n);
    expect(leaf13Index).toStrictEqual(5n);
    expect(leaf14Index).toStrictEqual(6n);

    expect(cache2.getNode(leaf5Index, 0)).toStrictEqual(
      Poseidon.hash([leaf.value, leaf.path, leaf.nextPath]).toBigInt()
    );
    expect(cache2.getNode(leaf14Index, 0)).toStrictEqual(
      Poseidon.hash([leaf2.value, leaf2.path, leaf2.nextPath]).toBigInt()
    );
  });

  it("should preload through multiple levels and insert correctly at right index - harder", async () => {
    await tree1.setLeaf(10n, 10n);
    await tree1.setLeaf(100n, 100n);
    await tree1.setLeaf(200n, 200n);
    await tree1.setLeaf(300n, 300n);
    await tree1.setLeaf(400n, 400n);
    await tree1.setLeaf(500n, 500n);

    // Nodes 0 and 5 should be auto-preloaded when cache2 is created
    // as 0 is the first and 5 is its sibling. Similarly, 400 and 500
    // should be preloaded as 500 is in the maximum index and 400 is its sibling.
    // Nodes 10 and 100, 300 and 400, shouldn't be preloaded.
    // Note We auto-preload 0 whenever the parent cache is already created.

    const cache2 = await CachedLinkedMerkleTreeStore.new(cache1);
    const tree2 = new LinkedMerkleTree(cache2);

    // When we set this leaf some of the missing nodes are preloaded
    // as when we do a set we have to go through all the leaves to find
    // the one with the nextPath that is suitable and this preloads that are missing before.
    // This means 10n will be preloaded and since 100n is its sibling this will be preloaded, too.
    // Note that the nodes 200n and 300n are not preloaded.
    await tree2.setLeaf(14n, 14n);

    const leaf = tree1.getLeaf(5n);
    const leaf2 = tree2.getLeaf(14n);

    const leaf5Index = cache2.getLeafIndex(5n);
    const leaf10Index = cache2.getLeafIndex(10n);
    const leaf100Index = cache2.getLeafIndex(100n);
    const leaf200Index = cache2.getLeafIndex(200n);
    const leaf300Index = cache2.getLeafIndex(300n);
    const leaf400Index = cache2.getLeafIndex(400n);
    const leaf500Index = cache2.getLeafIndex(500n);
    const leaf14Index = cache2.getLeafIndex(14n);

    expectDefined(leaf5Index);
    expectDefined(leaf10Index);
    expectDefined(leaf100Index);
    expectDefined(leaf400Index);
    expectDefined(leaf500Index);
    expectDefined(leaf14Index);

    expect(leaf5Index).toStrictEqual(1n);
    expect(leaf10Index).toStrictEqual(2n);
    expect(leaf100Index).toStrictEqual(3n);
    expect(leaf200Index).toStrictEqual(undefined);
    expect(leaf300Index).toStrictEqual(undefined);
    expect(leaf400Index).toStrictEqual(6n);
    expect(leaf500Index).toStrictEqual(7n);
    expect(leaf14Index).toStrictEqual(8n);

    expect(cache2.getNode(leaf5Index, 0)).toStrictEqual(
      Poseidon.hash([leaf.value, leaf.path, leaf.nextPath]).toBigInt()
    );
    expect(cache2.getNode(leaf14Index, 0)).toStrictEqual(
      Poseidon.hash([leaf2.value, leaf2.path, leaf2.nextPath]).toBigInt()
    );
    expect(tree1.getRoot()).not.toEqual(tree2.getRoot());
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

    await tree1.setLeaf(10n, 20n);

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

    await tree2.setLeaf(15n, 30n);

    expect(tree1.getRoot().toString()).not.toBe(tree2.getRoot().toString());

    cache2.mergeIntoParent();

    expect(tree1.getRoot().toString()).toBe(tree2.getRoot().toString());
    expect(tree1.getNode(0, 15n).toString()).toBe("30");

    await cache1.mergeIntoParent();

    const cachedStore = await CachedLinkedMerkleTreeStore.new(mainStore);
    await cachedStore.preloadKey(15n);

    expect(new LinkedMerkleTree(cachedStore).getRoot().toString()).toBe(
      tree2.getRoot().toString()
    );
  });
});
