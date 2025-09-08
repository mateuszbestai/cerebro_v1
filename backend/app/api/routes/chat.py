from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import json
import asyncio
import logging

from app.agents.orchestrator import AgentOrchestrator
from app.utils.logger import setup_logger

router = APIRouter()
logger = setup_logger(__name__)

# Request/Response models
class ChatMessage(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None

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
orchestrator = AgentOrchestrator()

@router.post("/message", response_model=ChatResponse)
async def send_message(chat_message: ChatMessage):
    '''Process a chat message and return response with analysis'''
    try:
        # Process the message through the orchestrator
        result = await orchestrator.process_query(
            chat_message.message,
            chat_message.context
        )
        
        return ChatResponse(
            response=result["response"],
            analysis={
                "data": result.get("data"),
                "visualization": result.get("visualization"),
                "report": result.get("report"),
                "intent": result.get("intent")
            }
        )
        
    except Exception as e:
        logger.error(f"Error processing message: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Process message
            result = await orchestrator.process_query(
                message_data["message"],
                message_data.get("context")
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