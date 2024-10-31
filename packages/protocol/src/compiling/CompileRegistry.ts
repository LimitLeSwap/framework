import { inject, injectable, singleton } from "tsyringe";
import {
  AreProofsEnabled,
  mapSequential,
  MOCK_VERIFICATION_KEY,
} from "@proto-kit/common";

import {
  Artifact,
  AtomicCompileHelper,
  GenericCompileTarget,
} from "./AtomicCompileHelper";
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

  private artifacts: Record<string, Artifact | "compiled-but-no-artifact"> = {};

  public async compileModule<ReturnArtifact extends Artifact>(
    // TODO Make name inferred by the module token
    name: string,
    compile: (
      registry: CompileRegistry,
      ...args: unknown[]
    ) => GenericCompileTarget<ReturnArtifact>,
    dependencies: Record<string, CompilableModule> = {}
  ): Promise<ReturnArtifact | undefined> {
    const collectedArtifacts = await mapSequential(
      Object.entries(dependencies),
      async ([depName, dep]) => {
        if (this.artifacts[depName] !== undefined) {
          return this.artifacts[depName];
        }
        const artifact =
          (await dep.compile(this)) ?? "compiled-but-no-artifact";
        this.artifacts[depName] = artifact;
        return artifact;
      }
    );

    const target = compile(this, ...collectedArtifacts);
    const artifact = await this.compile.program<ReturnArtifact>(name, target);

    this.artifacts[name] = artifact ?? "compiled-but-no-artifact";

    return artifact;
  }

  public getArtifact<ArtifactType extends Artifact>(name: string) {
    if (this.artifacts[name] === undefined) {
      throw new Error(
        `Artifact for ${name} not available, did you compile it via the CompileRegistry?`
      );
    }
    if (!this.areProofsEnabled.areProofsEnabled) {
      return MOCK_VERIFICATION_KEY;
    }

    const artifact = this.artifacts[name];
    if (artifact === "compiled-but-no-artifact") {
      throw new Error(
        `Module ${name} didn't return the requested artifact even though proofs are enabled`
      );
    }
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return artifact as ArtifactType;
  }

  public addArtifactsRaw(artifacts: Record<string, Artifact>) {
    Object.entries(artifacts).forEach(([key, value]) => {
      this.artifacts[key] = value;
    });
  }
}
