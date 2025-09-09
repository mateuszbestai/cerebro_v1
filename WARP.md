# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

The **AI Analysis Agent** (cerebro) is a production-ready AI-powered data analysis chatbot that integrates with Azure SQL databases and Azure OpenAI to provide intelligent data analysis, visualization, and reporting capabilities. The system uses LangChain for agent orchestration and provides both REST API and WebSocket interfaces.

## Development Commands

### Docker Development (Recommended)
```bash
# Start all services (backend, frontend, Redis, Nginx)
docker-compose up -d

# View logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f backend
docker-compose logs -f frontend

# Rebuild and restart after code changes
docker-compose down && docker-compose up --build -d

# Stop all services
docker-compose down
```

### Backend Development
```bash
# Setup Python environment
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run tests
pytest tests/ --cov=app

# Code quality
black app/  # Format code
flake8 app/  # Lint code
mypy app/  # Type checking
```

### Frontend Development
```bash
# Setup Node.js environment
cd frontend
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint TypeScript/React code
npm run lint
```

### Testing
```bash
# Backend tests
cd backend
pytest tests/ --cov=app

# Frontend tests (if implemented)
cd frontend
npm test

# End-to-end tests (if implemented)
npm run test:e2e
```

## Architecture

### System Architecture
The application follows a microservices architecture with the following components:

**Backend (FastAPI/Python)**:
- **Main Application** (`app/main.py`): FastAPI app with CORS, lifecycle management, and route registration
- **API Routes** (`app/api/routes/`): RESTful endpoints for chat, database, analysis, and reports
- **Agent System** (`app/agents/`): Multi-agent orchestration using LangChain
- **Services** (`app/services/`): Azure OpenAI integration, chart generation, and report services
- **Tools** (`app/tools/`): SQL tools, visualization, and report generation utilities
- **Database Layer** (`app/database/`): Connection management, models, and query utilities

**Frontend (React/TypeScript)**:
- **Context API**: Chat and database context management
- **Custom Hooks**: WebSocket, API calls, and state management
- **Redux Store**: Global state for chat and analysis
- **Services**: API clients, WebSocket management, and chart rendering

**Infrastructure**:
- **Redis**: Caching and session storage
- **Nginx**: Reverse proxy and load balancing
- **Docker**: Containerized deployment

### Agent Architecture
The system uses a multi-agent approach orchestrated by `AgentOrchestrator`:

1. **Intent Analysis**: Determines query type (SQL, data analysis, report generation)
2. **SQL Agent**: Generates and executes SQL queries against Azure SQL databases
3. **Pandas Agent**: Performs data analysis using pandas and statistical methods
4. **Visualization Tool**: Creates charts using Plotly (bar, line, scatter, pie, heatmap)
5. **Report Generation Tool**: Creates PDF, HTML, and markdown reports

### Database Connection Management
Unlike traditional architectures, this system uses **frontend-controlled database connections**:
- Database connections are initiated from the frontend
- Backend stores active connections in memory (`active_connections` dict)
- Each connection has a unique ID for secure access
- Connections support multiple concurrent users

## Key Features

### Multi-Agent System
- **Orchestrator** (`app/agents/orchestrator.py`): Main coordinator that analyzes intent and routes to appropriate agents
- **SQL Agent** (`app/agents/sql_agent.py`): Converts natural language to SQL queries
- **Pandas Agent** (`app/agents/pandas_agent.py`): Performs statistical analysis on data
- **Base Agent** (`app/agents/base_agent.py`): Common interface for all agents

### Real-time Communication
- **WebSocket Support**: Real-time streaming responses in chat interface
- **Connection Manager**: Handles multiple concurrent WebSocket connections
- **Background Tasks**: Async report generation and analysis processing

### Azure Integration
- **Azure SQL Database**: Native support with ODBC drivers
- **Azure OpenAI**: GPT-4 integration for natural language processing
- **Azure Identity**: Secure authentication and key management

### Data Visualization
- **Plotly Integration**: Interactive charts and graphs
- **Automatic Chart Type Selection**: Based on data patterns and user intent
- **Export Capabilities**: Charts can be embedded in reports

## Configuration

### Environment Variables

**Backend** (`.env` in `backend/` directory):
```env
# Azure SQL Database
AZURE_SQL_SERVER=your-server.database.windows.net
AZURE_SQL_DATABASE=your-database
AZURE_SQL_USERNAME=your-username
AZURE_SQL_PASSWORD=your-password

# Azure OpenAI
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4

# Redis
REDIS_URL=redis://localhost:6379

# Security
SECRET_KEY=your-secret-key-here
LOG_LEVEL=INFO
```

**Frontend** (`.env` in `frontend/` directory):
```env
REACT_APP_API_URL=http://localhost:8000/api/v1
REACT_APP_WS_URL=ws://localhost:8000/ws
```

## API Endpoints

### Core Endpoints
- `GET /` - API information and features
- `GET /health` - Health check with service status
- `GET /api/v1/status` - Detailed API status

### Database Management
- `POST /api/v1/database/connect` - Establish database connection
- `GET /api/v1/database/drivers` - Get available ODBC drivers
- `POST /api/v1/database/test-connection` - Test connection without storing
- `GET /api/v1/database/connections` - List active connections
- `DELETE /api/v1/database/disconnect/{connection_id}` - Close connection

### Chat Interface
- `POST /api/v1/chat/message` - Send message and receive analysis
- `WS /api/v1/chat/ws` - WebSocket for real-time communication
- `GET /api/v1/chat/history` - Retrieve chat history

### Analysis & Reports
- `POST /api/v1/analysis/run` - Execute data analysis
- `GET /api/v1/analysis/results/{analysis_id}` - Get analysis results
- `POST /api/v1/reports/generate` - Generate comprehensive reports
- `GET /api/v1/reports/download/{report_id}` - Download generated report

## Development Workflow

### Adding New Features
1. **Backend Changes**: Add new routes in `app/api/routes/`, implement business logic in `app/services/`
2. **Agent Extensions**: Create new agents in `app/agents/` inheriting from `BaseAgent`
3. **Frontend Integration**: Add API calls in `src/services/`, update contexts and hooks
4. **Testing**: Add tests for new functionality

### Database Schema Changes
The system automatically discovers database schema, but for custom schema handling:
1. Update `app/database/queries.py` for new query patterns
2. Modify `app/agents/sql_agent.py` for enhanced SQL generation
3. Test with various database configurations

### Extending Analysis Capabilities
1. **New Analysis Types**: Add to `app/agents/pandas_agent.py`
2. **Visualization Types**: Extend `app/tools/visualization.py`
3. **Report Templates**: Update `app/tools/report_tools.py`

## Troubleshooting

### Common Issues
- **Database Connection Failures**: Check ODBC drivers with `GET /api/v1/database/drivers`
- **Azure OpenAI Timeout**: Verify API quotas and deployment configuration
- **WebSocket Issues**: Check CORS settings and proxy configuration
- **Memory Issues**: Monitor `active_connections` dictionary for connection leaks

### Debug Mode
Set `LOG_LEVEL=DEBUG` in backend environment to enable detailed logging for agent execution, database queries, and API interactions.

### Connection Management
The system uses in-memory connection storage. For production deployments, consider implementing Redis-based connection storage for scalability across multiple backend instances.
