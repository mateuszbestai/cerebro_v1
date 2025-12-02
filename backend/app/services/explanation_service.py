"""
Explanation Service

Provides model explanations using SHAP (SHapley Additive exPlanations):
- Global feature importance
- Local explanations per record
- Feature interaction analysis
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Check SHAP availability
try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False
    logger.warning("SHAP not installed. Install with: pip install shap")


class ExplanationService:
    """Generates model explanations using SHAP."""

    def __init__(self):
        self._explanation_cache: Dict[str, Any] = {}

    def is_available(self) -> bool:
        """Check if SHAP is installed."""
        return SHAP_AVAILABLE

    def compute_global_explanations(
        self,
        model: Any,
        X: pd.DataFrame,
        sample_size: int = 1000,
        feature_names: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Compute global feature importance using SHAP.

        Args:
            model: Trained model (AutoGluon predictor or sklearn model)
            X: Feature data
            sample_size: Number of samples for SHAP computation
            feature_names: Optional feature names

        Returns:
            Dictionary with global importance and summary statistics
        """
        if not SHAP_AVAILABLE:
            return self._fallback_importance(model, X, feature_names)

        try:
            # Sample data if too large
            if len(X) > sample_size:
                X_sample = X.sample(n=sample_size, random_state=42)
            else:
                X_sample = X

            # Get feature names
            if feature_names is None:
                feature_names = list(X.columns)

            # Create SHAP explainer
            explainer = self._create_explainer(model, X_sample)
            if explainer is None:
                return self._fallback_importance(model, X, feature_names)

            # Compute SHAP values
            shap_values = explainer(X_sample)

            # Handle multi-output (classification)
            if isinstance(shap_values.values, list):
                # For multi-class, average across classes
                values = np.abs(np.array(shap_values.values)).mean(axis=0)
            elif len(shap_values.values.shape) == 3:
                # Shape: (n_samples, n_features, n_classes)
                values = np.abs(shap_values.values).mean(axis=(0, 2))
            else:
                values = np.abs(shap_values.values).mean(axis=0)

            # Create importance dictionary
            importance = {}
            for i, name in enumerate(feature_names):
                if i < len(values):
                    importance[name] = float(values[i])

            # Sort by importance
            importance = dict(sorted(
                importance.items(),
                key=lambda x: x[1],
                reverse=True
            ))

            # Compute summary statistics
            summary = self._compute_shap_summary(shap_values, feature_names)

            return {
                'feature_importance': importance,
                'shap_summary': summary,
                'method': 'shap',
                'sample_size': len(X_sample)
            }

        except Exception as e:
            logger.warning(f"SHAP computation failed: {e}. Using fallback.")
            return self._fallback_importance(model, X, feature_names)

    def compute_local_explanations(
        self,
        model: Any,
        X: pd.DataFrame,
        indices: Optional[List[int]] = None,
        top_k: int = 10,
        feature_names: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Compute local explanations for specific records.

        Args:
            model: Trained model
            X: Feature data
            indices: Indices of records to explain (default: first 10)
            top_k: Number of top features to include per record
            feature_names: Optional feature names

        Returns:
            List of local explanations
        """
        if indices is None:
            indices = list(range(min(10, len(X))))

        if feature_names is None:
            feature_names = list(X.columns)

        explanations = []

        if not SHAP_AVAILABLE:
            # Fallback: return empty explanations
            for idx in indices:
                explanations.append({
                    'record_index': idx,
                    'contributions': {},
                    'method': 'unavailable'
                })
            return explanations

        try:
            # Get samples to explain
            X_explain = X.iloc[indices]

            # Create explainer with background data
            background = X.sample(n=min(100, len(X)), random_state=42)
            explainer = self._create_explainer(model, background)

            if explainer is None:
                return self._fallback_local_explanations(indices)

            # Compute SHAP values for selected records
            shap_values = explainer(X_explain)

            for i, idx in enumerate(indices):
                # Get values for this record
                if isinstance(shap_values.values, list):
                    # Multi-class: use the predicted class
                    values = shap_values.values[0][i] if len(shap_values.values) > 0 else shap_values.values[i]
                elif len(shap_values.values.shape) == 3:
                    # Average across classes
                    values = shap_values.values[i].mean(axis=1)
                else:
                    values = shap_values.values[i]

                # Create contribution dictionary
                contributions = {}
                for j, name in enumerate(feature_names):
                    if j < len(values):
                        contributions[name] = float(values[j])

                # Sort and take top k
                sorted_contribs = dict(sorted(
                    contributions.items(),
                    key=lambda x: abs(x[1]),
                    reverse=True
                )[:top_k])

                explanations.append({
                    'record_index': int(idx),
                    'contributions': sorted_contribs,
                    'base_value': float(shap_values.base_values[i]) if hasattr(shap_values, 'base_values') else 0,
                    'method': 'shap'
                })

        except Exception as e:
            logger.warning(f"Local SHAP computation failed: {e}")
            return self._fallback_local_explanations(indices)

        return explanations

    def compute_feature_interactions(
        self,
        model: Any,
        X: pd.DataFrame,
        feature_names: Optional[List[str]] = None,
        top_k: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Compute top feature interactions.

        Args:
            model: Trained model
            X: Feature data
            feature_names: Optional feature names
            top_k: Number of top interactions to return

        Returns:
            List of feature interaction pairs with interaction strength
        """
        if not SHAP_AVAILABLE:
            return []

        if feature_names is None:
            feature_names = list(X.columns)

        try:
            # Sample data
            X_sample = X.sample(n=min(500, len(X)), random_state=42)

            # Create tree explainer (only works for tree models)
            explainer = self._create_explainer(model, X_sample)
            if explainer is None:
                return []

            # Try to compute interaction values
            try:
                shap_interaction = explainer.shap_interaction_values(X_sample)
            except (AttributeError, NotImplementedError):
                logger.info("Interaction values not supported for this model type")
                return []

            # Average interaction strengths
            if isinstance(shap_interaction, list):
                interaction_matrix = np.abs(np.array(shap_interaction)).mean(axis=0).mean(axis=0)
            else:
                interaction_matrix = np.abs(shap_interaction).mean(axis=0)

            # Get top interactions (excluding self-interactions)
            interactions = []
            n_features = len(feature_names)

            for i in range(n_features):
                for j in range(i + 1, n_features):
                    if i < interaction_matrix.shape[0] and j < interaction_matrix.shape[1]:
                        interactions.append({
                            'feature_1': feature_names[i],
                            'feature_2': feature_names[j],
                            'interaction_strength': float(interaction_matrix[i, j])
                        })

            # Sort by interaction strength
            interactions.sort(key=lambda x: x['interaction_strength'], reverse=True)

            return interactions[:top_k]

        except Exception as e:
            logger.warning(f"Interaction computation failed: {e}")
            return []

    def generate_explanation_narrative(
        self,
        importance: Dict[str, float],
        top_k: int = 5
    ) -> str:
        """
        Generate a human-readable explanation narrative.

        Args:
            importance: Feature importance dictionary
            top_k: Number of top features to include

        Returns:
            Narrative string
        """
        if not importance:
            return "No feature importance information available."

        sorted_features = sorted(
            importance.items(),
            key=lambda x: x[1],
            reverse=True
        )[:top_k]

        total_importance = sum(importance.values())

        lines = ["Top predictive features:"]
        for i, (feature, imp) in enumerate(sorted_features, 1):
            pct = (imp / total_importance * 100) if total_importance > 0 else 0
            lines.append(f"{i}. {feature}: {pct:.1f}% of predictive power")

        return "\n".join(lines)

    def _create_explainer(
        self,
        model: Any,
        background_data: pd.DataFrame
    ) -> Optional[Any]:
        """Create appropriate SHAP explainer for the model type."""
        if not SHAP_AVAILABLE:
            return None

        try:
            # Try TreeExplainer first (fast, exact for tree models)
            try:
                # For AutoGluon, try to get the underlying model
                if hasattr(model, 'model_best'):
                    # Get best model's predictor
                    pass  # Use KernelExplainer for AutoGluon

                return shap.TreeExplainer(model)
            except Exception:
                pass

            # Try LinearExplainer
            try:
                return shap.LinearExplainer(model, background_data)
            except Exception:
                pass

            # Fall back to KernelExplainer (works for any model)
            # This is slow but model-agnostic
            def predict_fn(X):
                if hasattr(model, 'predict_proba'):
                    return model.predict_proba(X)
                return model.predict(X)

            return shap.KernelExplainer(
                predict_fn,
                shap.sample(background_data, min(50, len(background_data)))
            )

        except Exception as e:
            logger.warning(f"Could not create SHAP explainer: {e}")
            return None

    def _compute_shap_summary(
        self,
        shap_values: Any,
        feature_names: List[str]
    ) -> Dict[str, Any]:
        """Compute summary statistics from SHAP values."""
        try:
            if isinstance(shap_values.values, list):
                values = np.array(shap_values.values)
            else:
                values = shap_values.values

            # Flatten if multi-class
            if len(values.shape) == 3:
                values = values.mean(axis=2)

            summary = {
                'mean_abs_shap': {},
                'std_shap': {},
                'positive_ratio': {}
            }

            for i, name in enumerate(feature_names):
                if i < values.shape[1]:
                    col_values = values[:, i]
                    summary['mean_abs_shap'][name] = float(np.abs(col_values).mean())
                    summary['std_shap'][name] = float(col_values.std())
                    summary['positive_ratio'][name] = float((col_values > 0).mean())

            return summary

        except Exception as e:
            logger.warning(f"Could not compute SHAP summary: {e}")
            return {}

    def _fallback_importance(
        self,
        model: Any,
        X: pd.DataFrame,
        feature_names: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Fallback feature importance when SHAP is unavailable."""
        if feature_names is None:
            feature_names = list(X.columns)

        importance = {}

        try:
            # Try to get feature importance from model
            if hasattr(model, 'feature_importance'):
                # AutoGluon
                fi = model.feature_importance(X)
                if hasattr(fi, 'to_dict'):
                    importance = fi['importance'].to_dict()
                else:
                    importance = dict(fi)
            elif hasattr(model, 'feature_importances_'):
                # Sklearn tree models
                for i, imp in enumerate(model.feature_importances_):
                    if i < len(feature_names):
                        importance[feature_names[i]] = float(imp)
            elif hasattr(model, 'coef_'):
                # Linear models
                coef = np.abs(model.coef_).flatten()
                for i, imp in enumerate(coef):
                    if i < len(feature_names):
                        importance[feature_names[i]] = float(imp)
            else:
                # Default: equal importance
                for name in feature_names:
                    importance[name] = 1.0 / len(feature_names)

        except Exception as e:
            logger.warning(f"Fallback importance computation failed: {e}")
            for name in feature_names:
                importance[name] = 1.0 / len(feature_names)

        # Normalize
        total = sum(importance.values())
        if total > 0:
            importance = {k: v / total for k, v in importance.items()}

        # Sort by importance
        importance = dict(sorted(
            importance.items(),
            key=lambda x: x[1],
            reverse=True
        ))

        return {
            'feature_importance': importance,
            'shap_summary': None,
            'method': 'model_native',
            'sample_size': len(X)
        }

    def _fallback_local_explanations(
        self,
        indices: List[int]
    ) -> List[Dict[str, Any]]:
        """Return empty local explanations when SHAP unavailable."""
        return [
            {
                'record_index': int(idx),
                'contributions': {},
                'method': 'unavailable'
            }
            for idx in indices
        ]


# Global instance
explanation_service = ExplanationService()
