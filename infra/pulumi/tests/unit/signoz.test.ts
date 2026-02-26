import { describe, it, expect, beforeEach } from "vitest";
import type { vi } from "vitest";
import { createInstance } from "@chrismlittle123/infra";
import { createSignoz } from "../../src/components/signoz";

type MockFn = ReturnType<typeof vi.fn>;
const mockCreateInstance = createInstance as MockFn;

beforeEach(() => {
  mockCreateInstance.mockClear();
  mockCreateInstance.mockReturnValue({
    publicIp: "1.2.3.4",
    instanceId: "i-1234567890abcdef0",
  });
});

describe("createSignoz — instance creation", () => {
  it("should create an instance with default medium size", () => {
    createSignoz("test-signoz", { adminPassword: "test-password" });

    expect(mockCreateInstance).toHaveBeenCalledWith(
      "test-signoz",
      expect.objectContaining({
        size: "medium",
        os: "ubuntu-22.04",
        diskSize: 50,
      }),
    );
  });

  it("should pass sshKey to instance when provided", () => {
    createSignoz("test-signoz", {
      sshKey: "ssh-ed25519 AAAA...",
      adminPassword: "test-password",
    });

    expect(mockCreateInstance).toHaveBeenCalledWith(
      "test-signoz",
      expect.objectContaining({ sshKey: "ssh-ed25519 AAAA..." }),
    );
  });

  it("should allow undefined sshKey", () => {
    createSignoz("test-signoz", { adminPassword: "test-password" });

    expect(mockCreateInstance).toHaveBeenCalledWith(
      "test-signoz",
      expect.objectContaining({ sshKey: undefined }),
    );
  });

  it("should allow specifying instance size", () => {
    createSignoz("test-signoz", { size: "large", adminPassword: "test-password" });

    expect(mockCreateInstance).toHaveBeenCalledWith(
      "test-signoz",
      expect.objectContaining({ size: "large" }),
    );
  });
});

describe("createSignoz — ports and access", () => {
  it("should configure required ports for SigNoz", () => {
    createSignoz("test-signoz", { adminPassword: "test-password" });

    expect(mockCreateInstance).toHaveBeenCalledWith(
      "test-signoz",
      expect.objectContaining({
        additionalPorts: expect.arrayContaining([
          expect.objectContaining({ port: 8080 }),
          expect.objectContaining({ port: 4317 }),
          expect.objectContaining({ port: 4318 }),
        ]),
      }),
    );
  });

  it("should configure HTTP and HTTPS access", () => {
    createSignoz("test-signoz", { adminPassword: "test-password" });

    expect(mockCreateInstance).toHaveBeenCalledWith(
      "test-signoz",
      expect.objectContaining({ allowHttp: true, allowHttps: true }),
    );
  });
});

describe("createSignoz — outputs and userData", () => {
  it("should return expected output structure", () => {
    const result = createSignoz("test-signoz", { adminPassword: "test-password" });

    expect(result).toHaveProperty("url");
    expect(result).toHaveProperty("otlpHttpEndpoint");
    expect(result).toHaveProperty("otlpGrpcEndpoint");
    expect(result).toHaveProperty("publicIp");
    expect(result).toHaveProperty("instanceId");
  });

  it("should include userData script with Docker and SigNoz installation", () => {
    createSignoz("test-signoz", { adminPassword: "test-password" });

    const callArgs = mockCreateInstance.mock.calls[0][1];
    expect(callArgs.userData).toContain("docker");
    expect(callArgs.userData).toContain("signoz");
    expect(callArgs.userData).toContain("set -e");
    expect(callArgs.userData).toContain("docker-compose");
  });
});
