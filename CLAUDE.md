# CLAUDE.md

## Efficiency Directives
- **Always be concise.** Prefer code edits over full file rewrites.
- **Before starting:** Read the files explicitly named in the prompt. Do not perform global repository "greps" or "searches" unless the task requires it.
- **State consistency:** Always check if a change affects both frontend and backend (e.g., GST logic, currency symbols).
- **Environment Logic:** When editing `src/api/client.ts`, always use: `import.meta.env.DEV ? 'http://localhost:8000' : ''`.

## Project Overview
Counting House is a full-stack ledger/accounting app:
- **Frontend**: React 19 + TypeScript + Vite SPA.
- **Backend**: FastAPI + SQLAlchemy + PostgreSQL.
- **Production:** FastAPI serves the built `dist/` folder via a catch-all route.

## Workflow & Sync Requirements
- **Calculation Sync:** GST/TDS and invoice status logic exists in BOTH `app/services/ledger.py` (authoritative) and `src/lib/ledger.ts` (display/filtering). **You must update both simultaneously.**
- **Audit Trail:** Every mutating backend endpoint MUST write to the `AuditLog` table using `AuditService.log(...)` in the same transaction.
- **Currency:** Base data is always INR. Conversion is a client-side display layer using Frankfurter API, cached locally.

## Commands Reference
- **Frontend:** `npm run dev` (port 5173), `npm run build` (builds to `dist/`).
- **Backend:** `uvicorn app.main:app --reload` (port 8000). Use `.venv/Scripts/python.exe`.

## Architecture Details
### Backend (`app/`)
- `main.py` is the entry point (CORS, router registration).
- `models/__init__.py` contains all SQLAlchemy models.
- `auth.py` handles JWT/Bcrypt.
- `routers/ledger.py` handles business logic; `services/ledger.py` holds pure calculation helpers.

### Frontend (`src/`)
- `auth/AuthContext.tsx` handles session.
- `ledger/LedgerContext.tsx` fetches aggregate data.
- `lib/ledger.ts` mirrors backend calculations.
- `lib/currency.ts` + `hooks/useCurrency.ts` handles FX rates and display conversion.
- `api/client.ts` maps API routes.

## Cross-Cutting Notes
- **GST/TDS Logic:** Must match on both frontend (`src/lib/ledger.ts`) and backend (`app/services/ledger.py`).
- **Authorization:** Two-tier (authenticated vs. superadmin).
- **No CI/CD:** No automated tests or CI pipelines exist.