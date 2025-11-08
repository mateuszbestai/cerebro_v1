from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import logging
import uuid

from app.agents.sql_agent import SQLAgent
from app.agents.pandas_agent import PandasAgent
from app.services.azure_openai import AzureOpenAIService
from app.tools.visualization import VisualizationTool
from app.database.connection import DatabaseManager
from app.api.routes.chat import get_orchestrator

router = APIRouter()
logger = logging.getLogger(__name__)

class AnalysisRequest(BaseModel):
    query: str
    data: Optional[Any] = None
    analysis_type: Optional[str] = "auto"
    visualization_required: bool = False
    connection_id: Optional[str] = None
    database_context: Optional[str] = None
    selected_tables: Optional[List[str]] = None
    context: Optional[Dict[str, Any]] = None
    model: Optional[str] = None

class AnalysisResponse(BaseModel):
    analysis_id: str
    status: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

# Initialize services
llm_service = AzureOpenAIService()
sql_agent = SQLAgent(llm_service.get_llm(require_chat=True))
pandas_agent = PandasAgent(llm_service.get_llm(require_chat=True))
viz_tool = VisualizationTool()

# Store for async analysis results
analysis_store = {}

def _should_use_frontend_connection(request: AnalysisRequest) -> bool:
    """Determine if we should reuse the active frontend-managed DB connection"""
    if request.connection_id:
        return True
    if request.context and request.context.get("database_connection_id"):
        return True
    return False

async def _run_frontend_connected_analysis(request: AnalysisRequest) -> Dict[str, Any]:
    """Run analysis through the AgentOrchestrator using frontend-provided context."""
    orchestrator = get_orchestrator()
    effective_context: Dict[str, Any] = dict(request.context or {})
    
    if request.connection_id:
        effective_context["database_connection_id"] = request.connection_id
    if request.database_context:
        effective_context["database_context"] = request.database_context
    if request.selected_tables:
        effective_context["selected_tables"] = request.selected_tables
    if request.data is not None:
        effective_context["data"] = request.data
    if request.analysis_type:
        effective_context["analysis_type"] = request.analysis_type
    if request.visualization_required:
        effective_context["visualization_required"] = request.visualization_required
    if request.model:
        effective_context["model"] = request.model
    
    return await orchestrator.process_query(request.query, effective_context)

async def _run_legacy_analysis(request: AnalysisRequest) -> Dict[str, Any]:
    """Fallback analysis path that relies on environment-configured services."""
    result: Dict[str, Any] = {}
    llm = llm_service.get_llm(request.model, require_chat=True)
    local_sql_agent = SQLAgent(llm)
    local_pandas_agent = PandasAgent(llm)
    
    if request.analysis_type == "sql" or "SELECT" in request.query.upper():
        sql_result = await local_sql_agent.execute_query(request.query)
        result["data"] = sql_result.get("data")
        result["query"] = sql_result.get("query")
        result["explanation"] = sql_result.get("explanation")
        
        if request.visualization_required and sql_result.get("data"):
            viz = await viz_tool.create_chart(sql_result["data"])
            result["visualization"] = viz
    
    elif request.analysis_type == "pandas" or request.data is not None:
        pandas_result = await local_pandas_agent.analyze_data(
            request.query,
            request.data
        )
        result["data"] = pandas_result.get("data")
        result["analysis"] = pandas_result.get("analysis")
        result["statistics"] = pandas_result.get("statistics")

        if request.visualization_required:
            try:
                dataset_for_chart = (
                    request.data if request.data is not None else pandas_result.get("data")
                )
                if dataset_for_chart:
                    viz = await viz_tool.create_chart(dataset_for_chart)
                    result["visualization"] = viz
            except Exception as viz_err:
                logger.error(f"Visualization error (pandas flow): {str(viz_err)}")
    
    else:
        response = await llm_service.generate_response(
            request.query,
            model_id=request.model
        )
        result["analysis"] = response
    
    return result

@router.post("/run", response_model=AnalysisResponse)
async def run_analysis(
    request: AnalysisRequest,
    background_tasks: BackgroundTasks
):
    '''Run data analysis'''
    analysis_id = str(uuid.uuid4())
    
    # Store initial status
    analysis_store[analysis_id] = {
        "status": "processing",
        "result": None,
        "error": None
    }
    
    # Run analysis in background
    background_tasks.add_task(
        perform_analysis,
        analysis_id,
        request
    )
    
    return AnalysisResponse(
        analysis_id=analysis_id,
        status="processing"
    )

async def perform_analysis(analysis_id: str, request: AnalysisRequest):
    '''Perform the actual analysis'''
    try:
        if _should_use_frontend_connection(request):
            result = await _run_frontend_connected_analysis(request)
        else:
            result = await _run_legacy_analysis(request)
        
        # Update store
        analysis_store[analysis_id] = {
            "status": "completed",
            "result": result,
            "error": None
        }
        
    except Exception as e:
        logger.error(f"Analysis error: {str(e)}")
        analysis_store[analysis_id] = {
            "status": "failed",
            "result": None,
            "error": str(e)
        }

@router.get("/results/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis_results(analysis_id: str):
    '''Get analysis results by ID'''
    if analysis_id not in analysis_store:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    analysis = analysis_store[analysis_id]
    return AnalysisResponse(
        analysis_id=analysis_id,
        status=analysis["status"],
        result=analysis["result"],
        error=analysis["error"]
    )

@router.get("/schema")
async def get_database_schema():
    '''Get database schema information'''
    try:
        schema_info = await sql_agent.get_table_info()
        return schema_info
    except Exception as e:
        logger.error(f"Error getting schema: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tables")
async def get_tables():
    '''Get list of available tables'''
    try:
        tables = await DatabaseManager.get_tables()
        return {"tables": tables}
    except Exception as e:
        logger.error(f"Error getting tables: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
