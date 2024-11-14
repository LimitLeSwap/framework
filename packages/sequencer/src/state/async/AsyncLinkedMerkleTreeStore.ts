import { MerkleTreeNodeQuery } from "./AsyncMerkleTreeStore";

export interface LinkedMerkleTreeLeaf {
  value: bigint;
  path: bigint;
  nextPath: bigint;
}

export interface AsyncLinkedMerkleTreeStore {
  openTransaction: () => Promise<void>;

  commit: () => Promise<void>;

  writeNodes: (nodes: MerkleTreeNodeQuery[]) => void;

  writeLeaves: (leaves: LinkedMerkleTreeLeaf[]) => void;

  getNodesAsync: (
    nodes: MerkleTreeNodeQuery[]
  ) => Promise<(bigint | undefined)[]>;

  getLeavesAsync: (
    leaves: LinkedMerkleTreeLeaf[]
  ) => Promise<
    ({ value: bigint; path: bigint; nextPath: bigint } | undefined)[]
  >;
}
