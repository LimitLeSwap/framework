import {
  AreProofsEnabled,
  CompileArtifact,
  log,
  MOCK_VERIFICATION_KEY,
} from "@proto-kit/common";
import { SmartContract, VerificationKey } from "o1js";

export type ArtifactRecord = Record<string, CompileArtifact>;

export type CompileTarget = {
  name: string;
  compile: () => Promise<CompileArtifact>;
};

export class AtomicCompileHelper {
  public constructor(private readonly areProofsEnabled: AreProofsEnabled) {}

  private compilationPromises: {
    [key: string]: Promise<CompileArtifact>;
  } = {};

  public async compileContract(
    contract: CompileTarget,
    overrideProofsEnabled?: boolean
  ): Promise<CompileArtifact> {
    let newPromise = false;
    const { name } = contract;
    if (this.compilationPromises[name] === undefined) {
      const proofsEnabled =
        overrideProofsEnabled ?? this.areProofsEnabled.areProofsEnabled;
      // This wierd any is necessary otherwise the compiler optimized that check away
      if (proofsEnabled || !((contract as any) instanceof SmartContract)) {
        log.time(`Compiling ${name}`);
        this.compilationPromises[name] = contract.compile();
        newPromise = true;
      } else {
        this.compilationPromises[name] = Promise.resolve({
          verificationKey: MOCK_VERIFICATION_KEY,
        });
      }
    }
    const result = await this.compilationPromises[name];
    if (newPromise) {
      log.timeEnd.info(`Compiling ${name}`);
    }
    return result;
  }
}
