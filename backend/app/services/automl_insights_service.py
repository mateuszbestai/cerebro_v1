"""
AutoML Insights Service

Uses Azure OpenAI to generate business-friendly interpretations
of AutoML results for non-technical users.

Supports GPT-5 enhanced interpretation with:
- Key findings with evidence and business implications
- Prioritized recommended actions
- Model assessment (strengths, limitations, confidence)
- Problem-specific insights (classification, regression, forecasting, clustering, anomaly)
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.services.azure_openai import AzureOpenAIService

logger = logging.getLogger(__name__)


@dataclass
class KeyInsight:
    """A single key insight from the model."""
    feature: str
    insight: str
    business_action: str


@dataclass
class KeyFinding:
    """A key finding with evidence and business implication."""
    finding: str
    evidence: str
    business_implication: str


@dataclass
class RecommendedAction:
    """A recommended action with priority and expected impact."""
    action: str
    priority: str  # high, medium, low
    expected_impact: str


@dataclass
class ModelAssessment:
    """Assessment of model strengths and limitations."""
    strengths: List[str]
    limitations: List[str]
    confidence_level: str  # high, medium, low


@dataclass
class AutoMLInsights:
    """Complete insights for an AutoML job."""
    executive_summary: str
    accuracy_explanation: str
    key_insights: List[KeyInsight]
    recommendation: str
    caveats: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "executive_summary": self.executive_summary,
            "accuracy_explanation": self.accuracy_explanation,
            "key_insights": [
                {
                    "feature": i.feature,
                    "insight": i.insight,
                    "business_action": i.business_action,
                }
                for i in self.key_insights
            ],
            "recommendation": self.recommendation,
            "caveats": self.caveats,
        }


@dataclass
class GPT5Interpretation:
    """Enhanced GPT-5 interpretation of AutoML results."""
    executive_summary: str
    key_findings: List[KeyFinding]
    recommended_actions: List[RecommendedAction]
    model_assessment: ModelAssessment
    next_steps: List[str]
    caveats: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "executive_summary": self.executive_summary,
            "key_findings": [
                {
                    "finding": f.finding,
                    "evidence": f.evidence,
                    "business_implication": f.business_implication,
                }
                for f in self.key_findings
            ],
            "recommended_actions": [
                {
                    "action": a.action,
                    "priority": a.priority,
                    "expected_impact": a.expected_impact,
                }
                for a in self.recommended_actions
            ],
            "model_assessment": {
                "strengths": self.model_assessment.strengths,
                "limitations": self.model_assessment.limitations,
                "confidence_level": self.model_assessment.confidence_level,
            },
            "next_steps": self.next_steps,
            "caveats": self.caveats,
        }


class AutoMLInsightsService:
    """
    Generate business-friendly insights from AutoML results.

    Uses Azure OpenAI to translate technical metrics and feature
    importance into actionable business recommendations.
    """

    def __init__(self, llm: Optional[AzureOpenAIService] = None):
        self._llm = llm or AzureOpenAIService()

    async def generate_insights(
        self,
        job_id: str,
        task: str,
        target_column: str,
        best_model: str,
        best_score: float,
        eval_metric: str,
        feature_importance: Dict[str, float],
        leaderboard: List[Dict[str, Any]],
        num_rows: int,
        num_features: int,
        training_time: int,
        business_context: Optional[str] = None,
    ) -> AutoMLInsights:
        """
        Generate comprehensive business-friendly insights.

        Args:
            job_id: The AutoML job ID
            task: Task type (classification/regression)
            target_column: Name of the target column
            best_model: Name of the best model
            best_score: Best model's score
            eval_metric: Evaluation metric used
            feature_importance: Feature importance scores
            leaderboard: Model leaderboard
            num_rows: Number of training rows
            num_features: Number of features
            training_time: Training time in seconds
            business_context: Optional business context from GDM

        Returns:
            AutoMLInsights object with interpretations
        """
        # Sort features by importance
        sorted_features = sorted(
            feature_importance.items(),
            key=lambda x: x[1],
            reverse=True,
        )[:10]

        # Format feature importance for prompt
        feature_text = "\n".join(
            f"  - {feat}: {score:.3f}" for feat, score in sorted_features
        )

        # Format leaderboard
        leaderboard_text = "\n".join(
            f"  - {entry.get('model', 'Unknown')}: {entry.get('score_val', 0):.4f}"
            for entry in leaderboard[:5]
        )

        prompt = f"""You are a data science advisor explaining AutoML results to a business user who is NOT technical.
Use simple language. Avoid jargon. Focus on practical business impact.

## AutoML Results Summary

**Task:** {task}
**Predicting:** {target_column}
**Best Model:** {best_model}
**Performance Score ({eval_metric}):** {best_score:.4f}
**Data:** {num_rows:,} rows, {num_features} features
**Training Time:** {training_time // 60} minutes

### Top Features (what matters most for predictions):
{feature_text}

### Model Comparison:
{leaderboard_text}

{f"### Business Context:{chr(10)}{business_context}" if business_context else ""}

---

Please provide a JSON response with EXACTLY this structure:
{{
  "executive_summary": "2-3 sentence summary for an executive. What can this model do? How well does it work?",
  "accuracy_explanation": "Explain what the score of {best_score:.4f} means in practical terms. Use analogies if helpful. What does {eval_metric} mean for their use case?",
  "key_insights": [
    {{
      "feature": "name of the most important feature",
      "insight": "What this feature tells us and why it matters",
      "business_action": "Specific action the business can take based on this"
    }},
    {{
      "feature": "second most important feature",
      "insight": "What this feature tells us",
      "business_action": "Recommended action"
    }},
    {{
      "feature": "third most important feature",
      "insight": "What this feature tells us",
      "business_action": "Recommended action"
    }}
  ],
  "recommendation": "One clear recommendation for what to do next with this model",
  "caveats": ["Important limitation 1", "Important limitation 2"]
}}

Return ONLY the JSON object, no other text."""

        try:
            response = await self._llm.generate_response(
                prompt,
                response_format="json",
                model_id="gpt-4.1",
            )

            if isinstance(response, str):
                data = json.loads(response)
            else:
                data = response

            return AutoMLInsights(
                executive_summary=data.get("executive_summary", "Model training completed successfully."),
                accuracy_explanation=data.get("accuracy_explanation", f"The model achieved a {eval_metric} score of {best_score:.4f}."),
                key_insights=[
                    KeyInsight(
                        feature=insight.get("feature", "Unknown"),
                        insight=insight.get("insight", ""),
                        business_action=insight.get("business_action", ""),
                    )
                    for insight in data.get("key_insights", [])[:5]
                ],
                recommendation=data.get("recommendation", "Deploy this model for predictions on new data."),
                caveats=data.get("caveats", ["Results may vary on new data."]),
            )

        except Exception as exc:
            logger.warning("LLM insight generation failed: %s", exc)
            return self._fallback_insights(
                task=task,
                target_column=target_column,
                best_model=best_model,
                best_score=best_score,
                eval_metric=eval_metric,
                sorted_features=sorted_features,
            )

    def _fallback_insights(
        self,
        task: str,
        target_column: str,
        best_model: str,
        best_score: float,
        eval_metric: str,
        sorted_features: List[tuple],
    ) -> AutoMLInsights:
        """Generate basic insights when LLM is unavailable."""
        # Interpret score based on task and metric
        if task == "classification":
            if "auc" in eval_metric.lower() or "accuracy" in eval_metric.lower():
                if best_score >= 0.9:
                    quality = "excellent"
                    explanation = "The model correctly identifies the outcome over 90% of the time."
                elif best_score >= 0.8:
                    quality = "good"
                    explanation = "The model correctly identifies the outcome about 80-90% of the time."
                elif best_score >= 0.7:
                    quality = "moderate"
                    explanation = "The model correctly identifies the outcome about 70-80% of the time."
                else:
                    quality = "needs improvement"
                    explanation = "The model's predictions are less reliable. Consider gathering more data."
            else:
                quality = "completed"
                explanation = f"The model achieved a {eval_metric} score of {best_score:.4f}."
        else:  # regression
            if "r2" in eval_metric.lower():
                if best_score >= 0.8:
                    quality = "excellent"
                    explanation = f"The model explains {best_score*100:.0f}% of the variation in {target_column}."
                elif best_score >= 0.6:
                    quality = "good"
                    explanation = f"The model explains {best_score*100:.0f}% of the variation in {target_column}."
                else:
                    quality = "moderate"
                    explanation = f"The model explains {best_score*100:.0f}% of the variation. More data may help."
            else:
                quality = "completed"
                explanation = f"The model achieved a {eval_metric} of {best_score:.4f}."

        # Generate insights for top features
        key_insights = []
        for i, (feat, score) in enumerate(sorted_features[:3]):
            key_insights.append(
                KeyInsight(
                    feature=feat,
                    insight=f"This is the #{i+1} most important factor for predicting {target_column}.",
                    business_action=f"Monitor and track changes in {feat} for better predictions.",
                )
            )

        return AutoMLInsights(
            executive_summary=f"Your {task} model for predicting {target_column} has {quality} performance. "
                             f"The best algorithm was {best_model}.",
            accuracy_explanation=explanation,
            key_insights=key_insights,
            recommendation="Use this model to make predictions on new data. "
                          "Monitor performance and retrain periodically with fresh data.",
            caveats=[
                "Model performance may vary on new data not seen during training.",
                "Ensure new prediction data has the same format as training data.",
            ],
        )

    async def generate_gpt5_interpretation(
        self,
        job_id: str,
        task: str,
        target_column: str,
        best_model: str,
        best_score: float,
        eval_metric: str,
        feature_importance: Dict[str, float],
        leaderboard: List[Dict[str, Any]],
        num_rows: int,
        num_features: int,
        training_time: int,
        confusion_matrix: Optional[List[List[int]]] = None,
        class_labels: Optional[List[str]] = None,
        threshold_analysis: Optional[Dict[str, Any]] = None,
        gains_summary: Optional[Dict[str, Any]] = None,
        business_context: Optional[str] = None,
        problem_specific_data: Optional[Dict[str, Any]] = None,
    ) -> GPT5Interpretation:
        """
        Generate enhanced GPT-5 interpretation of AutoML results.

        This method provides deeper insights with:
        - Key findings with evidence and business implications
        - Prioritized recommended actions
        - Model assessment (strengths, limitations, confidence)
        - Problem-specific insights

        Args:
            job_id: The AutoML job ID
            task: Task type (classification/regression/forecasting/clustering/anomaly)
            target_column: Name of the target column
            best_model: Name of the best model
            best_score: Best model's score
            eval_metric: Evaluation metric used
            feature_importance: Feature importance scores
            leaderboard: Model leaderboard
            num_rows: Number of training rows
            num_features: Number of features
            training_time: Training time in seconds
            confusion_matrix: Confusion matrix for classification
            class_labels: Class labels for classification
            threshold_analysis: Threshold optimization results
            gains_summary: Gains/lift analysis results
            business_context: Optional business context
            problem_specific_data: Additional data for forecasting/clustering/anomaly

        Returns:
            GPT5Interpretation object with enhanced insights
        """
        # Sort features by importance
        sorted_features = sorted(
            feature_importance.items(),
            key=lambda x: x[1],
            reverse=True,
        )[:10]

        # Format feature importance for prompt
        feature_text = "\n".join(
            f"  - {feat}: {score:.3f}" for feat, score in sorted_features
        )

        # Format leaderboard
        leaderboard_text = "\n".join(
            f"  - {entry.get('model', 'Unknown')}: {entry.get('score_val', 0):.4f}"
            for entry in leaderboard[:5]
        )

        # Build problem-specific context
        problem_context = self._build_problem_context(
            task=task,
            confusion_matrix=confusion_matrix,
            class_labels=class_labels,
            threshold_analysis=threshold_analysis,
            gains_summary=gains_summary,
            problem_specific_data=problem_specific_data,
        )

        prompt = f"""You are a senior data science advisor using GPT-5 to provide comprehensive, business-focused interpretation of AutoML results.

Your audience is business decision-makers who need actionable insights, not technical details.

## AutoML Results Summary

**Task:** {task}
**Predicting:** {target_column}
**Best Model:** {best_model}
**Performance Score ({eval_metric}):** {best_score:.4f}
**Data:** {num_rows:,} rows, {num_features} features
**Training Time:** {training_time // 60} minutes

### Top Predictive Features:
{feature_text}

### Model Comparison:
{leaderboard_text}

{problem_context}

{f"### Business Context:{chr(10)}{business_context}" if business_context else ""}

---

Provide a comprehensive JSON response with EXACTLY this structure:
{{
  "executive_summary": "3-4 sentence summary for executives. What can this model do? How reliable is it? What's the business value?",
  "key_findings": [
    {{
      "finding": "The most important discovery from this analysis",
      "evidence": "Specific data or metrics that support this finding",
      "business_implication": "What this means for the business and potential ROI"
    }},
    {{
      "finding": "Second key finding",
      "evidence": "Supporting evidence",
      "business_implication": "Business impact"
    }},
    {{
      "finding": "Third key finding",
      "evidence": "Supporting evidence",
      "business_implication": "Business impact"
    }}
  ],
  "recommended_actions": [
    {{
      "action": "Specific, actionable recommendation",
      "priority": "high",
      "expected_impact": "Quantified or described expected outcome"
    }},
    {{
      "action": "Second recommendation",
      "priority": "medium",
      "expected_impact": "Expected outcome"
    }},
    {{
      "action": "Third recommendation",
      "priority": "low",
      "expected_impact": "Expected outcome"
    }}
  ],
  "model_assessment": {{
    "strengths": ["Strength 1 of the model", "Strength 2"],
    "limitations": ["Limitation 1 to be aware of", "Limitation 2"],
    "confidence_level": "high/medium/low based on data quality and model performance"
  }},
  "next_steps": [
    "Immediate next step 1",
    "Step 2 for deployment",
    "Step 3 for monitoring"
  ],
  "caveats": [
    "Important caveat about model usage",
    "Data or scope limitation to be aware of"
  ]
}}

Return ONLY the JSON object, no other text."""

        try:
            response = await self._llm.generate_response(
                prompt,
                response_format="json",
                model_id="gpt-5",  # Use GPT-5 for enhanced interpretation
            )

            if isinstance(response, str):
                data = json.loads(response)
            else:
                data = response

            return GPT5Interpretation(
                executive_summary=data.get(
                    "executive_summary",
                    f"A {task} model was trained to predict {target_column} with {eval_metric} of {best_score:.4f}."
                ),
                key_findings=[
                    KeyFinding(
                        finding=f.get("finding", ""),
                        evidence=f.get("evidence", ""),
                        business_implication=f.get("business_implication", ""),
                    )
                    for f in data.get("key_findings", [])[:5]
                ],
                recommended_actions=[
                    RecommendedAction(
                        action=a.get("action", ""),
                        priority=a.get("priority", "medium"),
                        expected_impact=a.get("expected_impact", ""),
                    )
                    for a in data.get("recommended_actions", [])[:5]
                ],
                model_assessment=ModelAssessment(
                    strengths=data.get("model_assessment", {}).get("strengths", []),
                    limitations=data.get("model_assessment", {}).get("limitations", []),
                    confidence_level=data.get("model_assessment", {}).get("confidence_level", "medium"),
                ),
                next_steps=data.get("next_steps", ["Deploy model", "Monitor performance"]),
                caveats=data.get("caveats", ["Results may vary on new data."]),
            )

        except Exception as exc:
            logger.warning("GPT-5 interpretation generation failed: %s", exc)
            return self._fallback_gpt5_interpretation(
                task=task,
                target_column=target_column,
                best_model=best_model,
                best_score=best_score,
                eval_metric=eval_metric,
                sorted_features=sorted_features,
                num_rows=num_rows,
            )

    def _build_problem_context(
        self,
        task: str,
        confusion_matrix: Optional[List[List[int]]] = None,
        class_labels: Optional[List[str]] = None,
        threshold_analysis: Optional[Dict[str, Any]] = None,
        gains_summary: Optional[Dict[str, Any]] = None,
        problem_specific_data: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Build problem-specific context for the prompt."""
        sections = []

        if task == "classification":
            if confusion_matrix and class_labels:
                sections.append("### Confusion Matrix:")
                sections.append(f"Classes: {', '.join(class_labels)}")
                for i, row in enumerate(confusion_matrix):
                    label = class_labels[i] if i < len(class_labels) else f"Class {i}"
                    sections.append(f"  {label}: {row}")

            if threshold_analysis:
                sections.append("\n### Threshold Optimization:")
                sections.append(f"  - Optimal threshold: {threshold_analysis.get('optimal_threshold', 0.5):.2f}")
                sections.append(f"  - Precision at threshold: {threshold_analysis.get('precision_at_threshold', 0):.2%}")
                sections.append(f"  - Recall at threshold: {threshold_analysis.get('recall_at_threshold', 0):.2%}")
                sections.append(f"  - F1 at threshold: {threshold_analysis.get('f1_at_threshold', 0):.2%}")

            if gains_summary:
                sections.append("\n### Gains Analysis:")
                sections.append(f"  - Top 10% captures: {gains_summary.get('top_10_capture', 0):.1f}% of positives")
                sections.append(f"  - Top 20% captures: {gains_summary.get('top_20_capture', 0):.1f}% of positives")
                sections.append(f"  - Capture AUC: {gains_summary.get('auc_capture', 0):.3f}")

        elif task == "forecasting" and problem_specific_data:
            sections.append("### Forecasting Details:")
            sections.append(f"  - Prediction horizon: {problem_specific_data.get('prediction_horizon', 'N/A')}")
            if "evaluation_metrics" in problem_specific_data:
                for metric, value in problem_specific_data["evaluation_metrics"].items():
                    sections.append(f"  - {metric}: {value:.4f}")

        elif task == "clustering" and problem_specific_data:
            sections.append("### Clustering Results:")
            sections.append(f"  - Number of clusters: {problem_specific_data.get('n_clusters', 'N/A')}")
            if "silhouette_score" in problem_specific_data:
                sections.append(f"  - Silhouette score: {problem_specific_data['silhouette_score']:.3f}")
            if "cluster_sizes" in problem_specific_data:
                sections.append("  - Cluster sizes:")
                for cluster_id, size in problem_specific_data["cluster_sizes"].items():
                    sections.append(f"    Cluster {cluster_id}: {size} records")

        elif task == "anomaly" and problem_specific_data:
            sections.append("### Anomaly Detection Results:")
            stats = problem_specific_data.get("anomaly_statistics", {})
            sections.append(f"  - Total anomalies: {stats.get('total_anomalies', 0)}")
            sections.append(f"  - Anomaly rate: {stats.get('anomaly_rate', 0):.2f}%")
            sections.append(f"  - Detection threshold: {stats.get('threshold_used', 0):.4f}")

        return "\n".join(sections) if sections else ""

    def _fallback_gpt5_interpretation(
        self,
        task: str,
        target_column: str,
        best_model: str,
        best_score: float,
        eval_metric: str,
        sorted_features: List[tuple],
        num_rows: int,
    ) -> GPT5Interpretation:
        """Generate fallback GPT-5 interpretation when LLM is unavailable."""
        # Determine confidence level based on data size and score
        if num_rows >= 10000 and best_score >= 0.85:
            confidence = "high"
        elif num_rows >= 1000 and best_score >= 0.7:
            confidence = "medium"
        else:
            confidence = "low"

        # Generate key findings from features
        key_findings = []
        for i, (feat, score) in enumerate(sorted_features[:3]):
            key_findings.append(
                KeyFinding(
                    finding=f"{feat} is a key predictor of {target_column}",
                    evidence=f"Feature importance score: {score:.3f}",
                    business_implication=f"Focus on {feat} to understand and influence {target_column}",
                )
            )

        return GPT5Interpretation(
            executive_summary=(
                f"A {task} model has been trained to predict {target_column} using {best_model}. "
                f"The model achieved a {eval_metric} score of {best_score:.4f} on {num_rows:,} records. "
                f"This model can be used to make predictions on new data with {confidence} confidence."
            ),
            key_findings=key_findings,
            recommended_actions=[
                RecommendedAction(
                    action=f"Deploy this model to predict {target_column} on new data",
                    priority="high",
                    expected_impact=f"Enable data-driven decisions for {target_column}",
                ),
                RecommendedAction(
                    action="Set up monitoring to track model performance over time",
                    priority="medium",
                    expected_impact="Early detection of model drift and degradation",
                ),
                RecommendedAction(
                    action="Schedule periodic model retraining with fresh data",
                    priority="low",
                    expected_impact="Maintain model accuracy as data patterns change",
                ),
            ],
            model_assessment=ModelAssessment(
                strengths=[
                    f"{best_model} performed best among all tested algorithms",
                    f"Model trained on {num_rows:,} records for robust predictions",
                ],
                limitations=[
                    "Model performance may vary on data significantly different from training data",
                    "Feature availability must match training data for accurate predictions",
                ],
                confidence_level=confidence,
            ),
            next_steps=[
                "Review feature importance to validate business understanding",
                "Test model predictions on a sample of new data",
                "Integrate model into production workflows",
            ],
            caveats=[
                "Model accuracy is based on historical data and may not reflect future patterns",
                "Predictions should be validated by domain experts before critical decisions",
            ],
        )

    async def generate_problem_specific_insights(
        self,
        task: str,
        results: Dict[str, Any],
        business_context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate task-specific insights for specialized problem types.

        Args:
            task: Task type (forecasting/clustering/anomaly)
            results: Task-specific results
            business_context: Optional business context

        Returns:
            Dictionary with task-specific insights
        """
        if task == "forecasting":
            return await self._generate_forecasting_insights(results, business_context)
        elif task == "clustering":
            return await self._generate_clustering_insights(results, business_context)
        elif task == "anomaly":
            return await self._generate_anomaly_insights(results, business_context)
        else:
            return {}

    async def _generate_forecasting_insights(
        self,
        results: Dict[str, Any],
        business_context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate forecasting-specific insights."""
        forecast = results.get("forecast", [])
        metrics = results.get("evaluation_metrics", {})
        horizon = results.get("prediction_horizon", 0)

        prompt = f"""You are a forecasting expert. Analyze these time series forecast results and provide business insights.

## Forecast Summary
- Prediction horizon: {horizon} periods
- Evaluation metrics: {json.dumps(metrics, indent=2)}
- Sample forecasts: {json.dumps(forecast[:10], indent=2) if forecast else "N/A"}

{f"Business context: {business_context}" if business_context else ""}

Provide insights as JSON:
{{
  "trend_analysis": "Description of the predicted trend",
  "confidence_assessment": "How confident are the predictions?",
  "seasonality_notes": "Any seasonal patterns observed",
  "business_implications": ["Implication 1", "Implication 2"],
  "planning_recommendations": ["Recommendation for business planning"]
}}

Return ONLY the JSON object."""

        try:
            response = await self._llm.generate_response(
                prompt,
                response_format="json",
                model_id="gpt-5",
            )
            return json.loads(response) if isinstance(response, str) else response
        except Exception as exc:
            logger.warning("Forecasting insights generation failed: %s", exc)
            return {
                "trend_analysis": "Forecast generated for the specified horizon",
                "confidence_assessment": "Review prediction intervals for confidence bounds",
                "business_implications": ["Use forecasts for resource planning"],
            }

    async def _generate_clustering_insights(
        self,
        results: Dict[str, Any],
        business_context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate clustering-specific insights."""
        n_clusters = results.get("n_clusters", 0)
        silhouette = results.get("silhouette_score")
        cluster_stats = results.get("cluster_statistics", [])

        prompt = f"""You are a customer segmentation expert. Analyze these clustering results and provide business insights.

## Clustering Summary
- Number of clusters: {n_clusters}
- Silhouette score: {silhouette if silhouette else "N/A"}
- Cluster statistics: {json.dumps(cluster_stats[:5], indent=2) if cluster_stats else "N/A"}

{f"Business context: {business_context}" if business_context else ""}

Provide insights as JSON:
{{
  "segment_quality": "Assessment of how well-defined the segments are",
  "segment_profiles": [
    {{"cluster_id": 0, "profile_name": "Suggested name", "description": "Brief description of this segment"}}
  ],
  "targeting_recommendations": ["How to use these segments for targeting"],
  "next_steps": ["Recommended actions for each segment"]
}}

Return ONLY the JSON object."""

        try:
            response = await self._llm.generate_response(
                prompt,
                response_format="json",
                model_id="gpt-5",
            )
            return json.loads(response) if isinstance(response, str) else response
        except Exception as exc:
            logger.warning("Clustering insights generation failed: %s", exc)
            return {
                "segment_quality": f"Data segmented into {n_clusters} distinct groups",
                "targeting_recommendations": ["Analyze each cluster for targeted strategies"],
            }

    async def _generate_anomaly_insights(
        self,
        results: Dict[str, Any],
        business_context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate anomaly detection-specific insights."""
        stats = results.get("anomaly_statistics", {})
        n_anomalies = stats.get("total_anomalies", 0)
        anomaly_rate = stats.get("anomaly_rate", 0)

        prompt = f"""You are a fraud and anomaly detection expert. Analyze these anomaly detection results and provide business insights.

## Anomaly Detection Summary
- Total anomalies detected: {n_anomalies}
- Anomaly rate: {anomaly_rate:.2f}%
- Detection threshold: {stats.get("threshold_used", "N/A")}
- Score distribution: {json.dumps(stats.get("score_distribution", {}), indent=2)}

{f"Business context: {business_context}" if business_context else ""}

Provide insights as JSON:
{{
  "anomaly_assessment": "Overall assessment of the anomalies detected",
  "risk_level": "high/medium/low based on the findings",
  "investigation_priority": ["List of what to investigate first"],
  "threshold_recommendation": "Suggestion for adjusting the detection threshold",
  "monitoring_advice": ["Ongoing monitoring recommendations"]
}}

Return ONLY the JSON object."""

        try:
            response = await self._llm.generate_response(
                prompt,
                response_format="json",
                model_id="gpt-5",
            )
            return json.loads(response) if isinstance(response, str) else response
        except Exception as exc:
            logger.warning("Anomaly insights generation failed: %s", exc)
            return {
                "anomaly_assessment": f"Detected {n_anomalies} anomalies ({anomaly_rate:.2f}% of data)",
                "risk_level": "medium",
                "investigation_priority": ["Review top-scoring anomalies first"],
            }


# Global service instance
automl_insights_service = AutoMLInsightsService()
