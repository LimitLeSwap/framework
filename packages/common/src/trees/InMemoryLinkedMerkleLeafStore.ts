import { Mixin } from "ts-mixer";

import { InMemoryLinkedLeafStore } from "./InMemoryLinkedLeafStore";
import { InMemoryMerkleTreeStorage } from "./InMemoryMerkleTreeStorage";

export class InMemoryLinkedMerkleLeafStore extends Mixin(
  InMemoryLinkedLeafStore,
  InMemoryMerkleTreeStorage
) {}
