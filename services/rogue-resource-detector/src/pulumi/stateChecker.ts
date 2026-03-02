export interface PulumiResource {
  type: string;
  id: string;
  urn: string;
}

export interface PulumiState {
  resources: PulumiResource[];
}

/**
 * Fetch current Pulumi state and check if a resource exists.
 */
export async function checkPulumiState(
  stateUrl: string,
  resourceId: string,
): Promise<{ exists: boolean; resource: PulumiResource | null }> {
  const res = await fetch(`${stateUrl}/resources?id=${encodeURIComponent(resourceId)}`);

  if (!res.ok) {
    throw new Error(`Failed to query Pulumi state (${res.status})`);
  }

  const body = (await res.json()) as { data: PulumiResource[] };
  const match = body.data.find((r) => r.id === resourceId);

  return {
    exists: !!match,
    resource: match ?? null,
  };
}

/**
 * Check if a Pulumi deployment is currently active.
 * If active, the event likely came from Pulumi itself and should be ignored.
 */
export async function isDeploymentActive(
  deploymentLockUrl: string,
): Promise<boolean> {
  try {
    const res = await fetch(deploymentLockUrl);
    if (!res.ok) {
      return false;
    }
    const body = (await res.json()) as { locked: boolean };
    return body.locked;
  } catch {
    return false;
  }
}
