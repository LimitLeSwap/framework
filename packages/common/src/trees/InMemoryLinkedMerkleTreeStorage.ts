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

  public getLeafIndex(path: number): bigint | undefined {
    const leafIndex = Object.keys(this.leaves).find((key) => {
      return this.leaves[key].path === path;
    });
    if (leafIndex === undefined) {
      return undefined;
    }
    return BigInt(leafIndex);
  }
}
