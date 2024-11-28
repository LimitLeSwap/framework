import { expectDefined, LinkedMerkleTree } from "@proto-kit/common";
import { beforeEach, expect } from "@jest/globals";
import { Field, Poseidon } from "o1js";

import { CachedLinkedMerkleTreeStore } from "../../src/state/merkle/CachedLinkedMerkleTreeStore";
import { InMemoryAsyncLinkedMerkleTreeStore } from "../../src/storage/inmemory/InMemoryAsyncLinkedMerkleTreeStore";
import { SyncCachedLinkedMerkleTreeStore } from "../../src/state/merkle/SyncCachedLinkedMerkleTreeStore";

describe("cached linked merkle store", () => {
  let mainStore: InMemoryAsyncLinkedMerkleTreeStore;

  let cache1: CachedLinkedMerkleTreeStore;
  let tree1: LinkedMerkleTree;

  beforeEach(async () => {
    mainStore = new InMemoryAsyncLinkedMerkleTreeStore();

    const cachedStore = await CachedLinkedMerkleTreeStore.new(mainStore);

    const tmpTree = new LinkedMerkleTree(cachedStore);
    tmpTree.setLeaf(5n, 10n);
    await cachedStore.mergeIntoParent();

    cache1 = await CachedLinkedMerkleTreeStore.new(mainStore);
    tree1 = new LinkedMerkleTree(cache1);
  });

  it("should cache multiple keys correctly", async () => {
    expect.assertions(11);
    await cache1.preloadKeys([16n, 46n]);
    tree1.setLeaf(16n, 16n);
    tree1.setLeaf(46n, 46n);

    const cache2 = new SyncCachedLinkedMerkleTreeStore(cache1);
    const tree2 = new LinkedMerkleTree(cache2);

    const leaf1 = tree1.getLeaf(16n);
    const leaf2 = tree1.getLeaf(46n);

    expectDefined(leaf1);
    expectDefined(leaf2);

    const storedLeaf1 = cache2.getLeaf(16n);
    const storedLeaf2 = cache2.getLeaf(46n);

    expectDefined(storedLeaf1);
    expectDefined(storedLeaf2);

    expect(storedLeaf1.index).toStrictEqual(2n);
    expect(storedLeaf2.index).toStrictEqual(3n);

    expect(tree2.getNode(0, storedLeaf1.index).toBigInt()).toBe(
      leaf1.hash().toBigInt()
    );
    expect(tree2.getNode(0, storedLeaf2.index).toBigInt()).toBe(
      leaf2.hash().toBigInt()
    );

    expect(tree2.getLeaf(16n)).toEqual(leaf1);
    expect(tree2.getLeaf(46n)).toEqual(leaf2);

    expect(tree2.getRoot().toString()).toStrictEqual(
      tree1.getRoot().toString()
    );
  });

  it("simple test - check hash of updated node is updated", async () => {
    // main store already has 0n and 5n paths defined.
    // preloading 10n should load up 5n in the cache1 leaf and node stores.
    await cache1.preloadKeys([10n]);

    expectDefined(cache1.getLeaf(5n));
    expectDefined(cache1.getNode(1n, 0));

    tree1.setLeaf(10n, 10n);
    await cache1.mergeIntoParent();

    const leaf5 = tree1.getLeaf(5n);
    const leaf10 = tree1.getLeaf(10n);
    expectDefined(leaf5);
    expectDefined(leaf10);

    const storedLeaf5 = cache1.getLeaf(5n);
    const storedLeaf10 = cache1.getLeaf(10n);

    expectDefined(storedLeaf5);
    expectDefined(storedLeaf10);

    expect(storedLeaf5).toStrictEqual({
      leaf: { value: 10n, path: 5n, nextPath: 10n },
      index: 1n,
    });
    expect(storedLeaf10.index).toStrictEqual(2n);

    // Check leaves were hashed properly when added to nodes/merkle-tree
    expect(cache1.getNode(storedLeaf10.index, 0)).toStrictEqual(
      leaf10.hash().toBigInt()
    );
    expect(cache1.getNode(storedLeaf5.index, 0)).toStrictEqual(
      leaf5.hash().toBigInt()
    );
  });

  it("should preload through multiple levels and insert correctly at right index", async () => {
    await cache1.preloadKeys([10n, 11n, 12n, 13n]);

    tree1.setLeaf(10n, 10n);
    tree1.setLeaf(11n, 11n);
    tree1.setLeaf(12n, 12n);
    tree1.setLeaf(13n, 13n);
    await cache1.mergeIntoParent();

    const cache2 = new SyncCachedLinkedMerkleTreeStore(cache1);
    await cache2.preloadKeys([14n]);

    const tree2 = new LinkedMerkleTree(cache2);
    tree2.setLeaf(14n, 14n);

    const leaf = tree1.getLeaf(5n);
    const leaf2 = tree2.getLeaf(14n);

    expectDefined(leaf);
    expectDefined(leaf2);

    const storedLeaf5 = cache2.getLeaf(5n);
    const storedLeaf10 = cache2.getLeaf(10n);
    const storedLeaf11 = cache2.getLeaf(11n);
    const storedLeaf12 = cache2.getLeaf(12n);
    const storedLeaf13 = cache2.getLeaf(13n);
    const storedLeaf14 = cache2.getLeaf(14n);

    expectDefined(storedLeaf5);
    expectDefined(storedLeaf10);
    expectDefined(storedLeaf11);
    expectDefined(storedLeaf12);
    expectDefined(storedLeaf13);
    expectDefined(storedLeaf14);

    expect(storedLeaf5.index).toStrictEqual(1n);
    expect(storedLeaf10.index).toStrictEqual(2n);
    expect(storedLeaf11.index).toStrictEqual(3n);
    expect(storedLeaf12.index).toStrictEqual(4n);
    expect(storedLeaf13.index).toStrictEqual(5n);
    expect(storedLeaf14.index).toStrictEqual(6n);

    // Check leaves were hashed properly when added to nodes/merkle-tree
    expect(cache1.getNode(storedLeaf5.index, 0)).toStrictEqual(
      leaf.hash().toBigInt()
    );
    expect(cache2.getNode(storedLeaf14.index, 0)).toStrictEqual(
      leaf2.hash().toBigInt()
    );
  });

  it("should preload through multiple levels and insert correctly at right index - harder", async () => {
    await cache1.preloadKeys([10n, 100n, 200n, 300n, 400n, 500n]);

    tree1.setLeaf(10n, 10n);
    tree1.setLeaf(100n, 100n);
    tree1.setLeaf(200n, 200n);
    tree1.setLeaf(300n, 300n);
    tree1.setLeaf(400n, 400n);
    tree1.setLeaf(500n, 500n);

    const cache2 = new SyncCachedLinkedMerkleTreeStore(cache1);
    await cache2.preloadKeys([14n]);
    const tree2 = new LinkedMerkleTree(cache2);
    tree2.setLeaf(14n, 14n);

    const leaf = tree1.getLeaf(5n);
    const leaf2 = tree2.getLeaf(14n);

    expectDefined(leaf);
    expectDefined(leaf2);

    const storedLeaf5 = cache2.getLeaf(5n);
    const storedLeaf10 = cache2.getLeaf(10n);
    const storedLeaf100 = cache2.getLeaf(100n);
    const storedLeaf200 = cache2.getLeaf(200n);
    const storedLeaf300 = cache2.getLeaf(300n);
    const storedLeaf400 = cache2.getLeaf(400n);
    const storedLeaf500 = cache2.getLeaf(500n);
    const storedLeaf14 = cache2.getLeaf(14n);

    expectDefined(storedLeaf5);
    expectDefined(storedLeaf10);
    expectDefined(storedLeaf100);
    expectDefined(storedLeaf200);
    expectDefined(storedLeaf300);
    expectDefined(storedLeaf400);
    expectDefined(storedLeaf500);
    expectDefined(storedLeaf14);

    expect(storedLeaf5.index).toStrictEqual(1n);
    expect(storedLeaf10.index).toStrictEqual(2n);
    expect(storedLeaf100.index).toStrictEqual(3n);
    expect(storedLeaf200?.index).toStrictEqual(4n);
    expect(storedLeaf300?.index).toStrictEqual(5n);
    expect(storedLeaf400.index).toStrictEqual(6n);
    expect(storedLeaf500.index).toStrictEqual(7n);
    expect(storedLeaf14.index).toStrictEqual(8n);

    expect(cache1.getNode(storedLeaf5.index, 0)).toStrictEqual(
      leaf.hash().toBigInt()
    );
    expect(cache2.getNode(storedLeaf14.index, 0)).toStrictEqual(
      leaf2.hash().toBigInt()
    );
    expect(tree1.getRoot()).not.toEqual(tree2.getRoot());
    await cache2.mergeIntoParent();
    expect(tree1.getRoot()).toEqual(tree2.getRoot());
  });

  it("mimic transaction execution service", async () => {
    expect.assertions(18);

    const treeCache1 = new LinkedMerkleTree(cache1);
    await cache1.preloadKeys([10n, 20n]);
    treeCache1.setLeaf(10n, 10n);
    treeCache1.setLeaf(20n, 20n);
    await cache1.mergeIntoParent();

    const cache2 = new SyncCachedLinkedMerkleTreeStore(cache1);
    const treeCache2 = new LinkedMerkleTree(cache2);
    await cache2.preloadKeys([7n]);
    treeCache2.setLeaf(7n, 7n);
    cache2.mergeIntoParent();

    const leaves = await cache1.getLeavesAsync([0n, 5n, 7n, 10n, 20n]);
    expectDefined(leaves[0]);
    expectDefined(leaves[1]);
    expectDefined(leaves[2]);
    expectDefined(leaves[3]);
    expectDefined(leaves[4]);

    expect(leaves[0]?.leaf).toEqual({
      value: 0n,
      path: 0n,
      nextPath: 5n,
    });
    expect(leaves[1]?.leaf).toEqual({
      value: 10n,
      path: 5n,
      nextPath: 7n,
    });
    expect(leaves[2]?.leaf).toEqual({
      value: 7n,
      path: 7n,
      nextPath: 10n,
    });
    expect(leaves[3]?.leaf).toEqual({
      value: 10n,
      path: 10n,
      nextPath: 20n,
    });
    expect(leaves[4]?.leaf).toEqual({
      value: 20n,
      path: 20n,
      nextPath: Field.ORDER - 1n,
    });

    const storedLeaf5 = cache1.getLeaf(5n);
    const storedLeaf7 = cache1.getLeaf(7n);
    const storedLeaf10 = cache1.getLeaf(10n);
    const storedLeaf20 = cache1.getLeaf(20n);

    expectDefined(storedLeaf5);
    await expect(
      cache1.getNodesAsync([{ key: storedLeaf5.index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(10), Field(5), Field(7)]).toBigInt(),
    ]);
    expectDefined(storedLeaf7);
    await expect(
      cache1.getNodesAsync([{ key: storedLeaf7.index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(7), Field(7), Field(10)]).toBigInt(),
    ]);
    expectDefined(storedLeaf10);
    await expect(
      cache1.getNodesAsync([{ key: storedLeaf10.index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(10), Field(10), Field(20)]).toBigInt(),
    ]);
    expectDefined(storedLeaf20);
    await expect(
      cache1.getNodesAsync([{ key: storedLeaf20.index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(20), Field(20), Field(Field.ORDER - 1n)]).toBigInt(),
    ]);
  });

  it("should cache correctly", async () => {
    expect.assertions(15);

    const cache2 = new SyncCachedLinkedMerkleTreeStore(cache1);
    const tree2 = new LinkedMerkleTree(cache2);

    await cache2.preloadKeys([5n]);
    const leaf1 = tree2.getLeaf(5n);
    const storedLeaf1 = cache2.getLeaf(5n);
    expectDefined(leaf1);
    expectDefined(storedLeaf1);
    await expect(
      mainStore.getNodesAsync([{ key: storedLeaf1.index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([leaf1.value, leaf1.path, leaf1.nextPath]).toBigInt(),
    ]);

    tree1.setLeaf(10n, 20n);

    const leaf2 = tree2.getLeaf(10n);
    const storedLeaf2 = cache2.getLeaf(10n);
    expectDefined(leaf2);
    expectDefined(storedLeaf2);
    expect(tree2.getNode(0, storedLeaf2.index).toBigInt()).toBe(
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

    const storedLeaf15 = cache2.getLeaf(15n);
    const leaf15 = tree2.getLeaf(15n);
    expectDefined(leaf15);
    expectDefined(storedLeaf15);
    expect(tree1.getRoot().toString()).toBe(tree2.getRoot().toString());
    expect(tree1.getNode(0, storedLeaf15.index).toString()).toBe(
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

    await mCache.preloadKeys([5n]);
    treeCache1.setLeaf(10n, 10n);
    treeCache1.setLeaf(20n, 20n);

    await mCache2.preloadKeys([7n]);
    treeCache2.setLeaf(7n, 7n);
    mCache2.mergeIntoParent();

    const leaves = await mCache.getLeavesAsync([0n, 7n, 10n, 20n]);
    expectDefined(leaves[0]);
    expectDefined(leaves[1]);
    expectDefined(leaves[2]);
    expectDefined(leaves[3]);

    expect(leaves[0]?.leaf).toEqual({
      value: 0n,
      path: 0n,
      nextPath: 7n,
    });
    expect(leaves[1]?.leaf).toEqual({
      value: 7n,
      path: 7n,
      nextPath: 10n,
    });
    expect(leaves[2]?.leaf).toEqual({
      value: 10n,
      path: 10n,
      nextPath: 20n,
    });
    expect(leaves[3]?.leaf).toEqual({
      value: 20n,
      path: 20n,
      nextPath: Field.ORDER - 1n,
    });

    const storedLeaf0 = mCache.getLeaf(0n);
    const storedLeaf7 = mCache.getLeaf(7n);
    const storedLeaf10 = mCache.getLeaf(10n);
    const storedLeaf20 = mCache.getLeaf(20n);

    expectDefined(storedLeaf0);
    await expect(
      mCache.getNodesAsync([{ key: storedLeaf0.index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(0), Field(0), Field(7)]).toBigInt(),
    ]);
    expectDefined(storedLeaf7);
    await expect(
      mCache.getNodesAsync([{ key: storedLeaf7.index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(7), Field(7), Field(10)]).toBigInt(),
    ]);
    expectDefined(storedLeaf10);
    await expect(
      mCache.getNodesAsync([{ key: storedLeaf10.index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(10), Field(10), Field(20)]).toBigInt(),
    ]);
    expectDefined(storedLeaf20);
    await expect(
      mCache.getNodesAsync([{ key: storedLeaf20.index, level: 0 }])
    ).resolves.toStrictEqual([
      Poseidon.hash([Field(20), Field(20), Field(Field.ORDER - 1n)]).toBigInt(),
    ]);
  });
});
