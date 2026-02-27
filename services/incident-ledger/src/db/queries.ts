import type { Pool } from "pg";
import type { Incident, IncidentDomain, IncidentSeverity, IncidentStatus, IncidentType } from "../types";

export interface CreateIncidentInput {
  domain: string;
  type: string;
  severity: string;
  fingerprint?: string;
  observed?: Record<string, unknown>;
  expected?: Record<string, unknown>;
  delta?: Record<string, unknown>;
  resource?: Record<string, unknown>;
  actor?: Record<string, unknown>;
  permitted_actions?: string[];
  constraints?: Record<string, unknown>;
}

export async function insertIncident(pool: Pool, input: CreateIncidentInput): Promise<Incident> {
  const { rows } = await pool.query(
    `INSERT INTO incidents (domain, type, severity, fingerprint, observed, expected, delta, resource, actor, permitted_actions, constraints)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      input.domain,
      input.type,
      input.severity,
      input.fingerprint ?? null,
      JSON.stringify(input.observed ?? {}),
      JSON.stringify(input.expected ?? {}),
      JSON.stringify(input.delta ?? {}),
      JSON.stringify(input.resource ?? {}),
      JSON.stringify(input.actor ?? {}),
      input.permitted_actions ?? [],
      JSON.stringify(input.constraints ?? {}),
    ],
  );
  return formatRow(rows[0]);
}

export interface ListIncidentsFilter {
  status?: IncidentStatus;
  domain?: IncidentDomain;
  type?: IncidentType;
  severity?: IncidentSeverity;
  limit?: number;
  offset?: number;
}

export async function listIncidents(pool: Pool, filter: ListIncidentsFilter): Promise<Incident[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filter.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filter.status);
  }
  if (filter.domain) {
    conditions.push(`domain = $${idx++}`);
    params.push(filter.domain);
  }
  if (filter.type) {
    conditions.push(`type = $${idx++}`);
    params.push(filter.type);
  }
  if (filter.severity) {
    conditions.push(`severity = $${idx++}`);
    params.push(filter.severity);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;

  const { rows } = await pool.query(
    `SELECT * FROM incidents ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset],
  );
  return rows.map(formatRow);
}

export async function getIncident(pool: Pool, id: string): Promise<Incident | null> {
  const { rows } = await pool.query("SELECT * FROM incidents WHERE id = $1", [id]);
  return rows.length > 0 ? formatRow(rows[0]) : null;
}

export interface ClaimResult {
  success: boolean;
  incident: Incident | null;
}

export async function claimIncident(
  pool: Pool,
  id: string,
  claimedBy: string,
): Promise<ClaimResult> {
  const { rows } = await pool.query(
    `UPDATE incidents
     SET status = 'claimed', claimed_by = $2, claimed_at = now()
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [id, claimedBy],
  );
  if (rows.length === 0) {
    return { success: false, incident: null };
  }
  return { success: true, incident: formatRow(rows[0]) };
}

export async function resolveIncident(
  pool: Pool,
  id: string,
  outcome: Record<string, unknown>,
  status: "remediated" | "escalated" = "remediated",
): Promise<Incident | null> {
  const { rows } = await pool.query(
    `UPDATE incidents
     SET status = $2, outcome = $3, resolved_at = now()
     WHERE id = $1 AND status IN ('open', 'claimed')
     RETURNING *`,
    [id, status, JSON.stringify(outcome)],
  );
  return rows.length > 0 ? formatRow(rows[0]) : null;
}

function formatRow(row: Record<string, unknown>): Incident {
  return {
    ...row,
    created_at: (row.created_at as Date).toISOString(),
    claimed_at: row.claimed_at ? (row.claimed_at as Date).toISOString() : null,
    resolved_at: row.resolved_at ? (row.resolved_at as Date).toISOString() : null,
  } as Incident;
}
