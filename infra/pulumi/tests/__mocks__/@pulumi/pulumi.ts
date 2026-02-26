import { vi } from "vitest";

export const interpolate = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => {
  return strings.reduce((result, str, i) => {
    return result + str + (values[i] || "");
  }, "");
};

export const output = (value: unknown) => value;

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Output<_T> {
  static create<U>(value: U): Output<U> {
    return value as unknown as Output<U>;
  }
}

export class Config {
  private values: Record<string, string> = {};

  get(key: string): string | undefined {
    return this.values[key];
  }

  require(key: string): string {
    const value = this.values[key];
    if (!value) throw new Error(`Missing required config: ${key}`);
    return value;
  }

  getSecret(key: string): string | undefined {
    return this.values[key];
  }

  requireSecret(key: string): string {
    return this.require(key);
  }
}

export const getStack = vi.fn(() => "test");
export const getProject = vi.fn(() => "monitoring");
