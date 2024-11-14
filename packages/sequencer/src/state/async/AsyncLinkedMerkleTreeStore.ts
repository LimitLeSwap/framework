import { MerkleTreeNodeQuery } from "./AsyncMerkleTreeStore";

export interface LinkedMerkleTreeLeafQuery {
  value: bigint;
  path: bigint;
  nextPath: bigint;
}

export interface AsyncLinkedMerkleTreeStore {
  openTransaction: () => Promise<void>;

  commit: () => Promise<void>;

  writeNodes: (nodes: MerkleTreeNodeQuery[]) => void;

  writeLeaves: (leaves: LinkedMerkleTreeLeafQuery[]) => void;

  getNodesAsync: (
    nodes: MerkleTreeNodeQuery[]
  ) => Promise<(bigint | undefined)[]>;

  getLeavesAsync: (
    leaves: LinkedMerkleTreeLeafQuery[]
  ) => Promise<
    ({ value: bigint; path: bigint; nextPath: bigint } | undefined)[]
  >;
}
