# AI Analysis Agent

A production-ready AI-powered data analysis chatbot that integrates with Azure SQL databases and Azure OpenAI to provide intelligent data analysis, visualization, and reporting capabilities.

## 🚀 Features

### Core Capabilities
- **Natural Language SQL Queries**: Convert natural language questions into SQL queries
- **Intelligent Data Analysis**: Automated data analysis using Pandas and LangChain agents
- **Dynamic Visualizations**: Auto-generated charts using Plotly (bar, line, scatter, pie, heatmap)
- **AI Report Generation**: Comprehensive reports with summaries and insights
- **Real-time Communication**: WebSocket support for streaming responses
- **Multi-Agent System**: Orchestrated SQL, Pandas, and visualization agents

### Technical Features
- **Azure Integration**: Native support for Azure SQL Database and Azure OpenAI (GPT-4)
- **LangChain Framework**: Advanced agent orchestration and tool calling
- **Production Ready**: Docker containerization, error handling, logging, and monitoring
- **Type Safety**: Full TypeScript support in frontend
- **Scalable Architecture**: Microservices-ready design with Redis caching

## 📋 Prerequisites

- Python 3.11+
- Node.js 18+
- Docker & Docker Compose
- Azure SQL Database instance
- Azure OpenAI API access
- Redis (included in Docker setup)

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone https://github.com/your-org/ai-analysis-agent.git
cd ai-analysis-agent
```

### 2. Environment Configuration

Create `.env` files in both backend and frontend directories:

**Backend `.env`:**
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

**Frontend `.env`:**
```env
REACT_APP_API_URL=http://localhost:8000/api/v1
REACT_APP_WS_URL=ws://localhost:8000/ws
```

### 3. Docker Deployment (Recommended)

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild and Rerun
docker-compose down && docker-compose up --build -d
```

### 4. Manual Installation

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

## 🏗️ Architecture

### System Architecture
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                 │     │                  │     │                 │
│  React Frontend ├────▶│  FastAPI Backend ├────▶│  Azure SQL DB   │
│   (TypeScript)  │     │    (Python)      │     │                 │
│                 │     │                  │     └─────────────────┘
└─────────────────┘     │                  │
                        │                  │     ┌─────────────────┐
                        │   LangChain      ├────▶│  Azure OpenAI   │
                        │   Agents         │     │    (GPT-4)      │
                        │                  │     └─────────────────┘
                        └──────┬───────────┘
                               │
                        ┌──────▼───────────┐
                        │                  │
                        │   Redis Cache    │
                        │                  │
                        └──────────────────┘
```

### Agent Architecture
```
User Query → Orchestrator → Intent Analysis
                ↓
         ┌─────────────────┐
         │ SQL Agent       │ → Database Queries
         │ Pandas Agent    │ → Data Analysis
         │ Visualization   │ → Chart Generation
         │ Report Tool     │ → Report Creation
         └─────────────────┘
                ↓
         Analysis Results → User
```

## 📚 API Documentation

### Chat Endpoints

#### Send Message
```http
POST /api/v1/chat/message
Content-Type: application/json

{
  "message": "Show me top 10 customers by revenue",
  "context": {}
}
```

#### WebSocket Connection
```javascript
ws://localhost:8000/api/v1/chat/ws
```

### Analysis Endpoints

#### Run Analysis
```http
POST /api/v1/analysis/run
Content-Type: application/json

{
  "query": "Analyze sales trends",
  "data": null,
  "analysis_type": "auto",
  "visualization_required": true
}
```

#### Get Database Schema
```http
GET /api/v1/analysis/schema
```

### Report Endpoints

#### Generate Report
```http
POST /api/v1/reports/generate
Content-Type: application/json

{
  "title": "Q4 Sales Report",
  "description": "Comprehensive sales analysis",
  "format": "pdf",
  "include_charts": true
}
```

## 🎯 Usage Examples

### 1. SQL Query Analysis
```
User: "What are the top 5 products by sales volume this month?"

System:
- Generates SQL query
- Executes against database
- Returns formatted results
- Creates bar chart visualization
```

### 2. Data Analysis
```
User: "Analyze customer churn patterns"

System:
- Loads customer data
- Performs statistical analysis
- Identifies patterns
- Generates insights report
```

### 3. Report Generation
```
User: "Create a monthly performance report"

System:
- Aggregates relevant data
- Performs analysis
- Creates visualizations
- Generates PDF report
```

## 🔧 Configuration

### Database Tables Access
The system automatically discovers available tables in your Azure SQL database. No manual configuration needed.

### Custom Agents
Add custom agents in `backend/app/agents/`:
```python
from app.agents.base_agent import BaseAgent

class CustomAgent(BaseAgent):
    async def process(self, query: str):
        # Your custom logic
        pass
```

### Visualization Types
Supported chart types:
- Bar charts
- Line charts
- Scatter plots
- Pie charts
- Heatmaps
- Tables

## 📊 Performance Optimization

### Caching Strategy
- Redis caching for frequent queries
- Connection pooling for database
- Response memoization

### Scaling
- Horizontal scaling with Docker Swarm/Kubernetes
- Load balancing with Nginx
- Database read replicas support

## 🔒 Security

### Authentication & Authorization
- JWT token-based authentication
- Role-based access control (RBAC)
- API key management

### Data Security
- SSL/TLS encryption
- Secure credential storage
- Input validation and sanitization
- SQL injection prevention

## 🧪 Testing

```bash
# Backend tests
cd backend
pytest tests/ --cov=app

# Frontend tests
cd frontend
npm test

# End-to-end tests
npm run test:e2e
```

## 📝 Development

### Code Style
- Backend: Black, Flake8, MyPy
- Frontend: ESLint, Prettier

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push origin feature/your-feature
```

## 🚨 Monitoring & Logging

### Logging
- Structured logging with context
- Log levels: DEBUG, INFO, WARNING, ERROR
- Centralized log aggregation ready

### Metrics
- Query performance tracking
- Agent execution times
- API response times
- Error rates

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check Azure SQL firewall rules
   - Verify connection string
   - Ensure ODBC drivers installed

2. **Azure OpenAI Timeout**
   - Check API quotas
   - Verify endpoint URL
   - Confirm deployment name

3. **WebSocket Connection Issues**
   - Check CORS settings
   - Verify WebSocket URL
   - Ensure proxy configuration

## 📦 Production Deployment

### Azure Deployment
```bash
# Build and push to Azure Container Registry
az acr build --registry myregistry --image ai-analysis-agent .

# Deploy to Azure Container Instances
az container create --resource-group mygroup \
  --name ai-analysis-agent \
  --image myregistry.azurecr.io/ai-analysis-agent:latest
```

### Kubernetes Deployment
```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n ai-analysis
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- LangChain for agent framework
- Microsoft Azure for cloud services
- Plotly for visualization
- FastAPI for backend framework
- React for frontend framework

## 📧 Support

For support and questions:
- Create an issue on GitHub
- Email: support@example.com
- Documentation: https://docs.example.com

---

Built with ❤️ for intelligent data analysis