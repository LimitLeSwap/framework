import {
  log,
  noop,
  ArtifactRecord,
  ChildVerificationKeyService,
  CompileRegistry,
} from "@proto-kit/common";
import { inject, injectable } from "tsyringe";
import {
  Protocol,
  RuntimeVerificationKeyRootService,
  SettlementSmartContractBase,
} from "@proto-kit/protocol";
import { VerificationKey } from "o1js";

import { Task } from "../../flow/Task";
import { AbstractStartupTask } from "../../flow/AbstractStartupTask";
import { VerificationKeySerializer } from "../../../protocol/production/helpers/VerificationKeySerializer";
import { ArtifactRecordSerializer } from "../../../protocol/production/tasks/CircuitCompilerTask";

import { CloseWorkerError } from "./CloseWorkerError";

export type WorkerStartupPayload = {
  runtimeVerificationKeyRoot: bigint;
  // This has to be nullable, since
  bridgeContractVerificationKey?: VerificationKey;
  compiledArtifacts: ArtifactRecord;
};

@injectable()
export class WorkerRegistrationTask
  extends AbstractStartupTask<WorkerStartupPayload, boolean>
  implements Task<WorkerStartupPayload, boolean>
{
  // Theoretically not needed anymore, but still nice as a safeguard against double execution
  private done = false;

  public constructor(
    @inject("Protocol") private readonly protocol: Protocol<any>,
    private readonly compileRegistry: CompileRegistry
  ) {
    super();
  }

  public name = "worker-registration";

  public async prepare() {
    noop();
  }

  public async compute(input: WorkerStartupPayload) {
    if (this.done) {
      log.info("Done, trying to close worker");
      throw new CloseWorkerError("Already started");
    }

    const rootService = this.protocol.dependencyContainer.resolve(
      RuntimeVerificationKeyRootService
    );
    rootService.setRoot(input.runtimeVerificationKeyRoot);

    if (input.bridgeContractVerificationKey !== undefined) {
      SettlementSmartContractBase.args.BridgeContractVerificationKey =
        input.bridgeContractVerificationKey;
    }

    this.compileRegistry.addArtifactsRaw(input.compiledArtifacts);
    this.protocol.dependencyContainer
      .resolve(ChildVerificationKeyService)
      .setCompileRegistry(this.compileRegistry);

    this.events.emit("startup-task-finished");

    this.done = true;
    return true;
  }

  public inputSerializer() {
    const artifactSerializer = new ArtifactRecordSerializer();
    return {
      toJSON: (payload: WorkerStartupPayload) => {
        return JSON.stringify({
          runtimeVerificationKeyRoot:
            payload.runtimeVerificationKeyRoot.toString(),
          bridgeContractVerificationKey:
            payload.bridgeContractVerificationKey !== undefined
              ? VerificationKeySerializer.toJSON(
                  payload.bridgeContractVerificationKey
                )
              : undefined,
          compiledArtifacts: artifactSerializer.toJSON(
            payload.compiledArtifacts
          ),
        });
      },
      fromJSON: (payload: string) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const jsonObject = JSON.parse(payload);

        return {
          runtimeVerificationKeyRoot: BigInt(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            jsonObject.runtimeVerificationKeyRoot
          ),
          bridgeContractVerificationKey:
            jsonObject.bridgeContractVerificationKey !== undefined
              ? VerificationKeySerializer.fromJSON(
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                  jsonObject.bridgeContractVerificationKey
                )
              : undefined,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          compiledArtifacts: artifactSerializer.fromJSON(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            jsonObject.compiledArtifacts
          ),
        };
      },
    };
  }

  public resultSerializer() {
    return {
      toJSON: (payload: boolean) => String(payload),
      fromJSON: (payload: string) => Boolean(payload),
    };
  }
}
