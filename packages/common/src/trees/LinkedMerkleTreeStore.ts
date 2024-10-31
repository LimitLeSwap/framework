export interface LinkedMerkleTreeStore {
  setNode: (index: bigint, level: number, value: bigint) => void;

  getNode: (index: bigint, level: number) => bigint | undefined;

  setLeaf: (index: bigint, value: LinkedLeaf) => void;

  getLeaf: (index: bigint) => LinkedLeaf | undefined;

  getLeafIndex: (path: bigint) => bigint | undefined;

  getPathLessOrEqual: (path: bigint) => LinkedLeaf;

  getMaximumIndex: () => bigint;
}

export type LinkedLeaf = { value: bigint; path: bigint; nextPath: bigint };
