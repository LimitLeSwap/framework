import { MerkleTreeStore } from "./MerkleTreeStore";

export interface LinkedMerkleTreeStore extends MerkleTreeStore {
  setNode: (index: bigint, level: number, value: bigint) => void;

  getNode: (index: bigint, level: number) => bigint | undefined;

  setLeaf: (index: bigint, value: LinkedLeaf) => void;

  getLeaf: (index: bigint) => LinkedLeaf | undefined;

  getLeafIndex: (path: bigint) => bigint | undefined;

  getLeafLessOrEqual: (path: bigint) => Promise<LinkedLeaf>;

  getMaximumIndex: () => bigint;
}

export type LinkedLeaf = { value: bigint; path: bigint; nextPath: bigint };
