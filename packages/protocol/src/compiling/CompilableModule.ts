import type { CompileRegistry } from "./CompileRegistry";
import { ArtifactRecord } from "./AtomicCompileHelper";

export interface CompilableModule {
  compile(registry: CompileRegistry): Promise<ArtifactRecord | void>;
}
