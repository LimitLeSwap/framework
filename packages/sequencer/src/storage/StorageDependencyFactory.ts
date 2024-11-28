import {
  DependencyDeclaration,
  DependencyFactory,
  DependencyRecord,
} from "@proto-kit/common";

import { AsyncStateService } from "../state/async/AsyncStateService";
import { AsyncLinkedMerkleTreeStore } from "../state/async/AsyncLinkedMerkleTreeStore";
import { AsyncMerkleTreeStore } from "../state/async/AsyncMerkleTreeStore";

import { BatchStorage } from "./repositories/BatchStorage";
import { BlockQueue, BlockStorage } from "./repositories/BlockStorage";
import { MessageStorage } from "./repositories/MessageStorage";
import { SettlementStorage } from "./repositories/SettlementStorage";
import { TransactionStorage } from "./repositories/TransactionStorage";

export interface StorageDependencyMinimumDependencies extends DependencyRecord {
  asyncStateService: DependencyDeclaration<AsyncStateService>;
  asyncMerkleStore: DependencyDeclaration<AsyncLinkedMerkleTreeStore>;
  batchStorage: DependencyDeclaration<BatchStorage>;
  blockQueue: DependencyDeclaration<BlockQueue>;
  blockStorage: DependencyDeclaration<BlockStorage>;
  unprovenStateService: DependencyDeclaration<AsyncStateService>;
  unprovenMerkleStore: DependencyDeclaration<AsyncLinkedMerkleTreeStore>;
  blockTreeStore: DependencyDeclaration<AsyncMerkleTreeStore>;
  messageStorage: DependencyDeclaration<MessageStorage>;
  settlementStorage: DependencyDeclaration<SettlementStorage>;
  transactionStorage: DependencyDeclaration<TransactionStorage>;
}

export interface StorageDependencyFactory extends DependencyFactory {
  dependencies: () => StorageDependencyMinimumDependencies;
}
