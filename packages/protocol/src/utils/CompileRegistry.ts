import { inject, injectable, singleton } from "tsyringe";
import {
  AreProofsEnabled,
  CompileArtifact,
  log,
  mapSequential,
  ZkProgrammable,
} from "@proto-kit/common";

/**
 * The CompileRegistry compiles "compilable modules"
 * (i.e. zkprograms, contracts or contractmodules)
 * while making sure they don't get compiled twice in the same process in parallel.
 */
@injectable()
@singleton()
export class CompileRegistry {
  public constructor(
    @inject("AreProofsEnabled")
    private readonly areProofsEnabled: AreProofsEnabled
  ) {}

  private compilationPromises: {
    [key: string]: Promise<CompileArtifact | undefined>;
  } = {};

  // Use only the compile interface here, to avoid type issues
  public async compile(zkProgram: {
    compile: () => Promise<CompileArtifact>;
    name: string;
  }) {
    let newPromise = false;
    const { name } = zkProgram;
    if (this.compilationPromises[name] === undefined) {
      log.time(`Compiling ${name}`);
      this.compilationPromises[name] = zkProgram.compile();
      newPromise = true;
    }
    const result = await this.compilationPromises[name];
    if (newPromise) {
      log.timeEnd.info(`Compiling ${name}`);
    }
    return result;
  }

  // Generic params for zkProgrammable should be unknown, but verify makes those types invariant
  public async compileZkProgrammable(zkProgrammable: ZkProgrammable<any, any>) {
    await mapSequential(zkProgrammable.zkProgram, (program) =>
      this.compile(program)
    );
  }

  public async compileSmartContract(
    contract: {
      compile: () => Promise<CompileArtifact>;
      name: string;
    },
    overrideProofsEnabled?: boolean
  ) {
    let newPromise = false;
    const { name } = contract;
    if (this.compilationPromises[name] === undefined) {
      const proofsEnabled =
        overrideProofsEnabled ?? this.areProofsEnabled.areProofsEnabled;
      if (proofsEnabled) {
        log.time(`Compiling ${name}`);
        this.compilationPromises[name] = contract.compile();
        newPromise = true;
      } else {
        this.compilationPromises[name] = Promise.resolve(undefined);
      }
    }
    const result = await this.compilationPromises[name];
    if (newPromise) {
      log.timeEnd.info(`Compiling ${name}`);
    }
    return result;
  }
}
