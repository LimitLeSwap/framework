import { inject, injectable, singleton } from "tsyringe";

import { AreProofsEnabled } from "../zkProgrammable/ZkProgrammable";

import {
  ArtifactRecord,
  AtomicCompileHelper,
  CompileTarget,
} from "./AtomicCompileHelper";
import { CompilableModule } from "./CompilableModule";

interface GenericCompilableModule<Artifact> {
  compile(registry: CompileRegistry): Promise<Artifact>;
}

export type InferDependencyArtifacts<
  Dependencies extends Record<string, CompilableModule>,
> = {
  [Key in keyof Dependencies]: Dependencies[Key] extends GenericCompilableModule<
    infer Artifact
  >
    ? Artifact
    : void;
};
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
  ) {
    this.compiler = new AtomicCompileHelper(this.areProofsEnabled);
  }

  private compiler: AtomicCompileHelper;

  private artifacts: ArtifactRecord = {};

  // private cachedModuleOutputs: Record<string, ArtifactRecord | void> = {};

  // TODO Add possibility to force recompilation for non-sideloaded dependencies

  public async compile(target: CompileTarget) {
    if (this.artifacts[target.name] === undefined) {
      const artifact = await this.compiler.compileContract(target);
      this.artifacts[target.name] = artifact;
      return artifact;
    }
    return this.artifacts[target.name];
  }

  // public async compileModule<
  //   ReturnType extends ArtifactRecord,
  //   Dependencies extends Record<string, CompilableModule>,
  // >(
  //   compile: (
  //     compiler: AtomicCompileHelper,
  //     args: InferDependencyArtifacts<Dependencies>
  //   ) => Promise<ReturnType>,
  //   dependencies?: Dependencies
  // ): Promise<ReturnType | undefined> {
  //   const collectedArtifacts = await mapSequential(
  //     Object.entries(dependencies ?? {}),
  //     async ([depName, dep]) => {
  //       if (this.cachedModuleOutputs[depName] !== undefined) {
  //         return [depName, this.cachedModuleOutputs[depName]];
  //       }
  //       const artifact = await dep.compile(this);
  //       if (artifact !== undefined) {
  //         this.artifacts = {
  //           ...this.artifacts,
  //           ...artifact,
  //         };
  //       }
  //       this.cachedModuleOutputs[depName] = artifact;
  //       return [depName, artifact];
  //     }
  //   );
  //
  //   const artifacts = await compile(
  //     this.compile,
  //     Object.fromEntries(collectedArtifacts)
  //   );
  //
  //   this.artifacts = {
  //     ...this.artifacts,
  //     ...artifacts,
  //   };
  //
  //   return artifacts;
  // }

  public getArtifact(name: string) {
    if (this.artifacts[name] === undefined) {
      throw new Error(
        `Artifact for ${name} not available, did you compile it via the CompileRegistry?`
      );
    }

    return this.artifacts[name];
  }

  public addArtifactsRaw(artifacts: ArtifactRecord) {
    this.artifacts = {
      ...this.artifacts,
      ...artifacts,
    };
  }

  public getAllArtifacts() {
    return this.artifacts;
  }
}
