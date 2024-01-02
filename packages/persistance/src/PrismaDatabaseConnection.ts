import { PrismaClient } from "@prisma/client";
import {
  sequencerModule,
  SequencerModule,
  StorageDependencyMinimumDependencies
} from "@proto-kit/sequencer";
import { DependencyFactory, noop } from "@proto-kit/common";

import { PrismaStateService } from "./services/prisma/PrismaStateService";
import { PrismaBatchStore } from "./services/prisma/PrismaBatchStore";
import { PrismaBlockStorage } from "./services/prisma/PrismaBlockStorage";

@sequencerModule()
export class PrismaDatabaseConnection
  extends SequencerModule
  implements DependencyFactory
{
  public readonly client = new PrismaClient();

  public dependencies(): Omit<
    StorageDependencyMinimumDependencies,
    "asyncMerkleStore" | "unprovenMerkleStore"
  > {
    return {
      asyncStateService: {
        useFactory: () => new PrismaStateService(this),
      },
      blockStorage: {
        useClass: PrismaBatchStore,
      },
      unprovenBlockQueue: {
        useClass: PrismaBlockStorage,
      },
      unprovenBlockStorage: {
        useClass: PrismaBlockStorage,
      },
      unprovenStateService: {
        useFactory: () => new PrismaStateService(this, "block"),
      },
    };
  }

  public async start(): Promise<void> {
    noop();
  }
}
