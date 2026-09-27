# Testing

## Unit tests

```bash
pnpm test          # Vitest, jsdom
pnpm typecheck
pnpm check         # typecheck + unit tests + Chrome and Firefox builds
```

The parser tests run against the saved AWS pages in [`tests/fixtures/v1.5`](../tests/fixtures/v1.5). To refresh them from the
local server: `pnpm fixtures`.

A guard test (`tests/unit/no-unsafe-html.test.ts`) fails if any source file uses `innerHTML`, `outerHTML`,
`insertAdjacentHTML`, `document.write`, `dangerouslySetInnerHTML`, `eval` or `new Function`.

## End-to-end tests

Chromium with the unpacked extension, against the local CMS v1.5 from [dev-server.md](dev-server.md) (seeded and running).

```bash
pnpm test:e2e                          # builds the e2e variant, then runs Playwright
IMPORT_COUNT=300 pnpm exec playwright test tests/e2e/import-run.spec.ts   # the full 300-user import (about 5 minutes)
HEADED=1 pnpm exec playwright test ...  # watch it
```

The e2e build (`pnpm build:e2e`, output `.output/chrome-mv3-e2e`) is the normal build plus a pre-granted host permission for
`http://localhost:8889`, because Playwright cannot click the permission prompt.

What is covered:

| Spec | What it checks |
| --- | --- |
| `skeleton` | Helper appears on AWS only after setup, and not on the contestant site |
| `shell` | Overlay opens and closes (Esc), picks the page's contest; read-only admins see write actions disabled |
| `hardening` | No request to any host except the AWS origin; an expired session is detected; nothing on the login page |
| `tracker` | Full sync, per-user counts equal each participation page, second sync is one request, index survives reloads |
| `tracker-views` | "What did stu007 do on task max?" in two clicks; grid, filters, submission detail, XLSX export, compare, AWS page filter bar, hover cards |
| `time` | Quick setup 09:00–14:00 Bangkok saves 02:00–07:00 UTC and the contestant site shows 09:00; save warnings; page times; Time tab |
| `import` | Preview statuses for duplicates, bad IPs, existing users; pattern generation |
| `import-run` | Import with teams, IPs and extra time: zero failures, re-run changes nothing, results file, login cards; bulk reset / add / remove |
| `shortcuts` | Status bar, questions inbox with badge and reply, announcement templates, bulk extra time, bulk message, seat map IPs, re-evaluate confirmation, checklist, ranking snapshot, submission zip |

Tests that write to CMS use the `practice` / `practice2` contests or undo their changes. Import runs use unique usernames, so the
suite can be repeated on the same server (each run adds users; reset the database as described in dev-server.md to start clean).

## Firefox

```bash
pnpm lint:firefox        # web-ext lint on the Firefox build
pnpm dev:firefox         # opens Firefox with the extension (needs Firefox 140 or newer)
```

`web-ext lint` reports 0 errors. The two remaining warnings (`UNSAFE_VAR_ASSIGNMENT`) are inside Preact's renderer: the code
path for `dangerouslySetInnerHTML`, which the extension never uses (see the guard test).

## Load

`pnpm latency --seconds 60 --rate 2` logs in to AWS and requests a few AWS pages (submissions, users, a participation, the ranking)
at a steady rate, then prints the median, 95th percentile and slowest response time.

Measured on the development machine (CMS v1.5 in Docker Desktop on Windows 11, 16 workers):

| Condition | Probe requests | Errors | Median | 95th percentile | Slowest |
| --- | --- | --- | --- | --- | --- |
| Idle | 59 | 0 | 81 ms | 209 ms | 243 ms |
| `cms-stresstest.sh` running + a full tracker sync + a 300-user import | 763 | 0 | 171 ms | 648 ms | 1105 ms |

Under that load the 300-user import finished with zero failures in 5.7 minutes (5.3 minutes idle), and the stress test's
contestant actors kept completing their requests. The helper's own traffic is capped at 2 requests in flight and 4 per second
across all AWS tabs (Web Locks), with back-off on 5xx.

`cms-stresstest.sh` names its Docker project after the git branch, which is `HEAD` in a tag checkout and is rejected by Docker.
Run the same service with an explicit name instead:

```bash
cd cms-server
docker compose -p cmsstress -f docker-compose.test.yml run --build --rm stresstestcms
# stop: Ctrl+C, then
docker compose -p cmsstress -f docker-compose.test.yml down
```
