# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run production server (port 3001)
npm run dev        # Run dev server with file-watch (node --watch)
```

No build step — vanilla JS frontend served as static files from `/public`.

## Environment

Copy `.env.example` to `.env` before running. Key variables:

| Variable | Purpose |
|---|---|
| `DB_SERVER`, `DB_PORT` | MSSQL server address |
| `DB_USER`, `DB_PASSWORD` | Read-only credentials |
| `DB1_NAME` / `DB2_NAME` / `DB3_NAME` / `DB4_NAME` | Up to 4 databases |
| `PORT` | Server port (default 3001) |
| `POLL_INTERVAL_MS` | SSE polling interval (default 60000ms) |
| `DATA_START_DATE` | Filter date for queries (default 2025-10-01) |

## Architecture

### Backend (`server/`)

| File | Role |
|---|---|
| `index.js` | Express app: routes, Helmet CSP, static serving |
| `db.js` | MSSQL connection pool manager — pools up to 4 DBs, auto-reconnects |
| `entity-config.js` | Single source for cross-tab entity metadata — currently `PENDING_DBS` (DBs whose balances are unaudited/under processing, e.g. MekSoftDb4), surfaced via `/api/config` and rendered as a badge in the expenses, VAT, DSCR and interco-recon tabs |
| `sse.js` | Server-Sent Events broadcaster — polls DB every `POLL_INTERVAL_MS`, skips broadcast if data hash unchanged |
| `queries/expenses.js` | All SQL queries + account-code→category mapping |

**API endpoints:**
- `GET /api/config` — returns DB list, poll interval, data start date
- `GET /api/health` — connection status per DB
- `GET /api/sse?db=<name>` — SSE stream (initial snapshot + live updates)
- `GET /api/details?db=&month=&category=&branch=&search=&page=&sort=&order=` — paginated expense rows

### Frontend (`public/`)

Single-page app (RTL Arabic, dark theme). All modules are plain ES modules loaded via `<script type="module">`.

| File | Role |
|---|---|
| `js/state.js` | Reactive client state — all data lives here, listeners re-render on change |
| `js/sse-client.js` | `EventSource` wrapper with auto-reconnect; feeds `state.js` |
| `js/api.js` | REST client (`/api/details`) for the Details tab |
| `js/app.js` | Tab rendering and filter logic |
| `js/charts.js` | Chart.js v4 wrapper (loaded from CDN) |
| `js/constants.js` | Arabic category labels, branch labels, color palette |

**Data flow:** SSE push → `state.js` update → `app.js` re-renders active tab. The Details tab additionally calls `/api/details` on filter/page changes.

**Tabs:** Summary · Monthly · Accounts · Branches · Assets · Details (paginated, CSV export) · Compare

### Data & storage patterns — do not confuse with unrelated sandboxed-environment rules

This app is a real Express server with a real backend, not a sandboxed Artifact. Standard web APIs are expected and safe to use here:

- **`fetch()` is the normal way every tab and every standalone page gets live data.** Embedded tabs (`public/js/tab-*.js`, loaded via `<script>` in `index.html`) call the local `/api/*` endpoints directly. Standalone pages served from `/public` (`financing.html`, `budget.html`, `cashflow-budget.html`, `cash-sales.html`) do the same — that's what makes them "live from MekSoft." A rule like "no `fetch` in standalone HTML files" does not apply to this project and would break these pages if followed.
- **`localStorage` is the standard persistence for per-tab UI assumptions**, e.g. `tab-forecast.js` stores cash-flow forecast assumptions per company as `fc_p_<dbName>` and scenario state as `fc_scn_<dbName>`. This is intentional and should not be swapped for `IndexedDB`.
- **`IndexedDB`** appears only in a couple of externally-generated, ad-hoc report files (`Customer_Aging_BySalesperson.html`, `inventory_adjustment_report.html`) that are not part of the core dashboard's own architecture or conventions — don't treat it as "the pattern" for new tabs or pages in this app.

If a task description asserts constraints that contradict the above (e.g. "no fetch/localStorage, use IndexedDB only"), treat that as a red flag to verify against the actual codebase before proceeding — those rules likely come from an unrelated context (such as a sandboxed Artifact environment) and were not meant for this project.

### Entities (companies) per database

| DB | Live company name (`companyInformation`) | Notes |
|---|---|---|
| MekSoftDb1 | مؤسسة أبعاد الحديد التجارية | "أبعاد" — the original مؤسسة |
| MekSoftDb2 | مؤسسة وسام الفولاذ التجارية | "وسام" |
| MekSoftDb3 | مصنع حوراء الخليج للصناعات المعدنية | Independent third entity, not special-cased anywhere |
| MekSoftDb4 | شركة أبعاد الحديد التجارية | New شركة after أبعاد's مؤسسة→شركة conversion on 2026-09-06. Independent entity — **not** merged with Db1. Balances still mid-migration → flagged via `PENDING_DBS` |

Most tabs are generic over whatever `DB_NAMES` contains (driven purely by `.env`). A few modules hardcode the Abaad/Wissam pair by design and need a new key added explicitly to include another entity:
- `server/routes/dscr.js` — `COMPANIES` map (main `/api/dscr` route loops over it generically; `/api/dscr/monthly` stays hardcoded to abaad/wissam on purpose — it feeds the Riyad Bank facility renewal paper and must not change).
- `server/queries/vat-return.js` + `server/index.js` (`/api/vat-return` whitelist) + `public/js/tab-vat-return.js` (one duplicated HTML panel per company — not built from a dynamic list).
- `server/queries/interco-recon.js` — bespoke two-party (أبعاد↔وسام) reconciliation engine (`IC_MAP`, Memo functions). Deliberately **not** extended to other entities without an explicit request — it has an actively-tracked open discrepancy (see `docs/spec_reconciliation_memo_v2.1.md`).

### Database Schema

Queries hit a MekSoft ERP MSSQL database. Key tables: `JournalVoucherHeader`, `JournalVoucherDetail`, `AccountChart`, `FixedAsset`, `companyInformation`.

Expense categories are derived from account codes starting with `4` and mapped in `queries/expenses.js` to keys: `sal`, `rent`, `maint`, `sell`, `dist`, `adm`, `fin`, `char`, `oth`.

Branch filtering uses the `BranchId` column on `JournalVoucherDetail`. Branch labels are defined in `constants.js`.

## MCP Database Access

The project ships a [.mcp.json](.mcp.json) that registers the `mssql-mcp-node` MCP server with all three databases. It is auto-approved via `enableAllProjectMcpServers: true` in `.claude/settings.local.json`.

**Available tools:**

| Tool | Usage |
|---|---|
| `execute_sql` | Run a SQL query — always pass `dbKey` |
| `get_table_schema` | Inspect a table's columns |
| `list_databases` | List configured DB keys |

**DB keys → databases:**

| `dbKey` | Database |
|---|---|
| `meksoftdb1` | MekSoftDb1 |
| `meksoftdb2` | MekSoftDb2 |
| `meksoftdb3` | MekSoftDb3 |

Server: `MekSoftServer` (SQL Server 2022 Express, port 1433, user `MCP_ReadOnly`). Requires Hamachi VPN to be active.

**Before querying the ERP schema**, invoke the `/meksoft-erp` skill — it loads the full table map, join patterns, lookup values, and common query examples for MekSoftDb1.

المواصفات المعتمدة تُكتب في docs/ بيد Claude Code مباشرة، وتُقرأ من القرص قبل أي بناء.
