from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
import logging
import uuid
import json

from app.tools.report_tools import ReportGenerationTool
from app.services.report_service import ReportService
from app.services.azure_openai import AzureOpenAIService

router = APIRouter()
logger = logging.getLogger(__name__)

class ReportRequest(BaseModel):
    title: str
    description: Optional[str] = None
    data: Optional[Any] = None
    analysis_results: Optional[Dict[str, Any]] = None
    format: str = "pdf"  # pdf, html, markdown
    include_charts: bool = True
    model: Optional[str] = None

class ReportResponse(BaseModel):
    report_id: str
    title: str
    status: str
    created_at: datetime
    url: Optional[str] = None
    error: Optional[str] = None

# Initialize services
report_tool = ReportGenerationTool()
report_service = ReportService()
llm_service = AzureOpenAIService()

# Store for async report generation
report_store = {}

@router.post("/generate", response_model=ReportResponse)
async def generate_report(
    request: ReportRequest,
    background_tasks: BackgroundTasks
):
    '''Generate a comprehensive report'''
    report_id = str(uuid.uuid4())
    
    # Store initial status
    report_store[report_id] = {
        "title": request.title,
        "status": "generating",
        "created_at": datetime.utcnow(),
        "url": None,
        "error": None
    }
    
    # Generate report in background
    background_tasks.add_task(
        create_report,
        report_id,
        request
    )
    
    return ReportResponse(
        report_id=report_id,
        title=request.title,
        status="generating",
        created_at=report_store[report_id]["created_at"]
    )

async def create_report(report_id: str, request: ReportRequest):
    '''Create the actual report'''
    try:
        # Generate report content
        report_content = await report_tool.generate_report(
            request.description or request.title,
            request.data,
            request.analysis_results,
            model_id=request.model
        )
        
        # Add executive summary using LLM
        if request.data or request.analysis_results:
            summary = await llm_service.generate_summary(
                {
                    "data": request.data,
                    "analysis": request.analysis_results
                },
                model_id=request.model
            )
            report_content["executive_summary"] = summary
        
        # Generate file based on format
        if request.format == "pdf":
            file_path = await report_service.generate_pdf(
                report_id,
                report_content,
                include_charts=request.include_charts
            )
        elif request.format == "html":
            file_path = await report_service.generate_html(
                report_id,
                report_content,
                include_charts=request.include_charts
            )
        else:  # markdown
            file_path = await report_service.generate_markdown(
                report_id,
                report_content
            )
        
        # Update store
        report_store[report_id]["status"] = "completed"
        report_store[report_id]["url"] = f"/api/v1/reports/download/{report_id}"
        report_store[report_id]["file_path"] = file_path
        
    except Exception as e:
        logger.error(f"Report generation error: {str(e)}")
        report_store[report_id]["status"] = "failed"
        report_store[report_id]["error"] = str(e)

@router.get("/", response_model=List[ReportResponse])
async def get_reports(limit: int = 10):
    '''Get list of generated reports'''
    reports = []
    for report_id, report in list(report_store.items())[-limit:]:
        reports.append(ReportResponse(
            report_id=report_id,
            title=report["title"],
            status=report["status"],
            created_at=report["created_at"],
            url=report.get("url"),
            error=report.get("error")
        ))
    return reports

@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(report_id: str):
    '''Get report by ID'''
    if report_id not in report_store:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report = report_store[report_id]
    return ReportResponse(
        report_id=report_id,
        title=report["title"],
        status=report["status"],
        created_at=report["created_at"],
        url=report.get("url"),
        error=report.get("error")
    )

@router.get("/download/{report_id}")
async def download_report(report_id: str):
    '''Download report file'''
    if report_id not in report_store:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report = report_store[report_id]
    if "file_path" not in report:
        raise HTTPException(status_code=404, detail="Report file not found")
    
    return FileResponse(
        report["file_path"],
        filename=f"{report['title']}-{report_id}.pdf"
    )

@router.delete("/{report_id}")
async def delete_report(report_id: str):
    '''Delete report metadata and file if exists'''
    if report_id not in report_store:
        raise HTTPException(status_code=404, detail="Report not found")
    report = report_store.pop(report_id)
    try:
        import os
        file_path = report.get("file_path")
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
    except Exception:
        pass
    return {"status": "deleted", "report_id": report_id}
