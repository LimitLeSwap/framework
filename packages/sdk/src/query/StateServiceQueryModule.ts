import {
  AsyncStateService,
  QueryTransportModule,
  Sequencer,
  SequencerModulesRecord,
} from "@proto-kit/sequencer";
import { Field } from "o1js";
import { inject, injectable } from "tsyringe";
import {
  LinkedLeafAndMerkleWitness,
  LinkedMerkleTree,
} from "@proto-kit/common";
import { CachedLinkedMerkleTreeStore } from "@proto-kit/sequencer/dist/state/merkle/CachedLinkedMerkleTreeStore";
import { AsyncLinkedMerkleTreeStore } from "@proto-kit/sequencer/dist/state/async/AsyncLinkedMerkleTreeStore";

import { AppChainModule } from "../appChain/AppChainModule";

@injectable()
export class StateServiceQueryModule
  extends AppChainModule
  implements QueryTransportModule
{
  public constructor(
    @inject("Sequencer") public sequencer: Sequencer<SequencerModulesRecord>
  ) {
    super();
  }

  public get asyncStateService(): AsyncStateService {
    return this.sequencer.dependencyContainer.resolve<AsyncStateService>(
      "UnprovenStateService"
    );
  }

  public get treeStore(): AsyncLinkedMerkleTreeStore {
    return this.sequencer.dependencyContainer.resolve("AsyncLinkedMerkleStore");
  }

  public get(key: Field) {
    return this.asyncStateService.get(key);
  }

  public async merkleWitness(
    path: Field
  ): Promise<LinkedLeafAndMerkleWitness | undefined> {
    const syncStore = await CachedLinkedMerkleTreeStore.new(this.treeStore);
    await syncStore.preloadKey(path.toBigInt());

    const tree = new LinkedMerkleTree(syncStore);

    return tree.getWitness(path.toBigInt());
  }
}
