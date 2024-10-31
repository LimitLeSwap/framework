import { inject } from "tsyringe";
import {
  ArtifactRecord,
  MandatoryProtocolModulesRecord,
  Protocol,
  RuntimeVerificationKeyRootService,
  SettlementSmartContractBase,
} from "@proto-kit/protocol";
import { log } from "@proto-kit/common";

import { FlowCreator } from "../worker/flow/Flow";
import { WorkerRegistrationFlow } from "../worker/worker/startup/WorkerRegistrationFlow";
import { CircuitCompilerTask } from "../protocol/production/tasks/CircuitCompilerTask";
import { VerificationKeyService } from "../protocol/runtime/RuntimeVerificationKeyService";

import { SequencerModule, sequencerModule } from "./builder/SequencerModule";

@sequencerModule()
export class SequencerStartupModule extends SequencerModule {
  public constructor(
    private readonly flowCreator: FlowCreator,
    @inject("Protocol")
    private readonly protocol: Protocol<MandatoryProtocolModulesRecord>,
    private readonly compileTask: CircuitCompilerTask,
    private readonly verificationKeyService: VerificationKeyService,
    private readonly registrationFlow: WorkerRegistrationFlow
  ) {
    super();
  }

  public async start() {
    const flow = this.flowCreator.createFlow("compile-circuits", {});

    log.info("Compiling Protocol circuits, this can take a few minutes");

    const artifacts = await flow.withFlow<ArtifactRecord>(async (res, rej) => {
      await flow.pushTask(
        this.compileTask,
        { existingArtifacts: {}, targets: ["runtime"] },
        async (result) => {
          res(result);
        }
      );
    });

    log.info("Protocol circuits compiled");

    // Init runtime VK tree
    await this.verificationKeyService.initializeVKTree(artifacts);

    const root = this.verificationKeyService.getRoot();

    this.protocol.dependencyContainer
      .resolve(RuntimeVerificationKeyRootService)
      .setRoot(root);

    // Init BridgeContract vk for settlement contract
    const bridgeVk = artifacts.BridgeContract;
    if (bridgeVk !== undefined) {
      SettlementSmartContractBase.args.BridgeContractVerificationKey =
        bridgeVk.verificationKey;
    }

    await this.registrationFlow.start({
      runtimeVerificationKeyRoot: root,
      bridgeContractVerificationKey: bridgeVk.verificationKey,
    });

    log.info("Protocol circuits compiled successfully, commencing startup");
  }
}
