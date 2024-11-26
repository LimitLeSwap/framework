import { singleton } from "tsyringe";

@singleton()
export default class GlobalExecutionContext {
  private stateCalls: Set<string> = new Set();

  public addStateCall(callId: string) {
    this.stateCalls.add(callId);
  }

  public removeStateCall(callId: string) {
    this.stateCalls.delete(callId);
  }

  public hasStateCall(callId: string): boolean {
    return this.stateCalls.has(callId);
  }
}
