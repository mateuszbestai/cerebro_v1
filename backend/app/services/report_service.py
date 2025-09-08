from typing import Dict, Any, Optional, List
from datetime import datetime
import json
from pathlib import Path
from jinja2 import Template
import pdfkit
from docx import Document
from docx.shared import Inches
import markdown2
import logging

from app.services.chart_service import ChartService

logger = logging.getLogger(__name__)

class ReportService:
    """Service for generating various report formats"""
    
    def __init__(self):
        self.chart_service = ChartService()
        self.reports_dir = Path("reports")
        self.reports_dir.mkdir(exist_ok=True)
    
    async def generate_pdf(
        self,
        report_id: str,
        content: Dict[str, Any],
        include_charts: bool = True
    ) -> str:
        """Generate PDF report"""
        
        try:
            # Create HTML first
            html_content = await self._create_html_content(content, include_charts)
            
            # Convert HTML to PDF
            output_path = self.reports_dir / f"{report_id}.pdf"
            
            options = {
                'page-size': 'A4',
                'margin-top': '0.75in',
                'margin-right': '0.75in',
                'margin-bottom': '0.75in',
                'margin-left': '0.75in',
                'encoding': "UTF-8",
                'no-outline': None
            }
            
            pdfkit.from_string(html_content, str(output_path), options=options)
            
            return str(output_path)
            
        except Exception as e:
            logger.error(f"Error generating PDF: {str(e)}")
            raise
    
    async def generate_html(
        self,
        report_id: str,
        content: Dict[str, Any],
        include_charts: bool = True
    ) -> str:
        """Generate HTML report"""
        
        html_content = await self._create_html_content(content, include_charts)
        output_path = self.reports_dir / f"{report_id}.html"
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        return str(output_path)
    
    async def generate_markdown(
        self,
        report_id: str,
        content: Dict[str, Any]
    ) -> str:
        """Generate Markdown report"""
        
        md_content = self._create_markdown_content(content)
        output_path = self.reports_dir / f"{report_id}.md"
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(md_content)
        
        return str(output_path)
    
    async def generate_docx(
        self,
        report_id: str,
        content: Dict[str, Any],
        include_charts: bool = True
    ) -> str:
        """Generate Word document report"""
        
        doc = Document()
        
        # Add title
        doc.add_heading(content.get('title', 'Analysis Report'), 0)
        
        # Add metadata
        doc.add_paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Add executive summary
        if 'executive_summary' in content:
            doc.add_heading('Executive Summary', level=1)
            doc.add_paragraph(content['executive_summary'])
        
        # Add sections
        for section in content.get('sections', []):
            doc.add_heading(section['title'], level=1)
            doc.add_paragraph(section['content'])
            
            # Add charts if available
            if include_charts and 'chart' in section:
                # Export chart as image and add to document
                chart_bytes = await self.chart_service.export_chart(
                    section['chart'],
                    format='png'
                )
                doc.add_picture(BytesIO(chart_bytes), width=Inches(6))
        
        output_path = self.reports_dir / f"{report_id}.docx"
        doc.save(output_path)
        
        return str(output_path)
    
    async def _create_html_content(
        self,
        content: Dict[str, Any],
        include_charts: bool
    ) -> str:
        """Create HTML content for report"""
        
        template = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>{{ title }}</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; }
                h1 { color: #0078D4; border-bottom: 2px solid #0078D4; padding-bottom: 10px; }
                h2 { color: #333; margin-top: 30px; }
                .metadata { color: #666; font-size: 0.9em; }
                .summary { background: #f5f5f5; padding: 20px; border-left: 4px solid #0078D4; margin: 20px 0; }
                .section { margin: 30px 0; }
                table { border-collapse: collapse; width: 100%; margin: 20px 0; }
                th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                th { background: #0078D4; color: white; }
                .chart { margin: 20px 0; text-align: center; }
            </style>
        </head>
        <body>
            <h1>{{ title }}</h1>
            <p class="metadata">Generated: {{ generated_date }}</p>
            
            {% if executive_summary %}
            <div class="summary">
                <h2>Executive Summary</h2>
                <p>{{ executive_summary }}</p>
            </div>
            {% endif %}
            
            {% for section in sections %}
            <div class="section">
                <h2>{{ section.title }}</h2>
                <p>{{ section.content }}</p>
                
                {% if section.data %}
                <table>
                    <thead>
                        <tr>
                            {% for col in section.data[0].keys() %}
                            <th>{{ col }}</th>
                            {% endfor %}
                        </tr>
                    </thead>
                    <tbody>
                        {% for row in section.data %}
                        <tr>
                            {% for value in row.values() %}
                            <td>{{ value }}</td>
                            {% endfor %}
                        </tr>
                        {% endfor %}
                    </tbody>
                </table>
                {% endif %}
                
                {% if include_charts and section.chart %}
                <div class="chart">
                    <!-- Chart placeholder -->
                </div>
                {% endif %}
            </div>
            {% endfor %}
        </body>
        </html>
        """
        
        tmpl = Template(template)
        
        return tmpl.render(
            title=content.get('title', 'Report'),
            generated_date=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            executive_summary=content.get('executive_summary', ''),
            sections=content.get('sections', []),
            include_charts=include_charts
        )
    
    def _create_markdown_content(self, content: Dict[str, Any]) -> str:
        """Create Markdown content for report"""
        
        md_lines = []
        
        # Title
        md_lines.append(f"# {content.get('title', 'Report')}")
        md_lines.append(f"\n*Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*\n")
        
        # Executive Summary
        if 'executive_summary' in content:
            md_lines.append("## Executive Summary\n")
            md_lines.append(content['executive_summary'])
            md_lines.append("\n")
        
        # Sections
        for section in content.get('sections', []):
            md_lines.append(f"## {section['title']}\n")
            md_lines.append(section['content'])
            md_lines.append("\n")
            
            # Add data table if present
            if 'data' in section and section['data']:
                # Create markdown table
                headers = list(section['data'][0].keys())
                md_lines.append("| " + " | ".join(headers) + " |")
                md_lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
                
                for row in section['data']:
                    md_lines.append("| " + " | ".join(str(v) for v in row.values()) + " |")
                
                md_lines.append("\n")
        
        return "\n".join(md_lines)