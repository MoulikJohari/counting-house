# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Counting House is a full-stack ledger/accounting app for tracking Purchase Orders, Invoices, Expenses, and recurring expenses, with GST/TDS tax calculations and an audit trail.

- **Frontend**: React 19 + TypeScript + Vite SPA (`src/`).
- **Backend**: FastAPI + SQLAlchemy + PostgreSQL (`app/`).
- **Production**: FastAPI serves the built `dist/` folder directly via a catch-all route (see `app/main.py`) — there is no separate frontend server in production.

## Commands

**Frontend** (run from repo root):
- `npm run dev` — Vite dev server on port 5173
- `npm run build` — `tsc -b && vite build`, outputs to `dist/`
- `npm run lint` — oxlint (config in `.oxlintrc.json`)
- `npm run preview` — preview the production build

**Backend**:
- `uvicorn app.main:app --reload` — dev server on port 8000, use `.venv/Scripts/python.exe` (Windows venv)
- Dependencies: `pip install -r requirements.txt`
- No CI/CD and no automated test suite exists — there is no `pytest`/`vitest` command to run.

Both servers must run concurrently for local dev (frontend on 5173 talks to backend on 8000 via CORS).

## Architecture

### Backend (`app/`)
- `main.py` — FastAPI entry point: CORS setup, router registration, lifespan hook (creates tables, seeds the superadmin user, generates due recurring expenses on startup), and the static-file/catch-all routes that serve `dist/` in production.
- `config.py` — `pydantic-settings` config loaded from `.env` (`database_url`, `jwt_secret`, `superadmin_*`, `cors_origins`).
- `database.py` — SQLAlchemy engine/session (`get_db` dependency), declarative `Base`.
- `models/__init__.py` — all SQLAlchemy models in one file: `User`, `PurchaseOrder`, `Invoice`, `InvoicePayment`, `RecurringExpense`, `Expense`, `AppSettings` (singleton row, id=1), `AuditLog`.
- `schemas/__init__.py` — all Pydantic request/response schemas in one file, mirroring the models.
- `auth.py` — JWT (python-jose) + bcrypt (passlib) auth. `get_current_user` and `require_superadmin` are the two FastAPI dependencies gating every protected route (two-tier authorization: authenticated user vs. superadmin).
- `seed.py` — creates the superadmin user and the default `AppSettings` row on startup if missing.
- `routers/ledger.py` — nearly all business endpoints (PO/Invoice/Expense/Recurring CRUD, settings, backup/restore, CSV/XLSX export, CSV/XLSX import, users, audit logs). `routers/auth.py` handles login/`/me` only.
- `services/ledger.py` — pure calculation and parsing helpers used by the routers: `inv_calc`/`po_calc` (GST/TDS/status math), `parse_csv_rows`/`parse_xlsx_rows` (import row extraction), `parse_amount`/`parse_date` (strict input parsing for imports), `generate_recurring` (materializes due recurring expenses), `AuditService.log` (audit trail writer), `*_to_dict` helpers (used for backup export and audit-log diffs).

### Frontend (`src/`)
- `auth/AuthContext.tsx` — holds the JWT-authenticated `User`, exposes `login`/`logout`; `ProtectedRoute.tsx` gates routes on it.
- `ledger/LedgerContext.tsx` — fetches the aggregate `/api/ledger` payload (pos, invoices, expenses, recurring, currency) once and provides it plus currency formatting/conversion helpers to every page.
- `lib/ledger.ts` — mirrors backend GST/TDS/status calculation and period-filtering logic (`invCalc`, `poCalc`, `inPeriod`, `compute`) for client-side display without a round-trip.
- `lib/currency.ts` + `hooks/useCurrency.ts` — client-side-only currency *display* layer: base data is always INR, FX rates come from the Frankfurter API and are cached in `localStorage` for ~12h.
- `lib/exportFormats.ts` / `lib/exportRows.ts` — CSV/XLSX/PDF export and blank-template generation (`write-excel-file`, `jspdf`).
- `api/client.ts` — single `api` object wrapping all backend calls; `request()` centralizes auth headers, 401 handling (via `setUnauthorizedHandler`), and error unwrapping.
- `components/CsvImportButton.tsx` — shared PO/Invoice/Expense import UI (template download + file picker); accepts both `.csv` and `.xlsx`.
- `pages/` — one page per top-level route (Dashboard, PurchaseOrders, Invoices, Expenses, Users, Logs, Login), each pulling from `LedgerContext`/`AuthContext` rather than fetching independently.

## Critical Sync Requirements

- **GST/TDS and invoice-status calculation logic is duplicated intentionally** between `app/services/ledger.py` (`inv_calc`/`po_calc`, authoritative) and `src/lib/ledger.ts` (`invCalc`/`poCalc`, display/filtering). **Any change to this math must be made in both files identically**, including the period-boundary logic (`fy`/`month` bounds exist independently on both sides).
- **Import row parsing must stay format-agnostic**: `parse_csv_rows`/`parse_xlsx_rows` in `services/ledger.py` both return `list[tuple[row_number, dict]]` with identical normalized keys (lowercased, spaces→underscores) so the router's insertion logic works unchanged regardless of source format. Ghost/blank rows are dropped silently in the parser, not treated as errors.
- **Every mutating backend endpoint must write to `AuditLog`** via `AuditService.log(...)` in the same transaction as the mutation (see any `create_*`/`update_*`/`delete_*`/`import_*` endpoint in `routers/ledger.py` for the pattern).
- **Row-level import failures must not abort the batch**: each import endpoint wraps a single row's insert in `db.begin_nested()` (a SAVEPOINT) so one bad row rolls back independently while prior/later rows in the same file still commit.
- **Currency is always INR at rest.** Any currency other than INR is a client-side conversion for display only (`lib/currency.ts`); never convert before persisting.
- **`src/api/client.ts` environment logic**: `const API_URL = import.meta.env.DEV ? 'http://localhost:8000' : ''` — preserve this exact pattern when touching that file, since production relies on same-origin requests to the FastAPI catch-all.
