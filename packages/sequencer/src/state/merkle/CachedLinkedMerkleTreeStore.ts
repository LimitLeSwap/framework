import {
  log,
  noop,
  InMemoryLinkedMerkleTreeStorage,
  LinkedLeaf,
} from "@proto-kit/common";

import {
  MerkleTreeNode,
  MerkleTreeNodeQuery,
} from "../async/AsyncMerkleTreeStore";
import { AsyncLinkedMerkleTreeStore } from "../async/AsyncLinkedMerkleTreeStore";

export class CachedLinkedMerkleTreeStore
  extends InMemoryLinkedMerkleTreeStorage
  implements AsyncLinkedMerkleTreeStore
{
  private writeCache: {
    nodes: {
      [key: number]: {
        [key: string]: bigint;
      };
    };
    leaves: {
      [key: string]: LinkedLeaf;
    };
  } = { nodes: {}, leaves: {} };

  public async openTransaction(): Promise<void> {
    noop();
  }

  public async commit(): Promise<void> {
    noop();
  }

  private constructor(private readonly parent: AsyncLinkedMerkleTreeStore) {
    super();
  }

  public static async new(
    parent: AsyncLinkedMerkleTreeStore
  ): Promise<CachedLinkedMerkleTreeStore> {
    const cachedInstance = new CachedLinkedMerkleTreeStore(parent);
    const maxIndex = parent.getMaximumIndex();
    // If the parent is populated then we
    // load up the first key and the last key.
    // The last key is to ensure we do not overwrite
    // any existing paths when we insert a new node/leaf.
    if (maxIndex > 0) {
      const leaf = parent.getLeafByIndex(maxIndex);
      if (leaf === undefined) {
        throw Error("Max Path is not defined");
      }
      await cachedInstance.preloadKeys([0n, leaf.path]);
    } else {
      await cachedInstance.preloadKeys([0n]);
    }
    return cachedInstance;
  }

  // This gets the nodes from the in memory store (which looks also to be the cache).
  public getNode(key: bigint, level: number): bigint | undefined {
    return super.getNode(key, level);
  }

  // This gets the nodes from the in memory store.
  // If the node is not in the in-memory store it goes to the parent (i.e.
  // what's put in the constructor).
  public async getNodesAsync(
    nodes: MerkleTreeNodeQuery[]
  ): Promise<(bigint | undefined)[]> {
    const results = Array<bigint | undefined>(nodes.length).fill(undefined);

    const toFetch: MerkleTreeNodeQuery[] = [];

    nodes.forEach((node, index) => {
      const localResult = this.getNode(node.key, node.level);
      if (localResult !== undefined) {
        results[index] = localResult;
      } else {
        toFetch.push(node);
      }
    });

    // Reverse here, so that we can use pop() later
    const fetchResult = (await this.parent.getNodesAsync(toFetch)).reverse();

    results.forEach((result, index) => {
      if (result === undefined) {
        results[index] = fetchResult.pop();
      }
    });

    return results;
  }

  // This sets the nodes in the cache and in the in-memory tree.
  public setNode(key: bigint, level: number, value: bigint) {
    super.setNode(key, level, value);
    (this.writeCache.nodes[level] ??= {})[key.toString()] = value;
  }

  // This is basically setNode (cache and in-memory) for a list of nodes.
  // Looks only to be used in the mergeIntoParent
  public writeNodes(nodes: MerkleTreeNode[]) {
    nodes.forEach(({ key, level, value }) => {
      this.setNode(key, level, value);
    });
  }

  // This gets the nodes from the in memory store (which looks also to be the cache).
  private getLeafByPath(path: bigint) {
    const index = super.getLeafIndex(path);
    if (index !== undefined) {
      return super.getLeaf(index);
    }
    return undefined;
  }

  // This gets the leaves and the nodes from the in memory store.
  // If the leaf is not in the in-memory store it goes to the parent (i.e.
  // what's put in the constructor).
  public async getLeavesAsync(paths: bigint[]) {
    const results = Array<LinkedLeaf | undefined>(paths.length).fill(undefined);

    const toFetch: bigint[] = [];

    paths.forEach((path, index) => {
      const localResult = this.getLeafByPath(path);
      if (localResult !== undefined) {
        results[index] = localResult;
      } else {
        toFetch.push(path);
      }
    });

    // Reverse here, so that we can use pop() later
    const fetchResult = (await this.parent.getLeavesAsync(toFetch)).reverse();

    results.forEach((result, index) => {
      if (result === undefined) {
        results[index] = fetchResult.pop();
      }
    });

    return results;
  }

  // This is just used in the mergeIntoParent.
  // It doesn't need any fancy logic and just updates the leaves.
  // I don't think we need to coordinate this with the nodes
  // or do any calculations. Just a straight copy and paste.
  public writeLeaves(leaves: [string, LinkedLeaf][]) {
    leaves.forEach(([key, leaf]) => {
      this.setLeaf(BigInt(key), leaf);
    });
  }

  public setLeaf(key: bigint, leaf: LinkedLeaf) {
    this.writeCache.leaves[key.toString()] = leaf;
    super.setLeaf(BigInt(key), leaf);
  }

  public getLeafByIndex(index: bigint) {
    return super.getLeaf(index);
  }

  // This gets the nodes from the cache.
  // Only used in mergeIntoParent
  public getWrittenNodes(): {
    [key: number]: {
      [key: string]: bigint;
    };
  } {
    return this.writeCache.nodes;
  }

  // This gets the leaves from the cache.
  // Only used in mergeIntoParent
  public getWrittenLeaves(): {
    [key: string]: LinkedLeaf;
  } {
    return this.writeCache.leaves;
  }

  // This ensures all the keys needed to be loaded
  // to find the closest path are loaded.
  // A bit repetitive as we basically repeat the process
  // (without the loading) when we find the closest leaf.
  // TODO: see how we could sue a returned value.
  public async loadUpKeysForClosestPath(path: bigint): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    let largestLeaf = this.getLeaf(0n) as LinkedLeaf;
    while (largestLeaf.nextPath <= path) {
      let nextLeaf = this.getLeafByPath(largestLeaf.nextPath);
      // This means the nextPath wasn't preloaded and we have to load it.
      if (nextLeaf === undefined) {
        // eslint-disable-next-line no-await-in-loop
        await this.preloadKey(largestLeaf.nextPath);
        nextLeaf = this.getLeafByPath(largestLeaf.nextPath);
        if (nextLeaf === undefined) {
          throw Error(" Next Path is defined but not fetched");
        }
      }
      largestLeaf = nextLeaf;
    }
  }

  // This resets the cache (not the in memory tree).
  public resetWrittenTree() {
    this.writeCache = { nodes: {}, leaves: {} };
  }

  // Used only in the preloadKeys
  // Basically, gets all of the relevant nodes (and siblings) in the Merkle tree
  // at the various levels required to produce a witness for the given index (at level 0).
  // But only gets those that aren't already in the cache.
  private collectNodesToFetch(index: bigint) {
    // This is hardcoded, but should be changed.
    const HEIGHT = 40n;
    const leafCount = 2n ** (HEIGHT - 1n);

    let currentIndex = index >= leafCount ? index % leafCount : index;

    const nodesToRetrieve: MerkleTreeNodeQuery[] = [];

    for (let level = 0; level < HEIGHT; level++) {
      const key = currentIndex;

      const isLeft = key % 2n === 0n;
      const siblingKey = isLeft ? key + 1n : key - 1n;

      // Only preload node if it is not already preloaded.
      // We also don't want to overwrite because changes will get lost (tracing)
      if (this.getNode(key, level) === undefined) {
        nodesToRetrieve.push({
          key,
          level,
        });
        if (level === 0) {
          log.trace(`Queued preloading of ${key} @ ${level}`);
        }
      }

      if (this.getNode(siblingKey, level) === undefined) {
        nodesToRetrieve.push({
          key: siblingKey,
          level,
        });
      }
      currentIndex /= 2n;
    }
    return nodesToRetrieve;
  }

  // Takes a list of keys and for each key collects the relevant nodes from the
  // parent tree and sets the leaf and node in the cached tree (and in-memory tree).
  public async preloadKeys(paths: bigint[]) {
    const nodesToRetrieve = paths.flatMap((path) => {
      const pathIndex = this.parent.getLeafIndex(path) ?? 0n;
      return this.collectNodesToFetch(pathIndex);
    });

    const resultsNode = await this.parent.getNodesAsync(nodesToRetrieve);
    let index = 0;
    for (const retrievedNode of nodesToRetrieve) {
      const { key, level } = retrievedNode;
      const value = resultsNode[index];
      if (value !== undefined) {
        this.setNode(key, level, value);
        if (level === 0) {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          const resultLeaf = this.parent.getLeafByIndex(key) as LinkedLeaf;
          super.setLeaf(key, resultLeaf);
          this.writeCache.leaves[key.toString()] = resultLeaf;
        }
      }
      index += 1;
    }
  }

  // This is preloadKeys with just one index/key.
  public async preloadKey(path: bigint): Promise<void> {
    await this.preloadKeys([path]);
  }

  // This merges the cache into the parent tree and resets the cache, but not the
  //  in-memory merkle tree.
  public async mergeIntoParent(): Promise<void> {
    // In case no state got set we can skip this step
    if (Object.keys(this.writeCache.leaves).length === 0) {
      return;
    }

    await this.parent.openTransaction();
    const nodes = this.getWrittenNodes();
    const leaves = this.getWrittenLeaves();

    this.parent.writeLeaves(Object.entries(leaves));
    const writes = Object.keys(nodes).flatMap((levelString) => {
      const level = Number(levelString);
      return Object.entries(nodes[level]).map<MerkleTreeNode>(
        ([key, value]) => {
          return {
            key: BigInt(key),
            level,
            value,
          };
        }
      );
    });

    this.parent.writeNodes(writes);

    await this.parent.commit();
    this.resetWrittenTree();
  }
}
