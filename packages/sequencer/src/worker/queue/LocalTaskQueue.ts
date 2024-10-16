import { log, mapSequential, noop } from "@proto-kit/common";

import { SequencerModule } from "../../sequencer/builder/SequencerModule";
import { TaskPayload } from "../flow/Task";

import { Closeable, InstantiatedQueue, TaskQueue } from "./TaskQueue";

async function sleep(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Had to extract it to here bc eslint would ruin the code
interface QueueListener {
  (payload: TaskPayload): Promise<void>;
}

export interface LocalTaskQueueConfig {
  simulatedDuration?: number;
}

export class LocalTaskQueue
  extends SequencerModule<LocalTaskQueueConfig>
  implements TaskQueue
{
  private queues: {
    [key: string]: { payload: TaskPayload; taskId: string }[];
  } = {};

  private workers: {
    [key: string]: {
      busy: boolean;
      handler: (data: TaskPayload) => Promise<TaskPayload | "closed">;
      close: () => Promise<void>;
    };
  } = {};

  private readonly listeners: {
    [key: string]: QueueListener[];
  } = {};

  private taskInProgress = false;

  private async workNextTasks() {
    if (this.taskInProgress) {
      return;
    }
    this.taskInProgress = true;

    // Collect all tasks
    const tasksToExecute = Object.entries(this.queues).flatMap((queue) => {
      const [queueName, tasks] = queue;

      if (tasks.length > 0) {
        const functions = tasks.map((task) => async () => {
          // Execute task in worker

          const payload = await this.workers[queueName].handler(task.payload);

          if (payload === "closed") {
            return;
          }
          log.trace("LocalTaskQueue got", JSON.stringify(payload));
          // Notify listeners about result
          const listenerPromises = this.listeners[queueName].map(
            async (listener) => {
              await listener(payload);
            }
          );
          await Promise.all(listenerPromises);
        });

        this.queues[queue[0]] = [];
        return functions;
      }
      return [];
    });

    // Execute all tasks
    await mapSequential(tasksToExecute, async (task) => await task());

    this.taskInProgress = false;

    // In case new tasks came up in the meantime, execute them as well
    if (tasksToExecute.length > 0) {
      await this.workNextTasks();
    }
  }

  public createWorker(
    queueName: string,
    executor: (data: TaskPayload) => Promise<TaskPayload>
  ): Closeable {
    const close = async () => {
      this.workers[queueName] = {
        busy: false,

        handler: async () => {
          return "closed";
        },
        close: async () => {},
      };
    };

    const worker = {
      busy: false,

      handler: async (data: TaskPayload) => {
        await sleep(this.config.simulatedDuration ?? 0);

        return await executor(data);
      },

      close,
    };

    this.workers[queueName] = worker;
    void this.workNextTasks();

    return worker;
  }

  public async getQueue(queueName: string): Promise<InstantiatedQueue> {
    this.queues[queueName] = [];

    let id = 0;

    return {
      name: queueName,

      addTask: async (
        payload: TaskPayload,
        taskId?: string
      ): Promise<{ taskId: string }> => {
        id += 1;
        const nextId = taskId ?? String(id).toString();
        this.queues[queueName].push({ payload, taskId: nextId });

        this.workNextTasks();

        return { taskId: nextId };
      },

      onCompleted: async (
        listener: (payload: TaskPayload) => Promise<void>
      ): Promise<void> => {
        (this.listeners[queueName] ??= []).push(listener);
      },

      close: async () => {
        noop();
      },
    };
  }

  public async start(): Promise<void> {
    noop();
  }
}
