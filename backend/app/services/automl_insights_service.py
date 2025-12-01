"""
AutoML Insights Service

Uses Azure OpenAI to generate business-friendly interpretations
of AutoML results for non-technical users.
"""

import json
import logging
from dataclasses import dataclass
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


# Global service instance
automl_insights_service = AutoMLInsightsService()
