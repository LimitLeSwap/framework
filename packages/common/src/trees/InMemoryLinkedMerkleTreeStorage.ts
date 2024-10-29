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

  public getNode(key: number, level: number): bigint | undefined {
    return this.nodes[level]?.[key];
  }

  public setNode(key: number, level: number, value: bigint): void {
    (this.nodes[level] ??= {})[key.toString()] = value;
  }

  public getLeaf(key: number): LinkedLeaf | undefined {
    return this.leaves[key];
  }

  public setLeaf(key: number, value: LinkedLeaf): void {
    this.leaves[key.toString()] = value;
  }

  public getIndex(path: number): string | undefined {
    return Object.keys(this.leaves).find((key) => {
      return this.leaves[key].path === path;
    });
  }
}
