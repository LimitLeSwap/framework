import { inject, injectable, singleton } from "tsyringe";
import {
  AreProofsEnabled,
  CompileArtifact,
  mapSequential,
} from "@proto-kit/common";

import { ArtifactRecord, AtomicCompileHelper } from "./AtomicCompileHelper";
import { CompilableModule } from "./CompilableModule";

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
    this.compile = new AtomicCompileHelper(this.areProofsEnabled);
  }

  public compile: AtomicCompileHelper;

  private artifacts: ArtifactRecord = {};

  public async compileModule(
    compile: (
      compiler: AtomicCompileHelper,
      ...args: unknown[]
    ) => Promise<ArtifactRecord>,
    dependencies: Record<string, CompilableModule> = {}
  ): Promise<ArtifactRecord | undefined> {
    const collectedArtifacts = await mapSequential(
      Object.entries(dependencies),
      async ([depName, dep]) => {
        if (this.artifacts[depName] !== undefined) {
          return this.artifacts[depName];
        }
        const artifact = await dep.compile(this);
        if (artifact !== undefined) {
          this.artifacts = {
            ...this.artifacts,
            ...artifact,
          };
        }
        return artifact;
      }
    );

    const artifacts = await compile(this.compile, ...collectedArtifacts);

    this.artifacts = {
      ...this.artifacts,
      ...artifacts,
    };

    return artifacts;
  }

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
