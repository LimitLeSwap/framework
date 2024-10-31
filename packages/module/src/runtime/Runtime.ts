/* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-argument */
import { ZkProgram } from "o1js";
import { DependencyContainer, injectable } from "tsyringe";
import {
  StringKeyOf,
  ModuleContainer,
  ModulesConfig,
  ModulesRecord,
  TypedClass,
  ZkProgrammable,
  PlainZkProgram,
  AreProofsEnabled,
  ChildContainerProvider,
} from "@proto-kit/common";
import {
  MethodPublicOutput,
  StateServiceProvider,
  SimpleAsyncStateService,
} from "@proto-kit/protocol";

import {
  combineMethodName,
  isRuntimeMethod,
  runtimeMethodTypeMetadataKey,
  toWrappedMethod,
  AsyncWrappedMethod,
} from "../method/runtimeMethod";
import { MethodIdFactory } from "../factories/MethodIdFactory";

import { RuntimeModule } from "./RuntimeModule";
import { MethodIdResolver } from "./MethodIdResolver";
import { RuntimeEnvironment } from "./RuntimeEnvironment";

export function getAllPropertyNames(obj: any) {
  let currentPrototype: any | undefined = obj;
  let keys: (string | symbol)[] = [];
  // if primitive (primitives still have keys) skip the first iteration
  if (!(obj instanceof Object)) {
    currentPrototype = Object.getPrototypeOf(obj);
  }
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  while (currentPrototype) {
    keys = keys.concat(Reflect.ownKeys(currentPrototype));
    currentPrototype = Object.getPrototypeOf(currentPrototype);
  }
  return keys;
}

/**
 * Record of modules accepted by the Runtime module container.
 *
 * We have to use TypedClass since RuntimeModule
 * is an abstract class
 */
export type RuntimeModulesRecord = ModulesRecord<
  TypedClass<RuntimeModule<unknown>>
>;

const errors = {
  methodNotFound: (methodKey: string) =>
    new Error(`Unable to find method with id ${methodKey}`),
};

/**
 * Definition / required arguments for the Runtime class
 */
export interface RuntimeDefinition<Modules extends RuntimeModulesRecord> {
  modules: Modules;
  config?: ModulesConfig<Modules>;
}

export class RuntimeZkProgrammable<
  Modules extends RuntimeModulesRecord,
> extends ZkProgrammable<undefined, MethodPublicOutput> {
  public constructor(public runtime: Runtime<Modules>) {
    super();
  }

  public get areProofsEnabled() {
    return this.runtime.areProofsEnabled;
  }

  public zkProgramFactory(): PlainZkProgram<undefined, MethodPublicOutput>[] {
    type Methods = Record<
      string,
      {
        privateInputs: any;
        method: AsyncWrappedMethod;
      }
    >;
    // We need to use explicit type annotations here,
    // therefore we can't use destructuring

    // eslint-disable-next-line prefer-destructuring
    const runtime: Runtime<Modules> = this.runtime;

    const MAXIMUM_METHODS_PER_ZK_PROGRAM = 8;

    const runtimeMethods = runtime.runtimeModuleNames.reduce<Methods>(
      (allMethods, runtimeModuleName) => {
        runtime.isValidModuleName(
          runtime.definition.modules,
          runtimeModuleName
        );

        /**
         * Couldnt find a better way to circumvent the type assertion
         * regarding resolving only known modules. We assert in the line above
         * but we cast it to any anyways to satisfy the proof system.
         */

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const runtimeModule = runtime.resolve(runtimeModuleName as any);

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const modulePrototype = Object.getPrototypeOf(runtimeModule) as Record<
          string,
          // Technically not all methods have to be async, but for this context it's ok
          (...args: unknown[]) => Promise<unknown>
        >;

        const modulePrototypeMethods = getAllPropertyNames(runtimeModule).map(
          (method) => method.toString()
        );

        const moduleMethods = modulePrototypeMethods.reduce<Methods>(
          (allModuleMethods, methodName) => {
            if (isRuntimeMethod(runtimeModule, methodName)) {
              const combinedMethodName = combineMethodName(
                runtimeModuleName,
                methodName
              );
              const method = modulePrototype[methodName];
              const invocationType = Reflect.getMetadata(
                runtimeMethodTypeMetadataKey,
                runtimeModule,
                methodName
              );

              const wrappedMethod: AsyncWrappedMethod = Reflect.apply(
                toWrappedMethod,
                runtimeModule,
                [methodName, method, { invocationType }]
              );

              const privateInputs = Reflect.getMetadata(
                "design:paramtypes",
                runtimeModule,
                methodName
              );

              return {
                ...allModuleMethods,

                [combinedMethodName]: {
                  privateInputs,
                  method: wrappedMethod,
                },
              };
            }

            return allModuleMethods;
          },
          {}
        );

        return {
          ...allMethods,
          ...moduleMethods,
        };
      },
      {}
    );

    const sortedRuntimeMethods = Object.fromEntries(
      Object.entries(runtimeMethods).sort()
    );

    const splitRuntimeMethods = () => {
      const buckets: Array<
        Record<
          string,
          {
            privateInputs: any;
            method: AsyncWrappedMethod;
          }
        >
      > = [];
      Object.entries(sortedRuntimeMethods).forEach(
        async ([methodName, method]) => {
          let methodAdded = false;
          for (const bucket of buckets) {
            if (buckets.length === 0) {
              const record: Record<
                string,
                {
                  privateInputs: any;
                  method: AsyncWrappedMethod;
                }
              > = {};
              record[methodName] = method;
              buckets.push(record);
              methodAdded = true;
              break;
            } else if (
              Object.keys(bucket).length <=
              MAXIMUM_METHODS_PER_ZK_PROGRAM - 1
            ) {
              bucket[methodName] = method;
              methodAdded = true;
              break;
            }
          }
          if (!methodAdded) {
            const record: Record<
              string,
              {
                privateInputs: any;
                method: AsyncWrappedMethod;
              }
            > = {};
            record[methodName] = method;
            buckets.push(record);
          }
        }
      );
      return buckets;
    };

    return splitRuntimeMethods().map((bucket, index) => {
      const name = `RuntimeProgram-${index}`;
      const program = ZkProgram({
        name,
        publicOutput: MethodPublicOutput,
        methods: bucket,
      });

      const SelfProof = ZkProgram.Proof(program);

      const methods = Object.keys(bucket).reduce<Record<string, any>>(
        (boundMethods, methodName) => {
          boundMethods[methodName] = program[methodName].bind(program);
          return boundMethods;
        },
        {}
      );

      return {
        name,
        compile: program.compile.bind(program),
        verify: program.verify.bind(program),
        analyzeMethods: program.analyzeMethods.bind(program),
        Proof: SelfProof,
        methods,
      };
    });
  }
}

/**
 * Wrapper for an application specific runtime, which helps orchestrate
 * runtime modules into an interoperable runtime.
 */
@injectable()
export class Runtime<Modules extends RuntimeModulesRecord>
  extends ModuleContainer<Modules>
  implements RuntimeEnvironment
{
  public static from<Modules extends RuntimeModulesRecord>(
    definition: RuntimeDefinition<Modules>
  ): TypedClass<Runtime<Modules>> {
    return class RuntimeScoped extends Runtime<Modules> {
      public constructor() {
        super(definition);
      }
    };
  }

  // runtime modules composed into a ZkProgram
  public program?: ReturnType<typeof ZkProgram>;

  public definition: RuntimeDefinition<Modules>;

  public zkProgrammable: ZkProgrammable<undefined, MethodPublicOutput>;

  /**
   * Creates a new Runtime from the provided config
   *
   * @param modules - Configuration object for the constructed Runtime
   */
  public constructor(definition: RuntimeDefinition<Modules>) {
    super(definition);
    this.definition = definition;
    this.zkProgrammable = new RuntimeZkProgrammable<Modules>(this);
  }

  // TODO Remove after changing DFs to type-based approach
  public create(childContainerProvider: ChildContainerProvider) {
    super.create(childContainerProvider);

    this.useDependencyFactory(this.container.resolve(MethodIdFactory));
  }

  public get areProofsEnabled(): AreProofsEnabled | undefined {
    return this.container.resolve<AreProofsEnabled>("AreProofsEnabled");
  }

  public get stateServiceProvider(): StateServiceProvider {
    return this.dependencyContainer.resolve<StateServiceProvider>(
      "StateServiceProvider"
    );
  }

  public get stateService(): SimpleAsyncStateService {
    return this.stateServiceProvider.stateService;
  }

  public get methodIdResolver(): MethodIdResolver {
    return this.container.resolve<MethodIdResolver>("MethodIdResolver");
  }

  /**
   * @returns The dependency injection container of this runtime
   */
  public get dependencyContainer(): DependencyContainer {
    return this.container;
  }

  /**
   * @param methodId The encoded name of the method to call.
   * Encoding: "stringToField(module.name) << 128 + stringToField(method-name)"
   */
  public getMethodById(
    methodId: bigint
  ): ((...args: unknown[]) => Promise<unknown>) | undefined {
    const methodDescriptor =
      this.methodIdResolver.getMethodNameFromId(methodId);

    if (methodDescriptor === undefined) {
      return undefined;
    }
    const [moduleName, methodName] = methodDescriptor;

    this.assertIsValidModuleName(moduleName);
    const module = this.resolve(moduleName);

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const method = (module as any)[methodName];
    if (method === undefined) {
      throw errors.methodNotFound(`${moduleName}.${methodName}`);
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return (method as (...args: unknown[]) => Promise<unknown>).bind(module);
  }

  /**
   * Add a name and other respective properties required by RuntimeModules,
   * that come from the current Runtime
   *
   * @param moduleName - Name of the runtime module to decorate
   * @param containedModule
   */
  public decorateModule(
    moduleName: StringKeyOf<Modules>,
    containedModule: InstanceType<Modules[StringKeyOf<Modules>]>
  ) {
    containedModule.name = moduleName;
    containedModule.runtime = this;

    super.decorateModule(moduleName, containedModule);
  }

  /**
   * @returns A list of names of all the registered module names
   */
  public get runtimeModuleNames() {
    return Object.keys(this.definition.modules);
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-argument */
