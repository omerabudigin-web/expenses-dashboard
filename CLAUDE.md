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
| `DB1_NAME` / `DB2_NAME` / `DB3_NAME` | Up to 3 databases |
| `PORT` | Server port (default 3001) |
| `POLL_INTERVAL_MS` | SSE polling interval (default 60000ms) |
| `DATA_START_DATE` | Filter date for queries (default 2025-10-01) |

## Architecture

### Backend (`server/`)

| File | Role |
|---|---|
| `index.js` | Express app: routes, Helmet CSP, static serving |
| `db.js` | MSSQL connection pool manager — pools up to 3 DBs, auto-reconnects |
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
