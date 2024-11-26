import {
  InMemoryLinkedLeafStore,
  InMemoryMerkleTreeStorage,
  LinkedLeaf,
  noop,
} from "@proto-kit/common";

import { AsyncLinkedMerkleTreeStore } from "../../state/async/AsyncLinkedMerkleTreeStore";
import {
  MerkleTreeNode,
  MerkleTreeNodeQuery,
} from "../../state/async/AsyncMerkleTreeStore";

export class InMemoryAsyncLinkedMerkleTreeStore
  implements AsyncLinkedMerkleTreeStore
{
  private readonly leafStore = new InMemoryLinkedLeafStore();

  private readonly nodeStore = new InMemoryMerkleTreeStorage();

  public async openTransaction(): Promise<void> {
    noop();
  }

  public async commit(): Promise<void> {
    noop();
  }

  public writeNodes(nodes: MerkleTreeNode[]): void {
    nodes.forEach(({ key, level, value }) =>
      this.nodeStore.setNode(key, level, value)
    );
  }

  // This is using the index/key
  public writeLeaves(leaves: { leaf: LinkedLeaf; index: bigint }[]) {
    leaves.forEach(({ leaf, index }) => {
      this.leafStore.setLeaf(index, leaf);
    });
  }

  public async getNodesAsync(
    nodes: MerkleTreeNodeQuery[]
  ): Promise<(bigint | undefined)[]> {
    return nodes.map(({ key, level }) => this.nodeStore.getNode(key, level));
  }

  public async getLeavesAsync(paths: bigint[]) {
    return paths.map((path) => {
      const leaf = this.leafStore.getLeaf(path);
      if (leaf !== undefined) {
        return leaf;
      }
      return undefined;
    });
  }

  public getMaximumIndexAsync() {
    return Promise.resolve(this.leafStore.getMaximumIndex());
  }

  public getLeafLessOrEqualAsync(path: bigint) {
    return Promise.resolve(this.leafStore.getLeafLessOrEqual(path));
  }
}
