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
}

export function createIncidentClient(baseUrl: string): IncidentClient {
  return {
    async createIncident(payload: IncidentPayload): Promise<IncidentResponse> {
      const res = await fetch(`${baseUrl}/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      );
      if (!res.ok) {
        throw new Error(`Failed to list incidents (${res.status})`);
      }
      const body = (await res.json()) as { data: IncidentResponse[] };
      return body.data;
    },
  };
}
