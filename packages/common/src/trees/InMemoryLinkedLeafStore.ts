import { LinkedLeafStore, LinkedLeaf } from "./LinkedMerkleTreeStore";

export class InMemoryLinkedLeafStore implements LinkedLeafStore {
  public leaves: {
    [key: string]: { leaf: LinkedLeaf; index: bigint };
  } = {};

  public maximumIndex?: bigint;

  public getLeaf(
    path: bigint
  ): { leaf: LinkedLeaf; index: bigint } | undefined {
    return this.leaves[path.toString()];
  }

  public setLeaf(index: bigint, value: LinkedLeaf): void {
    const leaf = this.getLeaf(value.path);
    if (leaf !== undefined && leaf?.index !== index) {
      throw new Error("Cannot change index of existing leaf");
    }
    this.leaves[value.path.toString()] = { leaf: value, index: index };
    if (this.maximumIndex === undefined || index > this.maximumIndex) {
      this.maximumIndex = index;
    }
  }

  public getMaximumIndex(): bigint | undefined {
    return this.maximumIndex;
  }

  // This gets the leaf with the closest path.
  public getLeafLessOrEqual(path: bigint): { leaf: LinkedLeaf; index: bigint } {
    let largestLeaf = this.getLeaf(0n);
    if (largestLeaf === undefined) {
      throw new Error("Path 0n should always be defined");
    }
    while (largestLeaf.leaf.nextPath <= path) {
      const nextLeaf = this.getLeaf(largestLeaf.leaf.nextPath);
      if (nextLeaf === undefined) {
        throw new Error("Next Path should always be defined");
      }
      largestLeaf = nextLeaf;
    }
    return largestLeaf;
  }
}
