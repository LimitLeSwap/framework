import type { CompileRegistry } from "./CompileRegistry";
import { Artifact } from "./AtomicCompileHelper";

export interface CompilableModule {
  compile(registry: CompileRegistry): Promise<Artifact | void>;
}
