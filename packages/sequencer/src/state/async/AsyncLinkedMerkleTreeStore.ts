import { LinkedLeaf } from "@proto-kit/common";

import { MerkleTreeNode, MerkleTreeNodeQuery } from "./AsyncMerkleTreeStore";

export interface AsyncLinkedMerkleTreeStore {
  openTransaction: () => Promise<void>;

  commit: () => Promise<void>;

  writeNodes: (nodes: MerkleTreeNode[]) => void;

  writeLeaves: (leaves: [string, LinkedLeaf][]) => void;

  getNodesAsync: (
    nodes: MerkleTreeNodeQuery[]
  ) => Promise<(bigint | undefined)[]>;

  getLeavesAsync: (paths: bigint[]) => Promise<(LinkedLeaf | undefined)[]>;

  getLeafIndex: (path: bigint) => bigint | undefined;

  getPathLessOrEqual: (path: bigint) => LinkedLeaf;

  getMaximumIndex: () => bigint;

  // For the preloadedKeys functionality
  getLeafByIndex: (index: bigint) => LinkedLeaf | undefined;
}
