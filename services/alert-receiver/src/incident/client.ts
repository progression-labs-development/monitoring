export interface IncidentPayload {
  domain: string;
  type: string;
  severity: string;
  fingerprint: string;
  observed: Record<string, unknown>;
  resource: Record<string, unknown>;
  actor?: Record<string, unknown>;
  permitted_actions?: string[];
}

export interface IncidentResponse {
  id: string;
  fingerprint: string | null;
  status: string;
}

export interface IncidentClient {
  createIncident(payload: IncidentPayload): Promise<IncidentResponse>;
  listOpenByType(type: string): Promise<IncidentResponse[]>;
  resolveIncident(id: string, outcome: Record<string, unknown>): Promise<void>;
}

async function getIdToken(audience: string): Promise<string | null> {
  const metadataUrl = `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;
  try {
    const res = await fetch(metadataUrl, {
      headers: { "Metadata-Flavor": "Google" },
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

async function authHeaders(baseUrl: string): Promise<Record<string, string>> {
  const token = await getIdToken(baseUrl);
  if (token) return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  return { "Content-Type": "application/json" };
}

export function createIncidentClient(baseUrl: string): IncidentClient {
  return {
    async createIncident(payload: IncidentPayload): Promise<IncidentResponse> {
      const res = await fetch(`${baseUrl}/incidents`, {
        method: "POST",
        headers: await authHeaders(baseUrl),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to create incident (${res.status}): ${body}`);
      }
      return res.json() as Promise<IncidentResponse>;
    },

    async listOpenByType(type: string): Promise<IncidentResponse[]> {
      const res = await fetch(
        `${baseUrl}/incidents?status=open&type=${encodeURIComponent(type)}`,
        { headers: await authHeaders(baseUrl) },
      );
      if (!res.ok) {
        throw new Error(`Failed to list incidents (${res.status})`);
      }
      const body = (await res.json()) as { data: IncidentResponse[] };
      return body.data;
    },

    async resolveIncident(id: string, outcome: Record<string, unknown>): Promise<void> {
      const res = await fetch(`${baseUrl}/incidents/${encodeURIComponent(id)}/resolve`, {
        method: "POST",
        headers: await authHeaders(baseUrl),
        body: JSON.stringify({ outcome, status: "remediated" }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to resolve incident (${res.status}): ${body}`);
      }
    },
  };
}
