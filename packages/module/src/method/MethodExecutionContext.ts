/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
/* eslint-disable max-classes-per-file */
/* eslint-disable import/no-unused-modules */
/* eslint-disable new-cap */
import { Bool } from 'snarkyjs';
import { singleton } from 'tsyringe';

import type { ProvableStateTransition } from '../stateTransition/StateTransition.js';

export class MethodExecutionResult<ResultValue> {
  public stateTransitions: ProvableStateTransition[] = [];

  public status: Bool = Bool(true);

  public statusMessage?: string;

  public value?: ResultValue;
}

@singleton()
export class MethodExecutionContext<ResultValue> {
  public methods: string[] = [];

  public constructor(
    public result: MethodExecutionResult<ResultValue> = new MethodExecutionResult()
  ) {}

  public addStateTransition(stateTransition: ProvableStateTransition) {
    this.result.stateTransitions.push(stateTransition);
  }

  public setStatusMessage(message?: string) {
    this.result.statusMessage ??= message;
  }

  public setStatus(status: Bool) {
    this.result.status = status;
  }

  public setValue(value: ResultValue) {
    this.result.value = value;
  }

  public beforeMethod(methodName: string) {
    if (this.isFinished) {
      this.result = new MethodExecutionResult();
    }
    this.methods.push(methodName);
  }

  public afterMethod() {
    this.methods.pop();
  }

  public get isFinished() {
    return this.methods.length === 0;
  }

  public current() {
    return {
      isFinished: this.isFinished,
      result: this.result,
    };
  }
}
