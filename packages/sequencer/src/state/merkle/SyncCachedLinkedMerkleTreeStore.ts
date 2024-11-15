import {
  InMemoryLinkedMerkleTreeStorage,
  LinkedLeaf,
  LinkedMerkleTree,
  LinkedMerkleTreeStore,
} from "@proto-kit/common";

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

  public mergeIntoParent() {
    if (Object.keys(this.leaves).length === 0) {
      return;
    }

    const { nodes, leaves } = this;
    Object.entries(leaves).forEach(([key, leaf]) =>
      this.setLeaf(BigInt(key), leaf)
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
