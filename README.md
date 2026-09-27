# CMS Admin Helper

A Chrome + Firefox extension that adds missing tools to the admin page (AdminWebServer) of [CMS v1.5](https://github.com/cms-dev/cms/tree/v1.5) — no changes to the CMS server needed.

> **Status:** early development.

## Features (planned)

- **Contestant tracker** — every submission, best score per task, attempts and last activity for one contestant, on one screen.
- **Bulk user import** — create users, teams and contest participations from a CSV/XLSX paste, with preview, result report and printable login cards.
- **Contest-day shortcuts** — bulk extra time, bulk messages, announcement templates, questions inbox, live status bar, one-click re-evaluation.
- **Bangkok-time helper** — enter and read contest times in local time (UTC+7); the extension handles the UTC conversion.

## How it works

The extension runs inside the AWS tab using the admin's own logged-in session. It reads data by parsing the admin HTML pages and writes data by submitting the same forms an admin would. It never talks to any other server.

## Scope

- CMS v1.5 only (other versions fall back to read-only).
- English UI only.

## Tech

[WXT](https://wxt.dev) (Manifest V3) · TypeScript · Preact · Vitest · Playwright · pnpm
