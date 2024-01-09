/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
import {
  ModuleContainer,
  ModulesConfig,
  ModulesRecord,
  ProofTypes,
  ToFieldableStatic,
  ToJSONableStatic,
  TypedClass,
} from "@proto-kit/common";
import {
  Runtime,
  RuntimeModule,
  RuntimeModulesRecord,
  MethodIdResolver,
  MethodIdFactory,
} from "@proto-kit/module";
import {
  NetworkStateQuery,
  Query,
  QueryBuilderFactory,
  Sequencer,
  SequencerModulesRecord,
  UnsignedTransaction,
  QueryTransportModule,
  NetworkStateTransportModule,
  DummyStateService,
} from "@proto-kit/sequencer";
import {
  NetworkState,
  Protocol,
  ProtocolModulesRecord,
  RuntimeTransaction,
  RuntimeMethodExecutionContext,
  ProtocolModule,
  StateServiceProvider,
} from "@proto-kit/protocol";
import { Field, ProvableExtended, PublicKey, UInt64, Proof } from "o1js";
import { container, DependencyContainer } from "tsyringe";

import { AppChainTransaction } from "../transaction/AppChainTransaction";
import { Signer } from "../transaction/InMemorySigner";
import { TransactionSender } from "../transaction/InMemoryTransactionSender";

import { AppChainModule } from "./AppChainModule";
import { AreProofsEnabledFactory } from "./AreProofsEnabledFactory";
import { SharedDependencyFactory } from "./SharedDependencyFactory";

export type AppChainModulesRecord = ModulesRecord<
  TypedClass<AppChainModule<unknown>>
>;

export interface AppChainDefinition<
  RuntimeModules extends RuntimeModulesRecord,
  ProtocolModules extends ProtocolModulesRecord,
  SequencerModules extends SequencerModulesRecord,
  AppChainModules extends AppChainModulesRecord
> {
  runtime: TypedClass<Runtime<RuntimeModules>>;
  protocol: TypedClass<Protocol<ProtocolModules>>;
  sequencer: TypedClass<Sequencer<SequencerModules>>;
  modules: AppChainModules;
  config?: ModulesConfig<AppChainModules>;
}

// eslint-disable-next-line etc/prefer-interface
export type ExpandAppChainModules<
  RuntimeModules extends RuntimeModulesRecord,
  ProtocolModules extends ProtocolModulesRecord,
  SequencerModules extends SequencerModulesRecord,
  AppChainModules extends AppChainModulesRecord
> = AppChainModules & {
  Runtime: TypedClass<Runtime<RuntimeModules>>;
  Protocol: TypedClass<Protocol<ProtocolModules>>;
  Sequencer: TypedClass<Sequencer<SequencerModules>>;
};

export interface ExpandAppChainDefinition<
  RuntimeModules extends RuntimeModulesRecord,
  ProtocolModules extends ProtocolModulesRecord,
  SequencerModules extends SequencerModulesRecord,
  AppChainModules extends AppChainModulesRecord
> {
  modules: ExpandAppChainModules<
    RuntimeModules,
    ProtocolModules,
    SequencerModules,
    AppChainModules
  >;
  config?: ModulesConfig<
    ExpandAppChainModules<
      RuntimeModules,
      ProtocolModules,
      SequencerModules,
      AppChainModules
    >
  >;
}

/**
 * Definition of required arguments for AppChain
 */
export interface AppChainConfig<
  RuntimeModules extends RuntimeModulesRecord,
  ProtocolModules extends ProtocolModulesRecord,
  SequencerModules extends SequencerModulesRecord,
  AppChainModules extends AppChainModulesRecord
> {
  runtime: ModulesConfig<RuntimeModules>;
  protocol: ModulesConfig<ProtocolModules>;
  sequencer: ModulesConfig<SequencerModules>;
  appChain: ModulesConfig<AppChainModules>;
}

/**
 * AppChain acts as a wrapper connecting Runtime, Protocol and Sequencer
 */
export class AppChain<
  RuntimeModules extends RuntimeModulesRecord,
  ProtocolModules extends ProtocolModulesRecord,
  SequencerModules extends SequencerModulesRecord,
  AppChainModules extends AppChainModulesRecord
> extends ModuleContainer<
  ExpandAppChainModules<
    RuntimeModules,
    ProtocolModules,
    SequencerModules,
    AppChainModules
  >
> {
  // alternative AppChain constructor
  public static from<
    RuntimeModules extends RuntimeModulesRecord,
    ProtocolModules extends ProtocolModulesRecord,
    SequencerModules extends SequencerModulesRecord,
    AppChainModules extends AppChainModulesRecord
  >(
    definition: AppChainDefinition<
      RuntimeModules,
      ProtocolModules,
      SequencerModules,
      AppChainModules
    >
  ) {
    return new AppChain(definition);
  }

  public definition: ExpandAppChainDefinition<
    RuntimeModules,
    ProtocolModules,
    SequencerModules,
    AppChainModules
  >;

  public constructor(
    definition: AppChainDefinition<
      RuntimeModules,
      ProtocolModules,
      SequencerModules,
      AppChainModules
    >
  ) {
    const expandedDefinition: ExpandAppChainDefinition<
      RuntimeModules,
      ProtocolModules,
      SequencerModules,
      AppChainModules
    > = {
      modules: {
        Runtime: definition.runtime,
        Sequencer: definition.sequencer,
        Protocol: definition.protocol,
        ...definition.modules,
      },

      config: {
        Runtime: {},
        Sequencer: {},
        Protocol: {},
        ...definition.config,
      } as ModulesConfig<
        ExpandAppChainModules<
          RuntimeModules,
          ProtocolModules,
          SequencerModules,
          AppChainModules
        >
      >,
    };
    super(expandedDefinition);
    this.definition = expandedDefinition;
  }

  public get query(): {
    runtime: Query<RuntimeModule<unknown>, RuntimeModules>;
    protocol: Query<ProtocolModule<unknown>, ProtocolModules>;
    network: NetworkStateQuery;
  } {
    const queryTransportModule = this.container.resolve<QueryTransportModule>(
      "QueryTransportModule"
    );

    const networkStateTransportModule =
      this.container.resolve<NetworkStateTransportModule>(
        "NetworkStateTransportModule"
      );

    const network = new NetworkStateQuery(networkStateTransportModule);

    return {
      runtime: QueryBuilderFactory.fromRuntime(
        this.resolveOrFail("Runtime", Runtime<RuntimeModules>),
        queryTransportModule
      ),

      protocol: QueryBuilderFactory.fromProtocol(
        this.resolveOrFail("Protocol", Protocol<ProtocolModules>),
        queryTransportModule
      ),

      network,
    };
  }

  public get runtime(): Runtime<RuntimeModules> {
    return this.resolve("Runtime");
  }

  public get sequencer(): Sequencer<SequencerModules> {
    return this.resolve("Sequencer");
  }

  public get protocol(): Protocol<ProtocolModules> {
    return this.resolve("Protocol");
  }

  public configureAll(
    config: AppChainConfig<
      RuntimeModules,
      ProtocolModules,
      SequencerModules,
      AppChainModules
    >
  ): void {
    this.runtime.configure(config.runtime);
    this.sequencer.configure(config.sequencer);
    this.protocol.configure(config.protocol);
    this.configure({
      Runtime: {},
      Sequencer: {},
      Protocol: {},
      ...config.appChain,
    } as Parameters<typeof this.configure>[0]);
  }

  public transaction(
    sender: PublicKey,
    callback: () => void,
    options?: { nonce?: number }
  ): AppChainTransaction {
    const executionContext = container.resolve<RuntimeMethodExecutionContext>(
      RuntimeMethodExecutionContext
    );

    executionContext.setup({
      transaction: {
        sender,
        nonce: UInt64.from(options?.nonce ?? 0),
        argsHash: Field(0),
      } as unknown as RuntimeTransaction,

      networkState: {
        block: {
          height: UInt64.from(0),
        },
      } as unknown as NetworkState,
    });

    const stateServiceProvider = this.container.resolve<StateServiceProvider>(
      "StateServiceProvider"
    );
    stateServiceProvider.setCurrentStateService(new DummyStateService());

    callback();

    stateServiceProvider.popCurrentStateService();

    const { methodName, moduleName, args } = executionContext.current().result;

    // TODO: extract error
    if (!methodName || !moduleName || !args) {
      throw new Error(
        "Unable to determine moduleName, methodName or args for the transaction"
      );
    }

    // forgive me, i'll fix this type issue soon
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtimeModule = this.runtime.resolve(moduleName as any);

    // find types of args for the runtime method thats being called
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parameterTypes:
      | ProofTypes[]
      | ToFieldableStatic[]
      | ToJSONableStatic[] = Reflect.getMetadata(
      "design:paramtypes",
      runtimeModule,
      methodName
    );

    /**
     * Use the type info obtained previously to convert
     * the args passed to fields
     */
    const argsFields = args.flatMap((argument, index) => {
      if (argument instanceof Proof) {
        const argumentType = parameterTypes[index] as ProofTypes;

        const publicOutputType = argumentType?.publicOutputType;

        const publicInputType = argumentType?.publicInputType;

        const inputFields =
          publicInputType?.toFields(argument.publicInput) ?? [];

        const outputFields =
          publicOutputType?.toFields(argument.publicOutput) ?? [];

        return [...inputFields, ...outputFields];
      }

      const argumentType = parameterTypes[index] as ToFieldableStatic;
      return argumentType.toFields(argument);
    });

    const argsJSON = args.map((argument, index) => {
      if (argument instanceof Proof) {
        return JSON.stringify(argument.toJSON());
      }

      const argumentType = parameterTypes[index] as ToJSONableStatic;
      return JSON.stringify(argumentType.toJSON(argument));
    });

    const unsignedTransaction = new UnsignedTransaction({
      methodId: Field(
        this.runtime.dependencyContainer
          .resolve<MethodIdResolver>("MethodIdResolver")
          .getMethodId(moduleName, methodName)
      ),

      argsFields,
      argsJSON,
      nonce: UInt64.from(options?.nonce ?? 0),
      sender,
    });

    const signer = this.container.resolve<Signer>("Signer");
    const transactionSender =
      this.container.resolve<TransactionSender>("TransactionSender");

    const transaction = new AppChainTransaction(signer, transactionSender);

    transaction.withUnsignedTransaction(unsignedTransaction);

    return transaction;
  }

  /**
   * Starts the appchain and cross-registers runtime to sequencer
   */
  public async start(dependencyContainer: DependencyContainer = container) {
    this.create(() => dependencyContainer);

    this.useDependencyFactory(this.container.resolve(AreProofsEnabledFactory));
    this.useDependencyFactory(this.container.resolve(SharedDependencyFactory));

    // These three statements are crucial for dependencies inside any of these
    // components to access their siblings inside their constructor.
    // This is because when it is the first time they are resolved, create()
    // will not be called until after the constructor finished because of
    // how tsyringe handles hooks
    this.resolve("Runtime");
    this.resolve("Protocol");
    this.resolve("Sequencer");

    // // Workaround to get protocol and sequencer to have
    // // access to the same WitnessProviderReference
    // const reference = new StateTransitionWitnessProviderReference();
    // this.registerValue({
    //   StateTransitionWitnessProviderReference: reference,
    // });

    // console.log("creating sequencer");
    // this.sequencer.create(() => this.container);

    console.log("starting sequencer");
    // this.runtime.start();
    await this.sequencer.start();
  }
}
