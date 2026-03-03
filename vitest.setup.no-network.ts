/**
 * Vitest setup file that blocks all network access in unit tests.
 *
 * Patches Node.js networking primitives so any unmocked network call
 * throws immediately with an actionable error message.
 *
 * Usage: Add to your vitest.config.ts:
 *   export default defineConfig({
 *     test: {
 *       setupFiles: ["./vitest.setup.no-network.ts"],
 *     },
 *   });
 *
 * To allow network in specific integration tests, use a separate
 * vitest.integration.config.ts without this setup file.
 */

import * as net from "node:net";

const ERROR_MSG = (host: string | undefined) =>
  `Network call to "${host ?? "unknown"}" blocked in unit test. ` +
  `Either mock this call or move the test to an integration test file.`;

// Block raw TCP connections — this catches ALL network I/O including
// http.request, https.request, fetch, and any library built on net.Socket.
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args: unknown[]) {
  const host = extractHost(args);
  throw new Error(ERROR_MSG(host));
} as typeof originalConnect;

// Block fetch API (uses a different code path in newer Node.js via undici)
const originalFetch = globalThis.fetch;
if (originalFetch) {
  globalThis.fetch = function (input: RequestInfo | URL, _init?: RequestInit) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    throw new Error(ERROR_MSG(url));
  } as typeof globalThis.fetch;
}

/** Extract host from Socket.connect arguments */
function extractHost(args: unknown[]): string | undefined {
  const first = args[0];
  if (typeof first === "object" && first !== null && "host" in first) {
    return (first as { host?: string }).host;
  }
  if (typeof first === "number" && typeof args[1] === "string") {
    return args[1]; // connect(port, host)
  }
  return undefined;
}
