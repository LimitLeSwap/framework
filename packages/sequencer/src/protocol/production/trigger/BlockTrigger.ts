import { NoConfig, noop } from "@proto-kit/common";

import { ComputedBlock } from "../../../storage/model/Block";
import { UnprovenBlock } from "../unproven/TransactionExecutionService";
import { BlockProducerModule } from "../BlockProducerModule";
import { UnprovenProducerModule } from "../unproven/UnprovenProducerModule";
import { UnprovenBlockQueue } from "../../../storage/repositories/UnprovenBlockStorage";
import { SequencerModule } from "../../../sequencer/builder/SequencerModule";
import { SettlementModule } from "../../../settlement/SettlementModule";

/**
 * A BlockTrigger is the primary method to start the production of a block and
 * all associated processes.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface BlockTrigger {}

export class BlockTriggerBase<Config = NoConfig>
  extends SequencerModule<Config>
  implements BlockTrigger
{
  public constructor(
    protected readonly blockProducerModule: BlockProducerModule,
    protected readonly unprovenProducerModule: UnprovenProducerModule,
    protected readonly unprovenBlockQueue: UnprovenBlockQueue,
    protected readonly settlementModule: SettlementModule
  ) {
    super();
  }

  protected async produceProven(): Promise<ComputedBlock | undefined> {
    const blocks = await this.unprovenBlockQueue.popNewBlocks(true);
    if (blocks.length > 0) {
      return await this.blockProducerModule.createBlock(blocks);
    }
    return undefined;
  }

  protected async produceUnproven(
    enqueueInSettlementQueue: boolean
  ): Promise<UnprovenBlock | undefined> {
    const unprovenBlock =
      await this.unprovenProducerModule.tryProduceUnprovenBlock();

    if (unprovenBlock && enqueueInSettlementQueue) {
      await this.unprovenBlockQueue.pushBlock(unprovenBlock);
    }

    return unprovenBlock;
  }

  protected async settle(batch: ComputedBlock) {
    // TODO After Persistance PR because we need batch.blocks for that
  }

  public async start(): Promise<void> {
    noop();
  }
}
