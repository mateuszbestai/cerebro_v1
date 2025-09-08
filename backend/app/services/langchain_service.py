from typing import Dict, Any, List, Optional
from langchain.agents import Tool, AgentExecutor, create_react_agent
from langchain.memory import ConversationBufferWindowMemory
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
from langchain.callbacks.manager import CallbackManager
from langchain.callbacks.streaming_stdout import StreamingStdOutCallbackHandler
import logging

from app.services.azure_openai import AzureOpenAIService
from app.tools.sql_tools import SQLQueryTool, SQLValidatorTool
from app.tools.visualization import VisualizationTool
from app.tools.summary_tools import SummaryTool

logger = logging.getLogger(__name__)

class LangChainService:
    """Service for managing LangChain components"""
    
    def __init__(self):
        self.llm_service = AzureOpenAIService()
        self.llm = self.llm_service.get_llm()
        self.tools = self._initialize_tools()
        self.memory = ConversationBufferWindowMemory(
            k=10,
            memory_key="chat_history",
            return_messages=True
        )
        self.callback_manager = CallbackManager([StreamingStdOutCallbackHandler()])
    
    def _initialize_tools(self) -> List[Tool]:
        """Initialize all available tools"""
        
        sql_query_tool = SQLQueryTool()
        sql_validator_tool = SQLValidatorTool()
        viz_tool = VisualizationTool()
        summary_tool = SummaryTool(self.llm)
        
        tools = [
            Tool(
                name="SQLQuery",
                func=sql_query_tool.run,
                description="Execute SQL queries against the database. Input should be a valid SQL query."
            ),
            Tool(
                name="ValidateSQL",
                func=sql_validator_tool.run,
                description="Validate SQL query syntax before execution."
            ),
            Tool(
                name="CreateVisualization",
                func=viz_tool.create_chart,
                description="Create data visualizations. Input should be data and chart type."
            ),
            Tool(
                name="Summarize",
                func=summary_tool.run,
                description="Generate summaries of data or analysis results."
            )
        ]
        
        return tools
    
    def create_agent_executor(self, agent_type: str = "react") -> AgentExecutor:
        """Create an agent executor with tools"""
        
        prompt = PromptTemplate(
            template="""You are an AI data analyst assistant with access to various tools.
            
            Available tools:
            {tools}
            
            Use the following format:
            Thought: Think about what to do
            Action: the action to take, should be one of [{tool_names}]
            Action Input: the input to the action
            Observation: the result of the action
            ... (this Thought/Action/Action Input/Observation can repeat N times)
            Thought: I now know the final answer
            Final Answer: the final answer to the original input question
            
            Previous conversation:
            {chat_history}
            
            Question: {input}
            {agent_scratchpad}
            """,
            input_variables=["input", "chat_history", "agent_scratchpad", "tools", "tool_names"]
        )
        
        agent = create_react_agent(
            llm=self.llm,
            tools=self.tools,
            prompt=prompt
        )
        
        return AgentExecutor(
            agent=agent,
            tools=self.tools,
            memory=self.memory,
            verbose=True,
            handle_parsing_errors=True,
            max_iterations=5
        )
    
    def create_chain(self, prompt_template: str) -> LLMChain:
        """Create a simple LLM chain"""
        
        prompt = PromptTemplate(
            template=prompt_template,
            input_variables=["input"]
        )
        
        return LLMChain(
            llm=self.llm,
            prompt=prompt,
            verbose=True
        )