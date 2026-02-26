import { describe, it, expect, beforeEach } from "vitest";
import type { vi } from "vitest";
import { createDatabase, createContainer } from "@progression-labs-development/infra";
import { createIncidentLedger } from "../../src/components/incident-ledger";

type MockFn = ReturnType<typeof vi.fn>;
const mockCreateDatabase = createDatabase as MockFn;
const mockCreateContainer = createContainer as MockFn;

const TEST_IMAGE = "europe-west2-docker.pkg.dev/monitoring/incident-ledger/app:latest";

const mockDbOutputs = {
  endpoint: "db.example.com:5432",
  host: "db.example.com",
  port: 5432,
  database: "incident_ledger_db",
  username: "postgres",
  passwordSecretArn: "projects/monitoring/secrets/incident-ledger-db-password",
  secretKey: "generated-secret-key",
  secretKeyArn: "projects/monitoring/secrets/incident-ledger-db-secret-key",
  envVars: {
    INCIDENT_LEDGER_DB_HOST: "db.example.com",
    INCIDENT_LEDGER_DB_PORT: "5432",
    INCIDENT_LEDGER_DB_DATABASE: "incident_ledger_db",
    INCIDENT_LEDGER_DB_USERNAME: "postgres",
    INCIDENT_LEDGER_DB_PASSWORD_SECRET_NAME:
      "projects/monitoring/secrets/incident-ledger-db-password",
  },
};

const mockContainerOutputs = {
  url: "https://incident-ledger-abc123.run.app",
  clusterArn: "incident-ledger-service",
  serviceArn: "incident-ledger-service",
  envVars: {},
};

beforeEach(() => {
  mockCreateDatabase.mockClear();
  mockCreateContainer.mockClear();
  mockCreateDatabase.mockReturnValue(mockDbOutputs);
  mockCreateContainer.mockReturnValue(mockContainerOutputs);
});

describe("createIncidentLedger — database", () => {
  it("should create a database with small size and PostgreSQL 16", () => {
    createIncidentLedger("incident-ledger", { image: TEST_IMAGE });

    expect(mockCreateDatabase).toHaveBeenCalledWith("incident-ledger-db", {
      size: "small",
      version: "16",
    });
  });
});

describe("createIncidentLedger — container", () => {
  it("should create a container linked to the database", () => {
    createIncidentLedger("incident-ledger", { image: TEST_IMAGE });

    expect(mockCreateContainer).toHaveBeenCalledWith("incident-ledger", {
      image: TEST_IMAGE,
      port: 3000,
      link: [mockDbOutputs],
      public: false,
      minInstances: 1,
      healthCheckPath: "/health",
    });
  });

  it("should set container as private with minInstances 1", () => {
    createIncidentLedger("incident-ledger", { image: TEST_IMAGE });

    expect(mockCreateContainer).toHaveBeenCalledWith(
      "incident-ledger",
      expect.objectContaining({ public: false, minInstances: 1 }),
    );
  });

  it("should configure health check on /health", () => {
    createIncidentLedger("incident-ledger", { image: TEST_IMAGE });

    expect(mockCreateContainer).toHaveBeenCalledWith(
      "incident-ledger",
      expect.objectContaining({ healthCheckPath: "/health" }),
    );
  });
});

describe("createIncidentLedger — registry and outputs", () => {
  it("should create an Artifact Registry repository", () => {
    const result = createIncidentLedger("incident-ledger", { image: TEST_IMAGE });

    expect(result.registry).toBeDefined();
    expect(result.registry.repositoryId).toBe("incident-ledger");
  });

  it("should return db, registry, and container outputs", () => {
    const result = createIncidentLedger("incident-ledger", { image: TEST_IMAGE });

    expect(result.db).toBe(mockDbOutputs);
    expect(result.container).toBe(mockContainerOutputs);
    expect(result.registry).toBeDefined();
  });
});
