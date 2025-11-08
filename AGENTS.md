# Repository Guidelines

## Project Structure & Module Organization
- `backend/app` hosts the FastAPI entrypoint (`main.py`), LangChain agents/orchestrator, database connectors, and shared tools; reports/prompt assets live under `backend/reports` and `backend/tools`.
- `frontend/src` contains the React + Vite dashboard, organized by feature folders (chat, analytics, shared UI). `frontend/index.html` is the SPA mount point and `vite.config.ts` holds build aliases.
- Infrastructure resources live at the repo root: `docker-compose.yml`, service Dockerfiles, `nginx/` configs, plus roadmap docs (`ENHANCEMENTS.md`, `WARP.md`).

## Build, Test, and Development Commands
```bash
# Full stack
docker-compose up --build -d

# Focused dev loops
cd backend && uvicorn app.main:app --reload
cd frontend && npm run dev

# Production assets
npm run build
```
- Sync Python deps with `cd backend && pip install -r requirements.txt`; use `docker-compose logs -f` while debugging multi-service flows.

## Coding Style & Naming Conventions
- Backend Python uses Black (88-char lines) + Flake8; run `black app && flake8 app` before commits. Keep modules snake_case and favor descriptive agent/service names (`sql_agent.py`, `VisualizationService`).
- Type hints are mandatory (`mypy app`). Frontend code follows ESLint (`npm run lint`), React hooks, and `PascalCase` components placed under `src/components` or feature folders.

## Testing Guidelines
- Backend suite relies on `pytest`, `pytest-asyncio`, and `pytest-cov`; execute `cd backend && pytest --cov=app app/tests` and add cases for both happy path and failure modes (e.g., invalid SQL, throttled OpenAI calls).
- Co-locate frontend tests with components using Vitest/RTL naming like `ChatInterface.test.tsx`. Include snapshot updates whenever UI output changes.
- Treat >80% coverage on new agents/services as a baseline and document edge cases in PR descriptions.

## Commit & Pull Request Guidelines
- Follow the existing Conventional Commit style (`feat:`, `fix:`, `refactor:`) seen in `git log` for consistent history.
- PRs must explain scope, list test commands/screenshots (especially for UI), reference related issues or roadmap items, and call out env or schema changes.
- Rebase onto `main`, keep diffs focused, and request reviews only after lint/tests pass locally.

## Environment & Secrets
- Store Azure SQL, OpenAI, and Redis credentials in per-service `.env` files (`backend/.env`, `frontend/.env`); never commit secrets.
- When adding config, mirror defaults across `.env.example`, `docker-compose.yml`, and README sections so agents stay deployable without guesswork.
