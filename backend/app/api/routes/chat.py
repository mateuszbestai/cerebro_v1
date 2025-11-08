from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import json
import asyncio
import logging

from app.utils.logger import setup_logger
from app.services.azure_openai import AzureOpenAIService

router = APIRouter()
logger = setup_logger(__name__)

# Request/Response models
class ChatMessage(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None
    model: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    analysis: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

# Lazy initialization of orchestrator
_orchestrator = None

def get_orchestrator():
    """Get or create the orchestrator instance"""
    global _orchestrator
    if _orchestrator is None:
        try:
            from app.agents.orchestrator import AgentOrchestrator
            _orchestrator = AgentOrchestrator()
            logger.info("Orchestrator initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize orchestrator: {str(e)}")
            # Return a dummy orchestrator that provides basic functionality
            _orchestrator = DummyOrchestrator()
    return _orchestrator

class DummyOrchestrator:
    """Fallback orchestrator when main orchestrator fails to initialize"""
    
    async def process_query(
        self, 
        query: str, 
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Process query with limited functionality"""
        logger.warning("Using dummy orchestrator - limited functionality available")
        return {
            "query": query,
            "intent": {"type": "general"},
            "response": "I'm currently running with limited functionality. Database and advanced analysis features may not be available. However, I can still help with general questions!",
            "data": None,
            "visualization": None,
            "report": None,
            "error": "Limited functionality mode"
        }

@router.post("/message", response_model=ChatResponse)
async def send_message(chat_message: ChatMessage):
    '''Process a chat message and return response with analysis'''
    try:
        # Get the orchestrator (will initialize on first use)
        orchestrator = get_orchestrator()
        
        # Process the message through the orchestrator
        context = dict(chat_message.context or {})
        if chat_message.model:
            context["model"] = chat_message.model
        
        result = await orchestrator.process_query(
            chat_message.message,
            context
        )
        
        # Build response
        response = ChatResponse(
            response=result.get("response", "No response generated"),
            analysis={
                "data": result.get("data"),
                "visualization": result.get("visualization"),
                "visualizations": result.get("visualizations"),
                "report": result.get("report"),
                "intent": result.get("intent"),
                "sql_query": result.get("sql_query"),
                "columns": result.get("columns"),
                "row_count": result.get("row_count")
            },
            model=result.get("model")
        )
        
        # Add error if present
        if result.get("error"):
            response.error = result["error"]
        
        return response
        
    except Exception as e:
        logger.error(f"Error processing message: {str(e)}")
        return ChatResponse(
            response="I encountered an error processing your message. Please try again.",
            error=str(e)
        )

@router.get("/health")
async def health_check():
    '''Check if chat service is healthy'''
    orchestrator = get_orchestrator()
    is_dummy = isinstance(orchestrator, DummyOrchestrator)
    
    return {
        "status": "degraded" if is_dummy else "healthy",
        "service": "chat",
        "limited_mode": is_dummy
    }

@router.get("/history")
async def get_chat_history(limit: int = 50):
    '''Get chat history'''
    # Implementation would fetch from database
    return {"messages": [], "total": 0}

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    '''WebSocket endpoint for real-time communication'''
    await manager.connect(websocket)
    
    try:
        orchestrator = get_orchestrator()
        
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Process message
            msg_context = dict(message_data.get("context") or {})
            if message_data.get("model"):
                msg_context["model"] = message_data["model"]
            
            result = await orchestrator.process_query(
                message_data["message"],
                msg_context
            )
            
            # Send response back
            await websocket.send_text(json.dumps({
                "type": "analysis_update",
                "analysis": result
            }))
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        manager.disconnect(websocket)
@router.get("/models")
async def get_available_models():
    """Expose configured Azure OpenAI deployments"""
    service = AzureOpenAIService()
    models = service.get_available_models()
    return {
        "models": models,
        "default_model": service.default_model_id
    }
