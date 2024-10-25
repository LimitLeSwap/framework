export interface LinkedMerkleTreeStore {
  setNode: (
    key: bigint,
    level: number,
    node: { value: bigint; path: number; nextPath: number }
  ) => void;

  getNode: (key: bigint, level: number) => bigint | undefined;
}
