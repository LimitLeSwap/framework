export interface LinkedMerkleTreeStore {
  setNode: (index: bigint, level: number, value: bigint) => void;

  getNode: (index: bigint, level: number) => bigint | undefined;

  setLeaf: (index: bigint, value: LinkedLeaf) => void;

  getLeaf: (index: bigint) => LinkedLeaf | undefined;

  getLeafIndex: (path: number) => bigint | undefined;
}

export type LinkedLeaf = { value: bigint; path: number; nextPath: number };
