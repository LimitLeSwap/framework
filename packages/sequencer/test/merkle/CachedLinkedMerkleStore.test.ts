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
    tmpTree.setLeaf(5n, 10n);
    await cachedStore.mergeIntoParent();

    cache1 = await CachedLinkedMerkleTreeStore.new(mainStore);
    tree1 = new LinkedMerkleTree(cache1);
  });

  it("should cache multiple keys correctly", async () => {
    expect.assertions(13);

    tree1.setLeaf(16n, 16n);
    tree1.setLeaf(46n, 46n);

    const cache2 = await CachedLinkedMerkleTreeStore.new(cache1);
    const tree2 = new LinkedMerkleTree(cache2);
    // Need to preload 0n, as well since the nextPath of the leaf would have changed
    // when other leaves were added.
    await cache2.preloadKeys([0n, 16n, 46n]);

    const leaf0 = tree1.getLeaf(0n);
    const leaf1 = tree1.getLeaf(16n);
    const leaf2 = tree1.getLeaf(46n);

    expectDefined(leaf0);
    expectDefined(leaf1);
    expectDefined(leaf2);

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
    tree1.setLeaf(10n, 10n);
    tree1.setLeaf(11n, 11n);
    tree1.setLeaf(12n, 12n);
    tree1.setLeaf(13n, 13n);

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
    await cache2.loadUpKeysForClosestPath(14n);
    tree2.setLeaf(14n, 14n);

    const leaf = tree1.getLeaf(5n);
    const leaf2 = tree2.getLeaf(14n);

    expectDefined(leaf);
    expectDefined(leaf2);

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
    tree1.setLeaf(10n, 10n);
    tree1.setLeaf(100n, 100n);
    tree1.setLeaf(200n, 200n);
    tree1.setLeaf(300n, 300n);
    tree1.setLeaf(400n, 400n);
    tree1.setLeaf(500n, 500n);

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
    await cache2.loadUpKeysForClosestPath(14n);
    tree2.setLeaf(14n, 14n);

    const leaf = tree1.getLeaf(5n);
    const leaf2 = tree2.getLeaf(14n);

    expectDefined(leaf);
    expectDefined(leaf2);

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

  it("mimic transaction execution service", async () => {
    expect.assertions(20);

    const cache2 = new SyncCachedLinkedMerkleTreeStore(cache1);
    const treeCache1 = new LinkedMerkleTree(cache1);
    const treeCache2 = new LinkedMerkleTree(cache2);

    treeCache1.setLeaf(10n, 10n);
    treeCache1.setLeaf(20n, 20n);

    treeCache2.setLeaf(7n, 7n);
    cache2.mergeIntoParent();

    const leaves = await cache1.getLeavesAsync([0n, 5n, 7n, 10n, 20n]);
    expectDefined(leaves[0]);
    expectDefined(leaves[1]);
    expectDefined(leaves[2]);
    expectDefined(leaves[3]);
    expectDefined(leaves[4]);

    expect(leaves[0]).toEqual({
      value: 0n,
      path: 0n,
      nextPath: 5n,
    });
    expect(leaves[1]).toEqual({
      value: 10n,
      path: 5n,
      nextPath: 7n,
    });
    expect(leaves[2]).toEqual({
      value: 7n,
      path: 7n,
      nextPath: 10n,
    });
    expect(leaves[3]).toEqual({
      value: 10n,
      path: 10n,
      nextPath: 20n,
    });
    expect(leaves[4]).toEqual({
      value: 20n,
      path: 20n,
      nextPath: Field.ORDER - 1n,
    });

    const leaf0Index = cache1.getLeafIndex(0n);
    const leaf5Index = cache1.getLeafIndex(5n);
    const leaf7Index = cache1.getLeafIndex(7n);
    const leaf10Index = cache1.getLeafIndex(10n);
    const leaf20Index = cache1.getLeafIndex(20n);

    expectDefined(leaf0Index);
    await expect(
      cache1.getNodesAsync([{ key: leaf0Index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(0), Field(0), Field(5)]).toBigInt(),
    ]);
    expectDefined(leaf5Index);
    await expect(
      cache1.getNodesAsync([{ key: leaf5Index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(10), Field(5), Field(7)]).toBigInt(),
    ]);
    expectDefined(leaf7Index);
    await expect(
      cache1.getNodesAsync([{ key: leaf7Index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(7), Field(7), Field(10)]).toBigInt(),
    ]);
    expectDefined(leaf10Index);
    await expect(
      cache1.getNodesAsync([{ key: leaf10Index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(10), Field(10), Field(20)]).toBigInt(),
    ]);
    expectDefined(leaf20Index);
    await expect(
      cache1.getNodesAsync([{ key: leaf20Index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(20), Field(20), Field(Field.ORDER - 1n)]).toBigInt(),
    ]);
  });

  it("should cache correctly", async () => {
    expect.assertions(15);

    const cache2 = new SyncCachedLinkedMerkleTreeStore(cache1);
    const tree2 = new LinkedMerkleTree(cache2);

    const leaf1 = tree2.getLeaf(5n);
    const leaf1Index = cache2.getLeafIndex(5n);
    expectDefined(leaf1);
    expectDefined(leaf1Index);
    await expect(
      mainStore.getNodesAsync([{ key: leaf1Index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([leaf1.value, leaf1.path, leaf1.nextPath]).toBigInt(),
    ]);

    tree1.setLeaf(10n, 20n);

    const leaf2 = tree2.getLeaf(10n);
    const leaf2Index = cache2.getLeafIndex(10n);
    expectDefined(leaf2);
    expectDefined(leaf2Index);
    expect(tree2.getNode(0, leaf2Index).toBigInt()).toBe(
      Poseidon.hash([leaf2.value, leaf2.path, leaf2.nextPath]).toBigInt()
    );

    const witness = tree2.getWitness(5n);

    // We check tree1 and tree2 have same hash roots.
    // The witness is from tree2, which comes from cache2,
    // but which because of the sync is really just cache1.
    expect(
      witness.leafCurrent.merkleWitness
        .calculateRoot(
          Poseidon.hash([
            witness.leafCurrent.leaf.value,
            witness.leafCurrent.leaf.path,
            witness.leafCurrent.leaf.nextPath,
          ])
        )
        .toString()
    ).toBe(tree1.getRoot().toString());

    expect(
      witness.leafCurrent.merkleWitness
        .calculateRoot(Poseidon.hash([Field(11), Field(5n), Field(10n)]))
        .toString()
    ).not.toBe(tree1.getRoot().toString());

    const witness2 = tree1.getWitness(10n);

    expect(
      witness2.leafCurrent.merkleWitness
        .calculateRoot(
          Poseidon.hash([
            Field(20),
            Field(10n),
            witness2.leafCurrent.leaf.nextPath, // This is the maximum as the the leaf 10n should be the last
          ])
        )
        .toString()
    ).toBe(tree2.getRoot().toString());

    tree2.setLeaf(15n, 30n);

    // Won't be the same as the tree2 works on cache2 and these changes don't
    // carry up to cache1. Have to merge into parent for this.
    expect(tree1.getRoot().toString()).not.toBe(tree2.getRoot().toString());

    // After this the changes should be merged into the parents, i.e. cache1,
    // which tree1 has access to.
    cache2.mergeIntoParent();

    const index15 = cache2.getLeafIndex(15n);
    const leaf15 = tree2.getLeaf(15n);
    expectDefined(leaf15);
    expectDefined(index15);
    expect(tree1.getRoot().toString()).toBe(tree2.getRoot().toString());
    expect(tree1.getNode(0, index15).toString()).toBe(
      Poseidon.hash([leaf15.value, leaf15.path, leaf15.nextPath]).toString()
    );

    // Now the mainstore has the new 15n root.
    await cache1.mergeIntoParent();

    const cachedStore = await CachedLinkedMerkleTreeStore.new(mainStore);
    await cachedStore.preloadKey(15n);

    expect(new LinkedMerkleTree(cachedStore).getRoot().toString()).toBe(
      tree2.getRoot().toString()
    );
  });

  it("mimic transaction execution service further", async () => {
    expect.assertions(16);

    const mStore = new InMemoryAsyncLinkedMerkleTreeStore();
    const mCache = await CachedLinkedMerkleTreeStore.new(mStore);
    const mCache2 = new SyncCachedLinkedMerkleTreeStore(mCache);
    const treeCache1 = new LinkedMerkleTree(mCache);
    const treeCache2 = new LinkedMerkleTree(mCache2);

    treeCache1.setLeaf(10n, 10n);
    treeCache1.setLeaf(20n, 20n);

    treeCache2.setLeaf(7n, 7n);
    mCache2.mergeIntoParent();

    const leaves = await mCache.getLeavesAsync([0n, 7n, 10n, 20n]);
    expectDefined(leaves[0]);
    expectDefined(leaves[1]);
    expectDefined(leaves[2]);
    expectDefined(leaves[3]);

    expect(leaves[0]).toEqual({
      value: 0n,
      path: 0n,
      nextPath: 7n,
    });
    expect(leaves[1]).toEqual({
      value: 7n,
      path: 7n,
      nextPath: 10n,
    });
    expect(leaves[2]).toEqual({
      value: 10n,
      path: 10n,
      nextPath: 20n,
    });
    expect(leaves[3]).toEqual({
      value: 20n,
      path: 20n,
      nextPath: Field.ORDER - 1n,
    });

    const leaf0Index = mCache.getLeafIndex(0n);
    const leaf7Index = mCache.getLeafIndex(7n);
    const leaf10Index = mCache.getLeafIndex(10n);
    const leaf20Index = mCache.getLeafIndex(20n);

    expectDefined(leaf0Index);
    await expect(
      mCache.getNodesAsync([{ key: leaf0Index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(0), Field(0), Field(7)]).toBigInt(),
    ]);
    expectDefined(leaf7Index);
    await expect(
      mCache.getNodesAsync([{ key: leaf7Index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(7), Field(7), Field(10)]).toBigInt(),
    ]);
    expectDefined(leaf10Index);
    await expect(
      mCache.getNodesAsync([{ key: leaf10Index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(10), Field(10), Field(20)]).toBigInt(),
    ]);
    expectDefined(leaf20Index);
    await expect(
      mCache.getNodesAsync([{ key: leaf20Index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(20), Field(20), Field(Field.ORDER - 1n)]).toBigInt(),
    ]);
  });
});
