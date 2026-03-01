import { describe, it, expect } from "vitest";
import { parseDiff, scanDiff } from "./scanner";

const sampleDiff = `diff --git a/config.ts b/config.ts
index 1234567..abcdef0 100644
--- a/config.ts
+++ b/config.ts
@@ -1,3 +1,5 @@
 const x = 1;
+const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
+const safe = "hello";
 const y = 2;
`;

const forbiddenFileDiff = `diff --git a/.env b/.env
index 0000000..1234567 100644
--- /dev/null
+++ b/.env
@@ -0,0 +1,2 @@
+DB_HOST=localhost
+DB_PASS=password123
`;

const multiFileDiff = `diff --git a/src/app.ts b/src/app.ts
index 1234567..abcdef0 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,3 +10,4 @@
 const server = createServer();
+const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl";
 server.listen(3000);
diff --git a/server.pem b/server.pem
index 0000000..abcdef0 100644
--- /dev/null
+++ b/server.pem
@@ -0,0 +1,3 @@
+-----BEGIN RSA PRIVATE KEY-----
+MIIEpAIBAAKCAQEA...
+-----END RSA PRIVATE KEY-----
`;

describe("parseDiff", () => {
  it("parses file path from diff header", () => {
    const files = parseDiff(sampleDiff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("config.ts");
  });

  it("extracts only added lines", () => {
    const files = parseDiff(sampleDiff);
    expect(files[0].addedLines).toHaveLength(2);
    expect(files[0].addedLines[0].content).toBe(
      'const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";',
    );
  });

  it("tracks correct line numbers", () => {
    const files = parseDiff(sampleDiff);
    expect(files[0].addedLines[0].lineNumber).toBe(2);
    expect(files[0].addedLines[1].lineNumber).toBe(3);
  });

  it("parses multiple files", () => {
    const files = parseDiff(multiFileDiff);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("src/app.ts");
    expect(files[1].path).toBe("server.pem");
  });
});

describe("scanDiff", () => {
  it("detects pattern-matched secrets in diff", () => {
    const results = scanDiff(sampleDiff);
    expect(results.some((r) => r.patternName === "aws_access_key")).toBe(true);
  });

  it("detects forbidden files", () => {
    const results = scanDiff(forbiddenFileDiff);
    expect(results.some((r) => r.patternName === "forbidden_file")).toBe(true);
  });

  it("detects multiple finding types across files", () => {
    const results = scanDiff(multiFileDiff);
    const patternNames = results.map((r) => r.patternName);
    expect(patternNames).toContain("forbidden_file");
    expect(patternNames).toContain("github_pat");
    expect(patternNames).toContain("private_key_pem");
  });

  it("returns empty for clean diff", () => {
    const cleanDiff = `diff --git a/readme.md b/readme.md
index 1234567..abcdef0 100644
--- a/readme.md
+++ b/readme.md
@@ -1,2 +1,3 @@
 # My Project
+Added documentation.
`;
    const results = scanDiff(cleanDiff);
    expect(results).toHaveLength(0);
  });
});
