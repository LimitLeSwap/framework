import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { TransactionExecutionResultWhereInput } from "../../../inputs/TransactionExecutionResultWhereInput";

@TypeGraphQL.ArgsType()
export class DeleteManyTransactionExecutionResultArgs {
  @TypeGraphQL.Field(_type => TransactionExecutionResultWhereInput, {
    nullable: true
  })
  where?: TransactionExecutionResultWhereInput | undefined;
}
