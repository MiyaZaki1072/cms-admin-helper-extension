import type { AwsClient } from '@/core/aws-client';
import { TrackerStore } from './store';

const stores = new Map<string, TrackerStore>();

/** One TrackerStore per contest per page, shared by the overlay and the inline AWS page boosts. */
export function getTracker(client: AwsClient, contestId: number): TrackerStore {
  const key = `${client.baseUrl}|${contestId}`;
  let store = stores.get(key);
  if (!store) {
    store = new TrackerStore(client, contestId);
    stores.set(key, store);
  }
  return store;
}
