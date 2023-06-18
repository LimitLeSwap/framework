/* eslint-disable jest/no-restricted-matchers */
import "reflect-metadata";

import { Sequencer } from "../../../src/sequencer/executor/Sequencer";

import { DummyModule } from "./DummyModule";

describe("sequencer", () => {
  it("should inject module and start correctly", async () => {
    expect.assertions(4);

    const password = "password123";
    const returnValue = "custom return";

    const sequencer = Sequencer.from({
      modules: {
        dummy: DummyModule,
      },
    });

    sequencer.configure({
      dummy: {
        password,
        returnValue,
      },
    });

    await sequencer.start();

    const resolvedDummyModule = sequencer.resolve("dummy");
    const { config } = resolvedDummyModule;

    expect(resolvedDummyModule).toBeDefined();

    expect(config).toBeDefined();
    expect(config.password).toStrictEqual(password);
    expect(config.returnValue).toStrictEqual(returnValue);
  });
});
