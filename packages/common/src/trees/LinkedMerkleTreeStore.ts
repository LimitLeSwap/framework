export interface LinkedMerkleTreeStore {
  setNode: (key: number, level: number, value: bigint) => void;

  getNode: (key: number, level: number) => bigint | undefined;

  setLeaf: (key: number, value: LinkedLeaf) => void;

  getLeaf: (key: number) => LinkedLeaf | undefined;

  getIndex: (path: number) => string | undefined;
}

export type LinkedLeaf = { value: bigint; path: number; nextPath: number };
