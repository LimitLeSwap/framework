import {
  type Bool,
  Circuit,
  Field,
  Poseidon,
  FlexibleProvablePure,
} from "snarkyjs";

/**
 * Utilities for creating a hash list from a given value type.
 */
export abstract class ProvableHashList<Value> {
  public constructor(
    private readonly valueType: FlexibleProvablePure<Value>,
    public commitment: Field = Field(0)
  ) {}

  protected abstract hash(elements: Field[]): Field;

  /**
   * Converts the provided value to Field[] and appends it to
   * the current hashlist.
   *
   * @param value - Value to be appended to the hash list
   * @returns Current hash list.
   */
  public push(value: Value) {
    this.commitment = this.hash([
      this.commitment,
      ...this.valueType.toFields(value),
    ]);
    return this;
  }

  /**
   * @returns Traling hash of the current hashlist.
   */
  public toField() {
    return this.commitment;
  }
}

export class DefaultProvableHashList<Value> extends ProvableHashList<Value> {
  public hash(elements: Field[]): Field {
    return Poseidon.hash(elements);
  }
}
