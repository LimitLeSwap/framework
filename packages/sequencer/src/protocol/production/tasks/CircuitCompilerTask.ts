import { inject, injectable, Lifecycle, scoped } from "tsyringe";
import { Runtime } from "@proto-kit/module";
import { log, mapSequential } from "@proto-kit/common";
import {
  MandatorySettlementModulesRecord,
  Protocol,
  SettlementContractModule,
  ArtifactRecord,
  CompileRegistry,
  CompilableModule,
  BridgeContractProtocolModule,
} from "@proto-kit/protocol";

import { TaskSerializer } from "../../../worker/flow/Task";
import { UnpreparingTask } from "../../../worker/flow/UnpreparingTask";
import { VerificationKeySerializer } from "../helpers/VerificationKeySerializer";

export type CompilerTaskParams = {
  existingArtifacts: ArtifactRecord;
  targets: string[];
};

type SerializedArtifactRecord = Record<
  string,
  { verificationKey: { hash: string; data: string } }
>;

export class SimpleJSONSerializer<Type> implements TaskSerializer<Type> {
  public toJSON(parameters: Type): string {
    return JSON.stringify(parameters);
  }

  public fromJSON(json: string): Type {
    return JSON.parse(json) as Type;
  }
}

export class ArtifactRecordSerializer {
  public toJSON(input: ArtifactRecord): SerializedArtifactRecord {
    const temp: SerializedArtifactRecord = Object.keys(
      input
    ).reduce<SerializedArtifactRecord>((accum, key) => {
      return {
        ...accum,
        [key]: {
          verificationKey: VerificationKeySerializer.toJSON(
            input[key].verificationKey
          ),
        },
      };
    }, {});
    return temp;
  }

  public fromJSON(json: SerializedArtifactRecord): ArtifactRecord {
    return Object.keys(json).reduce<ArtifactRecord>((accum, key) => {
      return {
        ...accum,
        [key]: {
          verificationKey: VerificationKeySerializer.fromJSON(
            json[key].verificationKey
          ),
        },
      };
    }, {} as ArtifactRecord);
  }
}

@injectable()
@scoped(Lifecycle.ContainerScoped)
export class CircuitCompilerTask extends UnpreparingTask<
  CompilerTaskParams,
  ArtifactRecord
> {
  public name = "compiledCircuit";

  public constructor(
    @inject("Runtime") protected readonly runtime: Runtime<never>,
    @inject("Protocol") protected readonly protocol: Protocol<any>,
    private readonly compileRegistry: CompileRegistry
  ) {
    super();
  }

  public inputSerializer(): TaskSerializer<CompilerTaskParams> {
    return new SimpleJSONSerializer<CompilerTaskParams>();
  }

  public resultSerializer(): TaskSerializer<ArtifactRecord> {
    const serializer = new ArtifactRecordSerializer();
    return {
      toJSON: (input) => JSON.stringify(serializer.toJSON(input)),
      fromJSON: (input) => serializer.fromJSON(JSON.parse(input)),
    };
  }

  public getSettlementTargets(): Record<string, CompilableModule> {
    // We only care about the BridgeContract for now - later with caching,
    // we might want to expand that to all protocol circuits
    const container = this.protocol.dependencyContainer;
    if (container.isRegistered("SettlementContractModule")) {
      const settlementModule = container.resolve<
        SettlementContractModule<MandatorySettlementModulesRecord>
      >("SettlementContractModule");

      const bridge = settlementModule.resolveOrFail(
        "BridgeContract",
        BridgeContractProtocolModule
      );
      return {
        bridge,
      };
    }
    return {};
  }

  public async compute(input: CompilerTaskParams): Promise<ArtifactRecord> {
    this.compileRegistry.addArtifactsRaw(input.existingArtifacts);

    log.info("Computing VKs");

    // TODO make adaptive
    const targets: Record<string, CompilableModule> = {
      runtime: this.runtime,
      protocol: this.protocol.blockProver,
      ...this.getSettlementTargets(),
    };

    const msg = `Compiling targets ${targets}`;
    log.time(msg);
    await mapSequential(input.targets, async (target) => {
      if (target in targets) {
        await targets[target].compile(this.compileRegistry);
      } else {
        throw new Error(`Compile target ${target} not found`);
      }
    });
    log.timeEnd.info(msg);

    return this.compileRegistry.getAllArtifacts();
  }
}
