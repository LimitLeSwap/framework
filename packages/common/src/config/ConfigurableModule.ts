const errors = {
  configNotSet: (moduleName: string) =>
    new Error(
      `Trying to retrieve config of ${moduleName}, which was not yet set`
    ),
};

// defines how presets can be provided, either a function or a record
export type Preset<Config> = Config | ((...args: any[]) => Config);
export type Presets<Config> = Record<string, Preset<Config>>;

// describes the interface of a configurable module
export interface Configurable<Config> {
  config: Config;
}

/**
 * Used by various module sub-types that may need to be configured
 */
export class ConfigurableModule<Config> implements Configurable<Config> {
  protected currentConfig: Config | undefined;

  // eslint-disable-next-line max-len
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor, @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
  public constructor(...args: any[]) {}

  public get config(): Config {
    if (this.currentConfig === undefined) {
      throw errors.configNotSet(this.constructor.name);
    }
    return this.currentConfig;
  }

  public set config(config: Config) {
    this.currentConfig = config;
  }
}

// Helps ensure that the target class implements static presets
export interface StaticConfigurableModule<Config> {
  presets: Presets<Config>;
}
