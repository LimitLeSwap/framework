import {
  InMemoryLinkedMerkleTreeStorage,
  LinkedLeaf,
  LinkedMerkleTree,
  LinkedMerkleTreeStore,
} from "@proto-kit/common";

// This is mainly used for supporting the rollbacks we need to do in case a runtimemethod fails
// In this case everything should be preloaded in the parent async service
export class SyncCachedLinkedMerkleTreeStore extends InMemoryLinkedMerkleTreeStorage {
  public constructor(private readonly parent: LinkedMerkleTreeStore) {
    super();
  }

  public getNode(key: bigint, level: number): bigint | undefined {
    return super.getNode(key, level) ?? this.parent.getNode(key, level);
  }

  public setNode(key: bigint, level: number, value: bigint) {
    super.setNode(key, level, value);
  }

  public getLeaf(index: bigint): LinkedLeaf | undefined {
    return super.getLeaf(index) ?? this.parent.getLeaf(index);
  }

  public setLeaf(index: bigint, value: LinkedLeaf) {
    super.setLeaf(index, value);
  }

  // Need to make sure we call the parent as the super will usually be empty
  // The Tree calls this method.
  public getLeafIndex(path: bigint): bigint | undefined {
    return super.getLeafIndex(path) ?? this.parent.getLeafIndex(path);
  }

  // Need to make sure we call the parent as the super will usually be empty
  // The tree calls this method.
  public getMaximumIndex(): bigint | undefined {
    return this.parent.getMaximumIndex();
  }

  public getLeafLessOrEqual(path: bigint): LinkedLeaf {
    return (
      super.getLeafLessOrEqual(path) ?? this.parent.getLeafLessOrEqual(path)
    );
  }

  public mergeIntoParent() {
    if (Object.keys(this.leaves).length === 0) {
      return;
    }

    const { nodes, leaves } = this;
    Object.entries(leaves).forEach(([key, leaf]) =>
      this.parent.setLeaf(BigInt(key), leaf)
    );
    Array.from({ length: LinkedMerkleTree.HEIGHT }).forEach((ignored, level) =>
      Object.entries(nodes[level]).forEach((entry) => {
        this.parent.setNode(BigInt(entry[0]), level, entry[1]);
      })
    );

    this.leaves = {};
    this.nodes = {};
  }
}
