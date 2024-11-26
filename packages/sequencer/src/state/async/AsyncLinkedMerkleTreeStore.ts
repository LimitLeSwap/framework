import { LinkedLeaf } from "@proto-kit/common";

import { MerkleTreeNode, MerkleTreeNodeQuery } from "./AsyncMerkleTreeStore";

export type StoredLeaf = { leaf: LinkedLeaf; index: bigint };

export interface AsyncLinkedMerkleTreeStore {
  openTransaction: () => Promise<void>;

  commit: () => Promise<void>;

  writeNodes: (nodes: MerkleTreeNode[]) => void;

  writeLeaves: (leaves: StoredLeaf[]) => void;

  getNodesAsync: (
    nodes: MerkleTreeNodeQuery[]
  ) => Promise<(bigint | undefined)[]>;

  getLeavesAsync: (paths: bigint[]) => Promise<(StoredLeaf | undefined)[]>;

  getMaximumIndexAsync: () => Promise<bigint | undefined>;

  // Doesn't return undefined as there should always be at least one leaf.
  getLeafLessOrEqualAsync: (path: bigint) => Promise<StoredLeaf>;
}
