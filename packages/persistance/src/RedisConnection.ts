import { createClient, RedisClientType } from "redis";
import {
  SequencerModule,
  StorageDependencyMinimumDependencies,
} from "@proto-kit/sequencer";
import { DependencyFactory } from "@proto-kit/common";

import { RedisLinkedMerkleTreeStore } from "./services/redis/RedisLinkedMerkleTreeStore";

export interface RedisConnectionConfig {
  host: string;
  password?: string;
  port?: number;
  username?: string;
}

export interface RedisConnection {
  get redisClient(): RedisClientType;
}

export class RedisConnectionModule
  extends SequencerModule<RedisConnectionConfig>
  implements DependencyFactory, RedisConnection
{
  private client?: RedisClientType;

  public get redisClient(): RedisClientType {
    if (this.client === undefined) {
      throw new Error(
        "Redis client not initialized yet, wait for .start() to be called"
      );
    }
    return this.client;
  }

  public dependencies(): Pick<
    StorageDependencyMinimumDependencies,
    "asyncMerkleStore" | "blockTreeStore" | "unprovenMerkleStore"
  > {
    return {
      asyncMerkleStore: {
        useFactory: () => new RedisLinkedMerkleTreeStore(this),
      },
      unprovenMerkleStore: {
        useFactory: () => new RedisLinkedMerkleTreeStore(this, "unproven"),
      },
      blockTreeStore: {
        useFactory: () => new RedisLinkedMerkleTreeStore(this, "blockHash"),
      },
    };
  }

  public async clearDatabase() {
    await this.redisClient.flushAll();
  }

  public async init() {
    const { host, port, password, username } = this.config;
    this.client = createClient({
      url: `redis://${host}:${port ?? 6379}`,
      password,
      username,
    });
    try {
      await this.redisClient.connect();
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Connection to Redis failed: ${error.message}`);
      }
      throw error;
    }
  }

  public async start(): Promise<void> {
    await this.init();
  }

  public async close() {
    await this.redisClient.disconnect();
  }

  public async pruneDatabase() {
    await this.redisClient.flushDb();
  }
}
