import { MerkleTreeStore } from "./MerkleTreeStore";

export interface LinkedMerkleTreeStore extends MerkleTreeStore {
  setNode: (index: bigint, level: number, value: bigint) => void;

  getNode: (index: bigint, level: number) => bigint | undefined;

  setLeaf: (index: bigint, value: LinkedLeaf) => void;

  getLeaf: (path: bigint) => { leaf: LinkedLeaf; index: bigint } | undefined;

  // getLeafIndex: (path: bigint) => bigint | undefined;

  getLeafLessOrEqual: (path: bigint) => { leaf: LinkedLeaf; index: bigint };

  getMaximumIndex: () => bigint | undefined;
}

export type LinkedLeaf = { value: bigint; path: bigint; nextPath: bigint };
