import { useEffect, useState } from 'preact/hooks';
import { formatDuration, parseDuration } from '@/core/duration';
import type { ContestTimes } from '@/core/model';
import { formatCmsDateTime, parseCmsDateTime } from '@/core/parsers';
import { getSettings, saveSettings } from '@/core/settings';
import {
  allZones,
  countdown,
  formatDateTime,
  fromLocalInput,
  getDisplayZone,
  humanDateTime,
  setDisplayZone,
  toLocalInput,
  zoneLabel,
} from '@/core/time';
import { loadRoster } from '@/features/tracker/roster';
import { useHelper } from '../context';

const SKEW_WARN_MS = 60_000;

export function TimeTab() {
  const { client, contest, visible } = useHelper();
  const [now, setNow] = useState(Date.now());
  const [times, setTimes] = useState<ContestTimes | null>(null);
  const [zone, setZone] = useState(getDisplayZone());
  const [pageUtc, setPageUtc] = useState(false);
  const [local, setLocal] = useState(toLocalInput(Date.now()));
  const [utc, setUtc] = useState(formatCmsDateTime(Date.now()));
  const [duration, setDuration] = useState('1h 30m');

  useEffect(() => {
    if (!visible) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [visible]);

  useEffect(() => {
    void getSettings().then((s) => setPageUtc(s.pageTimesUtc));
  }, []);

  useEffect(() => {
    if (!contest) return;
    loadRoster(client, contest.id).then(
      (r) => setTimes(r.times),
      () => setTimes(null),
    );
  }, [client, contest?.id]);

  const offset = client.serverClockOffsetMs;
  const serverNow = now + (offset ?? 0);
  const localMs = fromLocalInput(local, zone);
  let utcMs: number | null = null;
  try {
    utcMs = parseCmsDateTime(utc);
  } catch {
    utcMs = null;
  }
  const seconds = parseDuration(duration);

  const changeZone = (z: string) => {
    setDisplayZone(z);
    setZone(getDisplayZone());
    void saveSettings({ displayZone: z });
  };

  return (
    <section class="cah-panel">
      <div class="cah-card" data-testid="time-clock">
        <h3>Clock</h3>
        <dl class="cah-dl">
          <dt>{zoneLabel(zone)}</dt>
          <dd>
            <strong>{formatDateTime(serverNow, zone)}</strong>
          </dd>
          <dt>UTC</dt>
          <dd>{formatCmsDateTime(serverNow)}</dd>
          {contest && times && times.start > 0 && (
            <>
              <dt>{contest.name}</dt>
              <dd data-testid="time-countdown">
                {countdown(serverNow, {
                  start: times.start * 1000,
                  stop: times.stop * 1000,
                  analysisStart: times.analysisStart * 1000,
                  analysisStop: times.analysisStop * 1000,
                })}
                <span class="cah-muted">
                  {' '}
                  ({humanDateTime(times.start * 1000, zone)} – {formatDateTime(times.stop * 1000, zone).slice(11, 16)} {zoneLabel(zone)})
                </span>
              </dd>
            </>
          )}
          <dt>Server clock</dt>
          <dd>
            {offset === null
              ? 'unknown until the first request'
              : Math.abs(offset) > SKEW_WARN_MS
                ? `Warning: this computer is ${Math.round(Math.abs(offset) / 1000)} s ${offset > 0 ? 'behind' : 'ahead of'} the CMS server.`
                : 'in sync with this computer (within 1 minute)'}
          </dd>
        </dl>
      </div>

      <div class="cah-card">
        <h3>Convert</h3>
        <div class="cah-convert">
          <label>
            {zoneLabel(zone)} time
            <input type="datetime-local" value={local} onInput={(e) => setLocal(e.currentTarget.value)} aria-label={`${zoneLabel(zone)} time`} />
          </label>
          <span>→ UTC</span>
          <code data-testid="convert-utc">{localMs === null ? '—' : formatCmsDateTime(localMs)}</code>
        </div>
        <div class="cah-convert">
          <label>
            UTC (as AWS shows it)
            <input type="text" value={utc} onInput={(e) => setUtc(e.currentTarget.value)} aria-label="UTC time" size={20} />
          </label>
          <span>→ {zoneLabel(zone)}</span>
          <code data-testid="convert-local">{utcMs === null ? 'use YYYY-MM-DD HH:MM:SS' : humanDateTime(utcMs, zone)}</code>
        </div>
        <div class="cah-convert">
          <label>
            Duration
            <input type="text" value={duration} onInput={(e) => setDuration(e.currentTarget.value)} aria-label="Duration" size={10} />
          </label>
          <span>→</span>
          <code data-testid="convert-seconds">{seconds === null ? 'e.g. 1h 30m, 90m, 5400' : `${seconds} seconds (${formatDuration(seconds)})`}</code>
        </div>
        <p class="cah-muted">
          To set contest times, use the Quick setup card on the contest page:{' '}
          {contest && (
            <a href={client.url(`contest/${contest.id}`)} target="_top">
              open {contest.name} settings
            </a>
          )}
        </p>
      </div>

      <div class="cah-card">
        <h3>Settings</h3>
        <label class="cah-field">
          Show times in
          <select value={zone} onChange={(e) => changeZone(e.currentTarget.value)} aria-label="Display timezone">
            {allZones().map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label class="cah-check">
          <input
            type="checkbox"
            checked={pageUtc}
            onChange={(e) => {
              setPageUtc(e.currentTarget.checked);
              void saveSettings({ pageTimesUtc: e.currentTarget.checked });
            }}
          />{' '}
          Leave times on AWS pages in UTC
        </label>
      </div>
    </section>
  );
}
