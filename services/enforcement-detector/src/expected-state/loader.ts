import { Storage } from "@google-cloud/storage";
import type { ExpectedState } from "./types";

/**
 * Fetch expected-state.json from a GCS bucket.
 */
export async function loadExpectedState(
  bucket: string,
  path: string,
): Promise<ExpectedState> {
  const storage = new Storage();
  const file = storage.bucket(bucket).file(path);
  const [contents] = await file.download();
  const state = JSON.parse(contents.toString()) as ExpectedState;

  if (state.version !== 1) {
    throw new Error(`Unsupported expected-state version: ${state.version}`);
  }

  return state;
}
