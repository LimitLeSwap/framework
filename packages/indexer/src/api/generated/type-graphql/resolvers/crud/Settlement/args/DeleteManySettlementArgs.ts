import * as TypeGraphQL from "type-graphql";
import * as GraphQLScalars from "graphql-scalars";
import { SettlementWhereInput } from "../../../inputs/SettlementWhereInput";

@TypeGraphQL.ArgsType()
export class DeleteManySettlementArgs {
  @TypeGraphQL.Field(_type => SettlementWhereInput, {
    nullable: true
  })
  where?: SettlementWhereInput | undefined;
}
