import { describe, it, expect } from "vitest";
import { checkStandards } from "./checker";

const SAMPLE_STANDARDS_TOML = `
[metadata]
project = "test-project"
tier = "production"

[extends]
registry = "github:progression-labs-development/standards"
rulesets = ["typescript-production"]

[code.naming]
rules = [
  { extensions = ["ts"], file_case = "camelCase", folder_case = "kebab-case", exclude = ["**/tests/__mocks__/**"] },
]
`;

describe("checkStandards", () => {
  it("detects file naming violations", () => {
    const result = checkStandards(
      ["src/MyComponent.ts", "src/utils/helper.ts"],
      SAMPLE_STANDARDS_TOML,
    );

    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].rule).toBe("naming/file-case");
    expect(result.violations[0].file).toBe("src/MyComponent.ts");
  });

  it("passes for correctly named files", () => {
    const result = checkStandards(
      ["src/config.ts", "src/utils/helper.ts"],
      SAMPLE_STANDARDS_TOML,
    );

    expect(result.violations).toHaveLength(0);
  });

  it("skips excluded paths", () => {
    const result = checkStandards(
      ["src/tests/__mocks__/BadName.ts"],
      SAMPLE_STANDARDS_TOML,
    );

    expect(result.violations).toHaveLength(0);
  });

  it("detects folder naming violations", () => {
    const result = checkStandards(
      ["src/MyFolder/config.ts"],
      SAMPLE_STANDARDS_TOML,
    );

    const folderViolations = result.violations.filter(
      (v) => v.rule === "naming/folder-case",
    );
    expect(folderViolations.length).toBeGreaterThan(0);
  });

  it("reports the standards config used", () => {
    const result = checkStandards(["src/config.ts"], SAMPLE_STANDARDS_TOML);
    expect(result.standardsConfig).toBe("typescript-production");
  });
});
