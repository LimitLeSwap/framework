// import { LinkedMerkleTreeStore } from "@proto-kit/common";

import { MerkleTreeNodeQuery } from "./AsyncMerkleTreeStore";

export interface LinkedMerkleTreeNode extends MerkleTreeNodeQuery {
  value: bigint;
  path: number;
  nextPath: number;
}

export interface AsyncLinkedMerkleTreeStore {
  openTransaction: () => Promise<void>;

  commit: () => Promise<void>;

  writeNodes: (nodes: LinkedMerkleTreeNode[]) => void;

  getNodesAsync: (
    nodes: MerkleTreeNodeQuery[]
  ) => Promise<(bigint | undefined)[]>;
}
