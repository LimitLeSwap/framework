export interface LinkedMerkleTreeStore {
  setNode: (key: bigint, level: number, node: LinkedNode) => void;

  getNode: (key: bigint, level: number) => LinkedNode | undefined;
}

export type LinkedNode = { value: bigint; path: number; nextPath: number };
