# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cerebro is an AI-powered data analysis platform that integrates Azure SQL databases with Azure OpenAI to provide intelligent data analysis, visualization, and automated machine learning capabilities. The system consists of:

- **Backend**: FastAPI (Python) with LangChain-based agent orchestration
- **Frontend**: React (TypeScript) with Material-UI
- **Infrastructure**: Docker Compose with Redis caching and Nginx reverse proxy
- **AI Integration**: Azure OpenAI (GPT-4 and GPT-5 models) for chat, analysis, and data modeling

## Development Commands

### Backend

```bash
cd backend

# Install dependencies
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run tests
pytest app/tests/ --cov=app
pytest app/tests/test_gdm_service.py -v  # Run specific test file
pytest -k "test_name" -v  # Run specific test

# Code quality
black app/  # Format code
flake8 app/  # Lint
mypy app/  # Type checking
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run development server (with proxy to backend)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint
npm run lint
```

### Docker

```bash
# Start all services (backend, frontend, redis, nginx)
docker-compose up -d

# View logs
docker-compose logs -f
docker-compose logs -f backend  # Specific service

# Rebuild and restart
docker-compose down && docker-compose up --build -d

# Stop services
docker-compose down
```

## Architecture

### Multi-Agent System

The core of Cerebro is the **AgentOrchestrator** (`backend/app/agents/orchestrator.py`) which coordinates specialized agents:

1. **SQL Agent** (`sql_agent.py`): Generates and executes SQL queries against Azure SQL
2. **Pandas Agent** (`pandas_agent.py`): LangChain-based agent for data analysis using pandas
3. **Visualization Tool** (`app/tools/visualization.py`): Creates Plotly charts from data
4. **Report Tool** (`app/tools/report_tools.py`): Generates PDF reports

The orchestrator receives queries with database context from the frontend, determines the appropriate agent(s) to use, and coordinates their execution. Multiple model IDs are supported (GPT-4.1 for chat, GPT-5 for advanced analysis).

### Database Connection Management

Unlike typical backend-managed connections, Cerebro uses **frontend-controlled database connections**:

- Users configure database connections via the frontend UI (`ConnectionDialog.tsx`)
- Connection credentials are sent with each request and stored in `active_connections` dict (`backend/app/api/routes/database.py`)
- The orchestrator retrieves the engine from `active_connections` using `connection_id` from request context
- No database connection is established at backend startup

### Global Data Model (GDM)

The GDM feature (`app/services/gdm_service.py` and `app/services/gdm_results_service.py`) provides:

- Automated database schema analysis and entity relationship discovery
- AI-powered data profiling and business narrative generation
- Outputs: Entity graph, relationship mappings, CSV artifacts, data dictionaries
- Jobs are tracked in memory with progress reporting via polling endpoints
- Results include AutoML metadata for downstream playbook generation

Key endpoints:
- `POST /api/v1/gdm/create` - Start GDM job
- `GET /api/v1/gdm/{job_id}/status` - Poll job status
- `GET /api/v1/gdm/{job_id}/results` - Retrieve complete results

### Playbooks & AutoML

Playbooks (`app/services/playbook_service.py`) are parameterized ML workflows that can:

- Be generated from GDM results (`PlaybookFromGDMRequest`)
- Execute AutoML experiments on Azure ML (`automl_service.py`)
- Define datasets, feature engineering, and model training steps
- Support classification, regression, and forecasting tasks

The `PlaybookGenerationService` uses Azure OpenAI to intelligently generate playbook definitions from GDM artifacts and user-specified use cases.

### Frontend Architecture

The frontend is organized around React contexts for state management:

- **DatabaseContext** (`contexts/DatabaseContext.tsx`): Manages database connections and active connection state
- **ChatContext** (`contexts/ChatContext.tsx`): Handles chat history and streaming messages
- **ModelContext** (`contexts/ModelContext.tsx`): Tracks selected AI model (GPT-4.1 vs GPT-5)
- **ThemeModeContext**: Manages light/dark theme switching

Main pages:
- `/solutions/db` - Chat interface with database query capabilities
- `/solutions/realtime` - Real-time data preview (experimental)
- `/solutions/gdm/:jobId/results` - GDM results viewer with graph visualization
- `/database` - Database tables dashboard
- `/` - Solutions hub landing page

Services layer (`frontend/src/services/`):
- `api.ts` - Base axios instance with interceptors
- `databaseApi.ts` - Database connection and query APIs
- `gdmApi.ts` - GDM job creation and polling
- `websocket.ts` - WebSocket manager for streaming chat responses
- `chartService.ts` - Chart generation utilities

### Configuration

**Backend** uses Pydantic Settings (`app/config.py`) with automatic ODBC driver detection for multi-platform support (Windows, macOS, Linux/Docker). The config validates Azure SQL, Azure OpenAI, and Azure ML credentials and provides fallback behavior when services are unavailable.

**Frontend** uses Vite environment variables:
- `VITE_API_URL` - API base URL (default: `/api/v1`)
- `VITE_DEV_PROXY_TARGET` - Dev proxy target for backend (e.g., `http://localhost:8000`)
- `VITE_DEV_PROXY_WS_TARGET` - WebSocket proxy target (optional)

Environment files:
- `backend/.env` - Backend configuration (Azure credentials, Redis URL, etc.)
- `frontend/.env` - Frontend configuration (proxy settings for dev)

## Key Implementation Patterns

### Agent Execution Flow

1. User sends message via `ChatInterface.tsx`
2. Frontend calls `POST /api/v1/chat/message` with `database_connection_id` and `selected_tables` in context
3. `AgentOrchestrator.process_query()` determines query intent and required agents
4. Orchestrator retrieves database engine from `active_connections[connection_id]`
5. SQL or Pandas agent executes with database context
6. Visualization tool creates charts if data returned
7. Response streamed back via WebSocket or returned as JSON

### Model Selection

The system supports two model tiers controlled by the frontend:
- **GPT-4.1** (`AZURE_OPENAI_CHAT_MODEL_NAME`): Standard chat and analysis
- **GPT-5** (`AZURE_OPENAI_COMPLETION_MODEL_NAME`): Advanced reasoning and complex analysis

The `AzureOpenAIService` (`app/services/azure_openai.py`) provides `resolve_model_id()` to map frontend model names to deployment configurations. The `ModelContext` in the frontend manages user selection.

### GDM Job Lifecycle

1. Frontend submits `GDMCreateRequest` with `database_id` and optional `connection` payload
2. `gdm_service` creates a `GDMJob` instance and stores it in memory
3. Background thread executes multi-step analysis: schema extraction, sampling, entity detection, relationship mapping, story generation
4. Each step updates `job.status`, `job.step`, and `job.progress`
5. Artifacts (CSVs, JSONs, PNGs) written to `reports/gdm/<job_id>/`
6. Frontend polls `GET /gdm/{job_id}/status` for progress updates
7. On completion, frontend navigates to `/solutions/gdm/{job_id}/results` to display graph and artifacts

### Visualization System

The `VisualizationTool` (`app/tools/visualization.py`) analyzes data structure and determines appropriate chart types:
- Numeric vs numeric → scatter plot
- Categorical vs numeric → bar chart
- Time series → line chart
- Single metric → pie chart or table

Charts are returned as Plotly JSON specifications. The frontend renders them using `react-plotly.js` in `ChartDisplay.tsx` or `MultipleChartsDisplay.tsx`.

## Testing

Backend tests use pytest with async support:
- Test files in `backend/app/tests/`
- Fixtures for mocking database connections and LLM responses
- Coverage reports generated with `pytest-cov`

Key test files:
- `test_gdm_results_service.py` - Tests GDM result processing and artifact handling
- `test_playbook_service.py` - Tests playbook execution and AutoML integration
- `test_playbook_generation_service.py` - Tests AI-powered playbook generation

## Common Issues

### ODBC Driver Not Found
- **Symptom**: "No SQL Server ODBC driver found" in logs
- **Solution**: Install appropriate driver for your platform:
  - macOS: `brew install msodbcsql17`
  - Linux/Docker: Dockerfile already includes FreeTDS
  - Windows: Install from Microsoft's ODBC Driver download page
- **Override**: Set `ODBC_DRIVER` environment variable to force specific driver

### Azure OpenAI Rate Limits
- The system includes retry logic in `azure_openai.py`
- Adjust `max_retries` parameter if hitting quota issues
- Consider using GPT-4.1 model for less demanding queries

### Docker Networking
- Backend service uses `backend/.env` file loaded via `env_file` in docker-compose
- Redis URL is overridden to `redis://redis:6379` in container
- Frontend proxy target should point to `http://backend:8000` when running in Docker

### GDM Job Memory Management
- GDM jobs are stored in-process memory (not persisted)
- Restarting backend clears all job history
- For production, consider implementing Redis-backed job storage

## API Endpoints Reference

### Chat
- `POST /api/v1/chat/message` - Send chat message with database context
- `WS /api/v1/chat/ws` - WebSocket for streaming responses

### Database
- `POST /api/v1/database/connect` - Establish database connection
- `GET /api/v1/database/schema` - Get database schema
- `GET /api/v1/database/tables` - List tables with metadata

### GDM
- `POST /api/v1/gdm/create` - Start GDM job
- `GET /api/v1/gdm/{job_id}/status` - Get job status
- `GET /api/v1/gdm/{job_id}/results` - Get complete results
- `GET /api/v1/gdm/{job_id}/artifacts/{filename}` - Download artifact

### Playbooks
- `GET /api/v1/playbooks` - List available playbooks
- `POST /api/v1/playbooks/run` - Execute playbook
- `POST /api/v1/playbooks/from-gdm` - Generate playbook from GDM results
- `GET /api/v1/playbooks/{job_id}/status` - Get AutoML job status

### Reports
- `POST /api/v1/reports/generate` - Generate PDF report
- `GET /api/v1/reports/{report_id}` - Download report

## Code Conventions

- Backend uses `app.` import prefix (e.g., `from app.agents.orchestrator import AgentOrchestrator`)
- Frontend uses absolute imports from `src/` via tsconfig paths
- Async/await used throughout for I/O operations
- Type hints required in Python code
- TypeScript strict mode enabled
- Logging via Python's `logging` module (use `logger = logging.getLogger(__name__)`)
- Error responses follow FastAPI's `HTTPException` pattern with descriptive messages
