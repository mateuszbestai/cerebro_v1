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

router = APIRouter()
logger = logging.getLogger(__name__)

class AnalysisRequest(BaseModel):
    query: str
    data: Optional[Any] = None
    analysis_type: Optional[str] = "auto"
    visualization_required: bool = False

class AnalysisResponse(BaseModel):
    analysis_id: str
    status: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

# Initialize services
llm_service = AzureOpenAIService()
sql_agent = SQLAgent(llm_service.get_llm())
pandas_agent = PandasAgent(llm_service.get_llm())
viz_tool = VisualizationTool()

# Store for async analysis results
analysis_store = {}

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
        result = {}
        
        # Determine analysis type
        if request.analysis_type == "sql" or "SELECT" in request.query.upper():
            # SQL analysis
            sql_result = await sql_agent.execute_query(request.query)
            result["data"] = sql_result["data"]
            result["query"] = sql_result["query"]
            result["explanation"] = sql_result["explanation"]
            
            # Generate visualization if requested
            if request.visualization_required and sql_result["data"]:
                viz = await viz_tool.create_chart(sql_result["data"])
                result["visualization"] = viz
        
        elif request.analysis_type == "pandas" or request.data is not None:
            # Pandas analysis
            pandas_result = await pandas_agent.analyze_data(
                request.query,
                request.data
            )
            result["data"] = pandas_result["data"]
            result["analysis"] = pandas_result["analysis"]
            result["statistics"] = pandas_result.get("statistics")

            # Generate visualization if requested (mirror SQL behavior)
            if request.visualization_required:
                try:
                    # Prefer the input dataset if provided; fall back to pandas output if chartable
                    dataset_for_chart = request.data if request.data is not None else pandas_result.get("data")
                    if dataset_for_chart:
                        viz = await viz_tool.create_chart(dataset_for_chart)
                        result["visualization"] = viz
                except Exception as viz_err:
                    logger.error(f"Visualization error (pandas flow): {str(viz_err)}")
        
        else:
            # General analysis using LLM
            response = await llm_service.generate_response(request.query)
            result["analysis"] = response
        
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