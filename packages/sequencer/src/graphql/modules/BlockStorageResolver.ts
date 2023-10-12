/* eslint-disable new-cap */
import { inject, injectable } from "tsyringe";
import {
  Arg,
  Field,
  ObjectType,
  Query,
  Resolver,
} from "type-graphql";
import { GraphqlModule } from "../GraphqlModule";
import { IsBoolean } from "class-validator";
import { TransactionObject } from "./MempoolResolver";
import {
  BlockStorage,
  HistoricalBlockStorage,
} from "../../storage/repositories/BlockStorage";
import {
  ComputedBlock,
  ComputedBlockTransaction,
} from "../../storage/model/Block";

@ObjectType()
export class ComputedBlockTransactionModel {
  @Field(() => TransactionObject)
  public tx: TransactionObject;

  @Field()
  @IsBoolean()
  public status: boolean;

  @Field(() => String, { nullable: true })
  public statusMessage: string | undefined;

  public constructor(
    tx: TransactionObject,
    status: boolean,
    statusMessage: string | undefined
  ) {
    this.tx = tx;
    this.status = status;
    this.statusMessage = statusMessage;
  }

  public static fromServiceLayerModel(cbt: ComputedBlockTransaction) {
    const { tx, status, statusMessage } = cbt;
    return new ComputedBlockTransactionModel(
      TransactionObject.fromServiceLayerModel(tx),
      status,
      statusMessage
    );
  }
}

@ObjectType()
export class ComputedBlockModel {
  public static fromServiceLayerModel({ txs, proof }: ComputedBlock) {
    return new ComputedBlockModel(
      txs.map((tx) => ComputedBlockTransactionModel.fromServiceLayerModel(tx)),
      JSON.stringify(proof.toJSON())
    );
  }

  @Field(() => [ComputedBlockTransactionModel])
  public txs: ComputedBlockTransactionModel[];

  @Field()
  public proof: string;

  public constructor(txs: ComputedBlockTransactionModel[], proof: string) {
    this.txs = txs;
    this.proof = proof;
  }
}

@injectable()
@Resolver(ComputedBlockModel)
export class BlockStorageResolver extends GraphqlModule<object> {
  public resolverType = BlockStorageResolver;

  // TODO seperate these two block interfaces
  public constructor(
    @inject("BlockStorage")
    private readonly blockStorage: BlockStorage & HistoricalBlockStorage
  ) {
    super();
  }

  @Query(() => ComputedBlockModel, { nullable: true })
  public async block(
    @Arg("height", () => Number, { nullable: true })
    height: number | "latest" | undefined
  ) {
    const blockHeight =
      height === undefined || height === "latest"
        ? await this.blockStorage.getCurrentBlockHeight()
        : height;

    const block = await this.blockStorage.getBlockAt(blockHeight);

    if (block !== undefined) {
      return ComputedBlockModel.fromServiceLayerModel(block);
    }
    return undefined;
  }
}
