import { MerkleTreeNode, MerkleTreeNodeQuery } from "@proto-kit/sequencer";
import { LinkedLeaf, log, noop } from "@proto-kit/common";
import { AsyncLinkedMerkleTreeStore } from "@proto-kit/sequencer/dist/state/async/AsyncLinkedMerkleTreeStore";

import type { RedisConnection } from "../../RedisConnection";

export class RedisLinkedMerkleTreeStore implements AsyncLinkedMerkleTreeStore {
  private cache: MerkleTreeNode[] = [];

  public constructor(
    private readonly connection: RedisConnection,
    private readonly mask: string = "base"
  ) {}

  private getKey(node: MerkleTreeNodeQuery): string {
    return `${this.mask}:${node.level}:${node.key.toString()}`;
  }

  public async openTransaction(): Promise<void> {
    noop();
  }

  public async commit(): Promise<void> {
    const start = Date.now();
    const array: [string, string][] = this.cache.map(
      ({ key, level, value }) => [this.getKey({ key, level }), value.toString()]
    );

    if (array.length === 0) {
      return;
    }

    try {
      await this.connection.redisClient.mSet(array.flat(1));
    } catch (error) {
      log.error(error);
    }
    log.trace(
      `Committing ${array.length} kv-pairs took ${Date.now() - start} ms`
    );

    this.cache = [];
  }

  public async getNodesAsync(
    nodes: MerkleTreeNodeQuery[]
  ): Promise<(bigint | undefined)[]> {
    if (nodes.length === 0) {
      return [];
    }

    const keys = nodes.map((node) => this.getKey(node));

    const result = await this.connection.redisClient.mGet(keys);

    return result.map((x) => (x !== null ? BigInt(x) : undefined));
  }

  public writeNodes(nodes: MerkleTreeNode[]): void {
    this.cache = this.cache.concat(nodes);
  }

  public writeLeaves(leaves: [string, LinkedLeaf][]) {}

  public getLeavesAsync(paths: bigint[]) {
    return Promise.resolve([undefined]);
  }

  public getLeafIndex(path: bigint) {
    return 0n;
  }

  public getMaximumIndex() {
    return 0n;
  }

  public getLeafByIndex(index: bigint) {
    return {
      value: 0n,
      path: 0n,
      nextPath: 0n,
    };
  }
}
