import {
  AreProofsEnabled,
  log,
  MOCK_VERIFICATION_KEY,
} from "@proto-kit/common";

export type Artifact = string | object | undefined;

export type GenericCompileTarget<T extends Artifact> = {
  compile: () => Promise<T>;
};

export class AtomicCompileHelper {
  public constructor(private readonly areProofsEnabled: AreProofsEnabled) {}

  private compilationPromises: {
    [key: string]: Promise<Artifact | undefined>;
  } = {};

  // Generic params for zkProgrammable should be unknown, but verify makes those types invariant
  // public async zkProgrammable(zkProgrammable: ZkProgrammable<any, any>) {
  //   await reduceSequential(
  //     zkProgrammable.zkProgram,
  //     async (acc, program) => {
  //       const res = await this.program(program);
  //       return {
  //         ...acc,
  //         [program.name]: res,
  //       };
  //     },
  //     {}
  //   );
  // }

  public async program<ReturnArtifact extends Artifact>(
    name: string,
    contract: GenericCompileTarget<ReturnArtifact>,
    overrideProofsEnabled?: boolean
  ): Promise<ReturnArtifact> {
    let newPromise = false;
    if (this.compilationPromises[name] === undefined) {
      const proofsEnabled =
        overrideProofsEnabled ?? this.areProofsEnabled.areProofsEnabled;
      if (proofsEnabled) {
        log.time(`Compiling ${name}`);
        this.compilationPromises[name] = contract.compile();
        newPromise = true;
      } else {
        // TODO Mock VK here is not at all generalized and safe
        //  Better way would be to package the Smart contracts into a mock-compile as well
        this.compilationPromises[name] = Promise.resolve(MOCK_VERIFICATION_KEY);
      }
    }
    const result = await this.compilationPromises[name];
    if (newPromise) {
      log.timeEnd.info(`Compiling ${name}`);
    }
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return result as ReturnArtifact;
  }
}
