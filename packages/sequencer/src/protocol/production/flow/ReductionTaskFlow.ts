import { log } from "@proto-kit/common";

import { Flow, FlowCreator } from "../../../worker/flow/Flow";
import { Task } from "../../../worker/flow/Task";
import { PairTuple } from "../../../helpers/utils";

interface ReductionState<Output> {
  numMergesCompleted: 0;
  queue: Output[];
}

/**
 * This class builds and executes a flow that follows the map-reduce pattern.
 * This works in 2 steps:
 * 1. Mapping: Execute the mappingTask to transform from Input -> Output
 * 2. Reduction: Find suitable pairs and merge them [Output, Output] -> Output
 *
 * We use this pattern extensively in our pipeline,
 */
export class ReductionTaskFlow<Input, Output> {
  private readonly flow: Flow<ReductionState<Output>>;

  private started = false;

  public constructor(
    private readonly options: {
      name: string;
      inputLength: number;
      mappingTask: Task<Input, Output>;
      reductionTask: Task<PairTuple<Output>, Output>;
      mergableFunction: (a: Output, b: Output) => boolean;
    },
    private readonly flowCreator: FlowCreator
  ) {
    this.flow = flowCreator.createFlow<ReductionState<Output>>(options.name, {
      numMergesCompleted: 0,
      queue: [],
    });
  }

  private resolveReducibleTasks<Type>(
    pendingInputs: Type[],
    reducible: (a: Type, b: Type) => boolean
  ): {
    availableReductions: { r1: Type; r2: Type }[];
    touchedIndizes: number[];
  } {
    const res: { r1: Type; r2: Type }[] = [];

    const touchedIndizes: number[] = [];

    for (const [index, first] of pendingInputs.entries()) {
      const secondIndex = pendingInputs.findIndex(
        (second, index2) =>
          index2 > index &&
          (reducible(first, second) || reducible(second, first))
      );

      if (secondIndex > 0) {
        const r2 = pendingInputs[secondIndex];
        pendingInputs = pendingInputs.filter(
          (unused, index2) => index2 !== index && index2 !== secondIndex
        );

        const [firstElement, secondElement] = reducible(first, r2)
          ? [first, r2]
          : [r2, first];

        res.push({ r1: firstElement, r2: secondElement });
        touchedIndizes.push(index, secondIndex);
      }
    }

    return { availableReductions: res, touchedIndizes };
  }

  private async resolveReduction() {
    const { flow, options } = this;

    if (
      options.inputLength - flow.state.numMergesCompleted === 1 &&
      flow.tasksInProgress === 0
    ) {
      log.debug(`${options.name}: Resolved successfully`);
      flow.resolve(flow.state.queue[0]);
      return;
    }
    log.trace(`${options.name}: Queue length: ${flow.state.queue.length}`);

    if (flow.state.queue.length >= 2) {
      const { availableReductions, touchedIndizes } =
        this.resolveReducibleTasks(flow.state.queue, options.mergableFunction);

      // I don't know exactly what this rule wants from me, I suspect
      // it complains bcs the function is called forEach
      // eslint-disable-next-line unicorn/no-array-method-this-argument
      await flow.forEach(availableReductions, async (reduction) => {
        const taskParameters: PairTuple<Output> = [reduction.r1, reduction.r2];
        await flow.pushTask(
          options.reductionTask,
          taskParameters,
          async (result) => {
            flow.state.queue.push(result);
            flow.state.numMergesCompleted += 1;
            await this.resolveReduction();
          }
        );
      });

      flow.state.queue = flow.state.queue.filter(
        (ignored, index) => !touchedIndizes.includes(index)
      );
    }
  }

  private async initCompletionCallback(
    callback: (output: Output) => Promise<void>
  ) {
    if (this.started) {
      throw new Error("Flow already started, use pushInput() to add inputs");
    }
    this.started = true;
    const result = await this.flow.withFlow<Output>(async () => {});
    await callback(result);
  }

  /**
   * Execute the flow using a callback method that is invoked upon
   * completion of the flow.
   * Push inputs using pushInput()
   * @param callback
   */
  public onCompletion(callback: (output: Output) => Promise<void>) {
    void this.initCompletionCallback(callback);
  }

  /**
   * Execute the flow using the returned Promise that resolved when
   * the flow is finished
   * @param inputs initial inputs - doesnt have to be the complete set of inputs
   */
  public async execute(inputs: Input[] = []): Promise<Output> {
    if (this.started) {
      throw new Error("Flow already started, use pushInput() to add inputs");
    }
    this.started = true;
    return await this.flow.withFlow<Output>(async () => {
      // eslint-disable-next-line unicorn/no-array-method-this-argument
      await this.flow.forEach(inputs, async (input) => {
        await this.pushInput(input);
      });
    });
  }

  public async pushInput(input: Input) {
    await this.flow.pushTask(
      this.options.mappingTask,
      input,
      async (result) => {
        if (this.options.inputLength === 1) {
          this.flow.resolve(result);
        } else {
          this.flow.state.queue.push(result);
          await this.resolveReduction();
        }
      }
    );
  }
}
