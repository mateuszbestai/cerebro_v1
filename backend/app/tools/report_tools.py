from typing import Dict, Any, Optional, List
from datetime import datetime
import json
import logging

from app.services.azure_openai import AzureOpenAIService

logger = logging.getLogger(__name__)

class ReportGenerationTool:
    """Tool for generating comprehensive reports"""
    
    def __init__(self):
        self.llm_service = AzureOpenAIService()
    
    async def generate_report(
        self,
        title: str,
        data: Optional[Any] = None,
        analysis_results: Optional[Dict[str, Any]] = None,
        model_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate a comprehensive report"""
        
        try:
            report = {
                "title": title,
                "generated_date": datetime.now().isoformat(),
                "sections": []
            }
            
            # Generate executive summary
            if data or analysis_results:
                summary = await self._generate_executive_summary(
                    data,
                    analysis_results,
                    model_id=model_id
                )
                report["executive_summary"] = summary
            
            # Add data overview section
            if data:
                data_section = self._create_data_overview_section(data)
                report["sections"].append(data_section)
            
            # Add analysis section
            if analysis_results:
                analysis_section = self._create_analysis_section(analysis_results)
                report["sections"].append(analysis_section)
            
            # Generate insights
            insights = await self._generate_insights(
                data,
                analysis_results,
                model_id=model_id
            )
            if insights:
                report["sections"].append({
                    "title": "Key Insights",
                    "content": insights
                })
            
            # Generate recommendations
            recommendations = await self._generate_recommendations(
                data,
                analysis_results,
                model_id=model_id
            )
            if recommendations:
                report["sections"].append({
                    "title": "Recommendations",
                    "content": recommendations
                })
            
            return report
            
        except Exception as e:
            logger.error(f"Error generating report: {str(e)}")
            raise
    
    async def _generate_executive_summary(
        self,
        data: Any,
        analysis_results: Optional[Dict[str, Any]],
        model_id: Optional[str] = None
    ) -> str:
        """Generate executive summary using LLM"""
        
        prompt = f"""
        Generate an executive summary for a data analysis report based on the following:
        
        Data Overview: {self._summarize_data(data)}
        Analysis Results: {json.dumps(analysis_results, indent=2) if analysis_results else 'N/A'}
        
        The summary should be:
        1. Concise (max 200 words)
        2. Highlight key findings
        3. Professional tone
        4. Focus on business value
        """
        
        return await self.llm_service.generate_response(prompt, model_id=model_id)
    
    async def _generate_insights(
        self,
        data: Any,
        analysis_results: Optional[Dict[str, Any]],
        model_id: Optional[str] = None
    ) -> str:
        """Generate insights from data and analysis"""
        
        prompt = f"""
        Based on the following data and analysis, generate key insights:
        
        Data: {self._summarize_data(data)}
        Analysis: {json.dumps(analysis_results, indent=2) if analysis_results else 'N/A'}
        
        Format as bullet points. Focus on:
        1. Patterns and trends
        2. Anomalies or outliers
        3. Correlations
        4. Business implications
        """
        
        return await self.llm_service.generate_response(prompt, model_id=model_id)
    
    async def _generate_recommendations(
        self,
        data: Any,
        analysis_results: Optional[Dict[str, Any]],
        model_id: Optional[str] = None
    ) -> str:
        """Generate actionable recommendations"""
        
        prompt = f"""
        Based on the analysis, provide actionable recommendations:
        
        Data: {self._summarize_data(data)}
        Analysis: {json.dumps(analysis_results, indent=2) if analysis_results else 'N/A'}
        
        Provide 3-5 specific, actionable recommendations.
        Each should include:
        1. The recommendation
        2. Expected impact
        3. Implementation priority
        """
        
        return await self.llm_service.generate_response(prompt, model_id=model_id)
    
    def _create_data_overview_section(self, data: Any) -> Dict[str, Any]:
        """Create data overview section"""
        
        return {
            "title": "Data Overview",
            "content": self._summarize_data(data),
            "data": data if isinstance(data, (list, dict)) else None
        }
    
    def _create_analysis_section(self, analysis_results: Dict[str, Any]) -> Dict[str, Any]:
        """Create analysis results section"""
        
        content = f"""
        Analysis Type: {analysis_results.get('intent', {}).get('type', 'N/A')}
        
        Results:
        {analysis_results.get('response', 'No results available')}
        """
        
        if 'statistics' in analysis_results:
            content += f"\n\nStatistical Summary:\n{json.dumps(analysis_results['statistics'], indent=2)}"
        
        return {
            "title": "Analysis Results",
            "content": content,
            "chart": analysis_results.get('visualization')
        }
    
    def _summarize_data(self, data: Any) -> str:
        """Create a text summary of data"""
        
        if isinstance(data, list):
            return f"Dataset with {len(data)} records"
        elif isinstance(data, dict):
            return f"Data object with {len(data)} fields"
        else:
            return str(data)[:500]  # Truncate if too long
