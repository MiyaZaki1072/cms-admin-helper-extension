/** Recently opened contestants, pinned at the top of the picker (per contest). */
import { browser } from 'wxt/browser';

const MAX = 8;
const key = (contestId: number) => `tracker:recent:${contestId}`;

export async function getRecent(contestId: number): Promise<number[]> {
  const value = (await browser.storage.local.get(key(contestId)))[key(contestId)];
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : [];
}

export async function pushRecent(contestId: number, userId: number): Promise<number[]> {
  const next = [userId, ...(await getRecent(contestId)).filter((id) => id !== userId)].slice(0, MAX);
  await browser.storage.local.set({ [key(contestId)]: next });
  return next;
}
