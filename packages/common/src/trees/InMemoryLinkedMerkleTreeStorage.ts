import { LinkedMerkleTreeStore, LinkedNode } from "./LinkedMerkleTreeStore";

export class InMemoryLinkedMerkleTreeStorage implements LinkedMerkleTreeStore {
  protected nodes: {
    [key: number]: {
      [key: string]: LinkedNode;
    };
  } = {};

  public getNode(key: bigint, level: number): LinkedNode | undefined {
    return this.nodes[level]?.[key.toString()];
  }

  public setNode(key: bigint, level: number, value: LinkedNode): void {
    (this.nodes[level] ??= {})[key.toString()] = value;
  }
}
