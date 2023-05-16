import { Field } from "snarkyjs";

export interface StateService {
  get: (key: Field) => Field[] | undefined;
  set: (key: Field, value: Field[]) => void;
}

/**
 * Naive implementation of a StateService for testing purposes
 */
export class InMemoryStateService implements StateService {
  public values: Record<string, Field[]> = {};

  public get(key: Field): Field[] | undefined {
    return this.values[key.toString()];
  }

  public set(key: Field, value: Field[]) {
    this.values[key.toString()] = value;
  }
}
