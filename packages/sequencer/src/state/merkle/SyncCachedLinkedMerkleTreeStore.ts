import {
  LinkedLeaf,
  LinkedMerkleTree,
  InMemoryLinkedLeafStore,
  InMemoryMerkleTreeStorage,
  PreloadingLinkedMerkleTreeStore,
} from "@proto-kit/common";

import { StoredLeaf } from "../async/AsyncLinkedMerkleTreeStore";

// This is mainly used for supporting the rollbacks we need to do in case a runtimemethod fails
// In this case everything should be preloaded in the parent async service
export class SyncCachedLinkedMerkleTreeStore
  implements PreloadingLinkedMerkleTreeStore
{
  private readonly leafStore = new InMemoryLinkedLeafStore();

  private readonly nodeStore = new InMemoryMerkleTreeStorage();

  public constructor(
    private readonly parent: PreloadingLinkedMerkleTreeStore
  ) {}

  public getNode(key: bigint, level: number): bigint | undefined {
    return (
      this.nodeStore.getNode(key, level) ?? this.parent.getNode(key, level)
    );
  }

  public setNode(key: bigint, level: number, value: bigint) {
    this.nodeStore.setNode(key, level, value);
  }

  public getLeaf(index: bigint): StoredLeaf | undefined {
    return this.leafStore.getLeaf(index) ?? this.parent.getLeaf(index);
  }

  public setLeaf(index: bigint, value: LinkedLeaf) {
    this.leafStore.setLeaf(index, value);
  }

  // Need to make sure we call the parent as the super will usually be empty
  // The tree calls this method.
  public getMaximumIndex(): bigint | undefined {
    return this.parent.getMaximumIndex();
  }

  public getLeafLessOrEqual(path: bigint): StoredLeaf {
    return (
      this.leafStore.getLeafLessOrEqual(path) ??
      this.parent.getLeafLessOrEqual(path)
    );
  }

  public async preloadKeys(path: bigint[]) {
    await this.parent.preloadKeys(path);
  }

  public mergeIntoParent() {
    if (Object.keys(this.leafStore.leaves).length === 0) {
      return;
    }

    Object.values(this.leafStore.leaves).forEach(({ leaf, index }) =>
      this.parent.setLeaf(index, leaf)
    );
    Array.from({ length: LinkedMerkleTree.HEIGHT }).forEach((ignored, level) =>
      Object.entries(this.nodeStore.nodes[level]).forEach((entry) => {
        this.parent.setNode(BigInt(entry[0]), level, entry[1]);
      })
    );

    this.leafStore.leaves = {};
    this.nodeStore.nodes = {};
  }
}
