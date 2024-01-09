import {
  DependencyDeclaration,
  DependencyFactory,
  DependencyRecord,
} from "@proto-kit/common";

import { AsyncStateService } from "../state/async/AsyncStateService";
import { AsyncMerkleTreeStore } from "../state/async/AsyncMerkleTreeStore";
import { CachedStateService } from "../state/state/CachedStateService";
import { CachedMerkleTreeStore } from "../state/merkle/CachedMerkleTreeStore";

import { BlockStorage } from "./repositories/BlockStorage";
import {
  UnprovenBlockQueue,
  UnprovenBlockStorage,
} from "./repositories/UnprovenBlockStorage";

export interface StorageDependencyMinimumDependencies extends DependencyRecord {
  asyncStateService: DependencyDeclaration<AsyncStateService>;
  asyncMerkleStore: DependencyDeclaration<AsyncMerkleTreeStore>;
  blockStorage: DependencyDeclaration<BlockStorage>;
  unprovenBlockQueue: DependencyDeclaration<UnprovenBlockQueue>;
  unprovenBlockStorage: DependencyDeclaration<UnprovenBlockStorage>;
  unprovenStateService: DependencyDeclaration<CachedStateService>;
  unprovenMerkleStore: DependencyDeclaration<CachedMerkleTreeStore>;
}

export interface StorageDependencyFactory extends DependencyFactory {
  dependencies: () => StorageDependencyMinimumDependencies;
}
