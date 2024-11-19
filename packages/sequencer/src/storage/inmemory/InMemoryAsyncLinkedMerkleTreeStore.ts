import {
  InMemoryLinkedMerkleTreeStorage,
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
  private readonly store = new InMemoryLinkedMerkleTreeStorage();

  public writeNodes(nodes: MerkleTreeNode[]): void {
    nodes.forEach(({ key, level, value }) =>
      this.store.setNode(key, level, value)
    );
  }

  public async commit(): Promise<void> {
    noop();
  }

  public async openTransaction(): Promise<void> {
    noop();
  }

  public async getNodesAsync(
    nodes: MerkleTreeNodeQuery[]
  ): Promise<(bigint | undefined)[]> {
    return nodes.map(({ key, level }) => this.store.getNode(key, level));
  }

  public async getLeavesAsync(paths: bigint[]) {
    return paths.map((path) => {
      const index = this.store.getLeafIndex(path);
      if (index !== undefined) {
        this.store.getLeaf(index);
      }
      return undefined;
    });
  }

  public writeLeaves(leaves: [string, LinkedLeaf][]) {
    leaves.forEach(([key, leaf]) => {
      this.store.setLeaf(BigInt(key), leaf);
    });
  }

  public getLeafIndex(path: bigint) {
    return this.store.getLeafIndex(path);
  }

  public getMaximumIndex() {
    return this.store.getMaximumIndex();
  }

  public getLeafByIndex(index: bigint) {
    return this.store.getLeaf(index);
  }
}
