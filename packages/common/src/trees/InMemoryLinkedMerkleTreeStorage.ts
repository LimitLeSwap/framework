import { LinkedMerkleTreeStore, LinkedLeaf } from "./LinkedMerkleTreeStore";

export class InMemoryLinkedMerkleTreeStorage implements LinkedMerkleTreeStore {
  protected nodes: {
    [key: number]: {
      [key: string]: bigint;
    };
  } = {};

  protected leaves: {
    [key: string]: LinkedLeaf;
  } = {};

  public getNode(index: bigint, level: number): bigint | undefined {
    return this.nodes[level]?.[index.toString()];
  }

  public setNode(index: bigint, level: number, value: bigint): void {
    (this.nodes[level] ??= {})[index.toString()] = value;
  }

  public getLeaf(index: bigint): LinkedLeaf | undefined {
    return this.leaves[index.toString()];
  }

  public setLeaf(index: bigint, value: LinkedLeaf): void {
    this.leaves[index.toString()] = value;
  }

  public getLeafIndex(path: bigint): bigint | undefined {
    const leafIndex = Object.keys(this.leaves).find((key) => {
      return this.leaves[key].path === path;
    });
    if (leafIndex === undefined) {
      return undefined;
    }
    return BigInt(leafIndex);
  }

  public getMaximumIndex(): bigint {
    return BigInt(Object.keys(this.leaves).length) - 1n;
  }

  // This gets the leaf with the closest path.
  public getPathLessOrEqual(path: bigint): LinkedLeaf {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    let largestLeaf = this.getLeaf(0n) as LinkedLeaf;
    while (largestLeaf.nextPath <= path) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const nextIndex = this.getLeafIndex(largestLeaf.nextPath) as bigint;
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      largestLeaf = this.getLeaf(nextIndex) as LinkedLeaf;
    }
    return largestLeaf;
  }
}
