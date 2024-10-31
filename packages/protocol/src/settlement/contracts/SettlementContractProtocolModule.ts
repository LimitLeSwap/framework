import { inject, injectable, injectAll } from "tsyringe";
import { VerificationKey } from "o1js";

import { BlockProvable } from "../../prover/block/BlockProvable";
import {
  ContractModule,
  SmartContractClassFromInterface,
} from "../ContractModule";
import { ProvableSettlementHook } from "../modularity/ProvableSettlementHook";
import { CompileRegistry } from "../../compiling/CompileRegistry";
import { ArtifactRecord } from "../../compiling/AtomicCompileHelper";

import { DispatchSmartContractBase } from "./DispatchSmartContract";
import {
  LazyBlockProof,
  SettlementContractType,
  SettlementSmartContract,
  SettlementSmartContractBase,
} from "./SettlementSmartContract";
import { BridgeContractBase } from "./BridgeContract";
import { DispatchContractProtocolModule } from "./DispatchContractProtocolModule";
import { BridgeContractProtocolModule } from "./BridgeContractProtocolModule";

export type SettlementContractConfig = {
  escapeHatchSlotsInterval?: number;
};

// 24 hours
const DEFAULT_ESCAPE_HATCH = (60 / 3) * 24;

@injectable()
export class SettlementContractProtocolModule extends ContractModule<
  SettlementContractType,
  SettlementContractConfig
> {
  public constructor(
    @injectAll("ProvableSettlementHook")
    private readonly hooks: ProvableSettlementHook<unknown>[],
    @inject("BlockProver")
    private readonly blockProver: BlockProvable,
    @inject("DispatchContract")
    private readonly dispatchContractModule: DispatchContractProtocolModule,
    @inject("BridgeContract")
    private readonly bridgeContractModule: BridgeContractProtocolModule
  ) {
    LazyBlockProof.tag = blockProver.zkProgrammable.zkProgram[0].Proof.tag;
    super();
  }

  public contractFactory(): SmartContractClassFromInterface<SettlementContractType> {
    const { hooks, config } = this;
    const dispatchContract = this.dispatchContractModule.contractFactory();
    const bridgeContract = this.bridgeContractModule.contractFactory();

    const escapeHatchSlotsInterval =
      config.escapeHatchSlotsInterval ?? DEFAULT_ESCAPE_HATCH;

    const { args } = SettlementSmartContractBase;
    SettlementSmartContractBase.args = {
      DispatchContract: dispatchContract,
      hooks,
      escapeHatchSlotsInterval,
      BridgeContract: bridgeContract,
      BridgeContractVerificationKey: args?.BridgeContractVerificationKey,
      BridgeContractPermissions: args?.BridgeContractPermissions,
      signedSettlements: args?.signedSettlements,
    };

    // Ideally we don't want to have this cyclic dependency, but we have it in the protocol,
    // So its logical that we can't avoid that here
    BridgeContractBase.args.SettlementContract = SettlementSmartContract;

    DispatchSmartContractBase.args.settlementContractClass =
      SettlementSmartContract;

    return SettlementSmartContract;
  }

  public async compile(
    registry: CompileRegistry
  ): Promise<ArtifactRecord | undefined> {
    return await registry.compileModule(
      async (compiler, bridgeVk: unknown, blockProverVk: unknown) => {
        SettlementSmartContractBase.args.BridgeContractVerificationKey =
          // TODO Infer type
          bridgeVk as VerificationKey;

        return {
          SettlementSmartContract: await compiler.compileContract(
            SettlementSmartContract
          ),
        };
      },
      {
        BridgeContract: this.bridgeContractModule,
        BlockProver: this.blockProver,
      }
    );
  }
}
