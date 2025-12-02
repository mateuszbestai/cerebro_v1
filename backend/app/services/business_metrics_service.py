"""
Business Metrics Service

Computes business-ready metrics for AutoML results:
- Threshold optimization based on business costs
- Capture/gains curve
- Lift analysis by decile
- Precision-recall trade-off analysis
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.models.playbook_models import (
    BusinessCostWeights,
    CapturePoint,
    GainsSummary,
    LiftDecile,
    ThresholdAnalysis,
)

logger = logging.getLogger(__name__)


class BusinessMetricsService:
    """Computes business metrics for classification and ranking models."""

    def compute_threshold_analysis(
        self,
        y_true: np.ndarray,
        y_proba: np.ndarray,
        positive_label: Any = 1,
        cost_weights: Optional[BusinessCostWeights] = None,
        n_thresholds: int = 100
    ) -> ThresholdAnalysis:
        """
        Analyze classification thresholds and find optimal based on business costs.

        Args:
            y_true: True labels
            y_proba: Predicted probabilities for positive class
            positive_label: Label considered as positive class
            cost_weights: Business cost configuration
            n_thresholds: Number of thresholds to evaluate

        Returns:
            ThresholdAnalysis with optimal threshold and metrics
        """
        from sklearn.metrics import precision_score, recall_score, f1_score

        # Convert to binary
        y_binary = (y_true == positive_label).astype(int)

        # Generate threshold curve
        thresholds = np.linspace(0.01, 0.99, n_thresholds)
        curve_data = []

        best_threshold = 0.5
        best_score = float('-inf')
        best_metrics = {'precision': 0, 'recall': 0, 'f1': 0}

        # Default cost weights
        if cost_weights is None:
            cost_weights = BusinessCostWeights()

        for threshold in thresholds:
            y_pred = (y_proba >= threshold).astype(int)

            # Calculate metrics
            precision = precision_score(y_binary, y_pred, zero_division=0)
            recall = recall_score(y_binary, y_pred, zero_division=0)
            f1 = f1_score(y_binary, y_pred, zero_division=0)

            # Calculate business cost
            tp = ((y_binary == 1) & (y_pred == 1)).sum()
            tn = ((y_binary == 0) & (y_pred == 0)).sum()
            fp = ((y_binary == 0) & (y_pred == 1)).sum()
            fn = ((y_binary == 1) & (y_pred == 0)).sum()

            cost = (
                fp * cost_weights.false_positive_cost +
                fn * cost_weights.false_negative_cost -
                tp * cost_weights.true_positive_value -
                tn * cost_weights.true_negative_value
            )

            # Score to maximize (negative cost = higher is better)
            score = -cost

            curve_data.append({
                'threshold': float(threshold),
                'precision': float(precision),
                'recall': float(recall),
                'f1': float(f1),
                'cost': float(cost),
                'tp': int(tp),
                'fp': int(fp),
                'tn': int(tn),
                'fn': int(fn)
            })

            if score > best_score:
                best_score = score
                best_threshold = threshold
                best_metrics = {
                    'precision': precision,
                    'recall': recall,
                    'f1': f1,
                    'cost': cost
                }

        return ThresholdAnalysis(
            optimal_threshold=float(best_threshold),
            optimal_metric_value=float(best_metrics['f1']),
            precision_at_threshold=float(best_metrics['precision']),
            recall_at_threshold=float(best_metrics['recall']),
            f1_at_threshold=float(best_metrics['f1']),
            expected_cost_at_threshold=float(best_metrics['cost']),
            threshold_curve=curve_data
        )

    def compute_gains_summary(
        self,
        y_true: np.ndarray,
        y_proba: np.ndarray,
        positive_label: Any = 1,
        n_points: int = 100
    ) -> GainsSummary:
        """
        Compute capture curve and lift analysis.

        Args:
            y_true: True labels
            y_proba: Predicted probabilities for positive class
            positive_label: Label considered as positive class
            n_points: Number of points on capture curve

        Returns:
            GainsSummary with capture curve and lift by decile
        """
        # Convert to binary
        y_binary = (y_true == positive_label).astype(int)

        # Create DataFrame and sort by probability
        df = pd.DataFrame({
            'y_true': y_binary,
            'y_proba': y_proba
        }).sort_values('y_proba', ascending=False)

        total_positives = y_binary.sum()
        total_count = len(y_binary)

        # Compute capture curve
        capture_curve = []
        percentiles = np.linspace(0, 100, n_points + 1)[1:]  # Skip 0%

        for pct in percentiles:
            n_samples = int(np.ceil(len(df) * pct / 100))
            top_n = df.head(n_samples)
            captured = top_n['y_true'].sum()
            capture_rate = captured / total_positives * 100 if total_positives > 0 else 0

            capture_curve.append(CapturePoint(
                percentile=float(pct),
                capture_rate=float(capture_rate),
                cumulative_count=int(n_samples)
            ))

        # Compute lift by decile
        lift_by_decile = []
        overall_rate = total_positives / total_count if total_count > 0 else 0

        df['decile'] = pd.qcut(
            df['y_proba'].rank(method='first'),
            q=10,
            labels=False
        )
        df['decile'] = 10 - df['decile']  # 1 = highest proba

        for decile in range(1, 11):
            decile_data = df[df['decile'] == decile]
            decile_positives = decile_data['y_true'].sum()
            decile_count = len(decile_data)
            decile_rate = decile_positives / decile_count if decile_count > 0 else 0
            lift = decile_rate / overall_rate if overall_rate > 0 else 0

            # Cumulative lift
            cumulative_data = df[df['decile'] <= decile]
            cum_positives = cumulative_data['y_true'].sum()
            cum_count = len(cumulative_data)
            cum_rate = cum_positives / cum_count if cum_count > 0 else 0
            cum_lift = cum_rate / overall_rate if overall_rate > 0 else 0

            lift_by_decile.append(LiftDecile(
                decile=decile,
                lift=float(lift),
                cumulative_lift=float(cum_lift),
                response_rate=float(decile_rate * 100),
                count=int(decile_count)
            ))

        # Compute summary metrics
        top_10_capture = capture_curve[9].capture_rate if len(capture_curve) >= 10 else 0
        top_20_capture = capture_curve[19].capture_rate if len(capture_curve) >= 20 else 0

        # AUC of capture curve (area under normalized curve)
        auc_capture = np.trapz(
            [p.capture_rate / 100 for p in capture_curve],
            [p.percentile / 100 for p in capture_curve]
        )

        return GainsSummary(
            capture_curve=capture_curve,
            lift_by_decile=lift_by_decile,
            auc_capture=float(auc_capture),
            top_10_capture=float(top_10_capture),
            top_20_capture=float(top_20_capture)
        )

    def compute_precision_recall_curve(
        self,
        y_true: np.ndarray,
        y_proba: np.ndarray,
        positive_label: Any = 1
    ) -> Dict[str, Any]:
        """
        Compute precision-recall curve data.

        Args:
            y_true: True labels
            y_proba: Predicted probabilities
            positive_label: Label considered as positive class

        Returns:
            Dictionary with precision, recall, thresholds, and AUC
        """
        from sklearn.metrics import precision_recall_curve, auc

        y_binary = (y_true == positive_label).astype(int)

        precision, recall, thresholds = precision_recall_curve(y_binary, y_proba)

        # Compute AUC
        pr_auc = auc(recall, precision)

        return {
            'precision': precision.tolist(),
            'recall': recall.tolist(),
            'thresholds': thresholds.tolist(),
            'auc': float(pr_auc)
        }

    def compute_roc_curve(
        self,
        y_true: np.ndarray,
        y_proba: np.ndarray,
        positive_label: Any = 1
    ) -> Dict[str, Any]:
        """
        Compute ROC curve data.

        Args:
            y_true: True labels
            y_proba: Predicted probabilities
            positive_label: Label considered as positive class

        Returns:
            Dictionary with FPR, TPR, thresholds, and AUC
        """
        from sklearn.metrics import roc_curve, roc_auc_score

        y_binary = (y_true == positive_label).astype(int)

        fpr, tpr, thresholds = roc_curve(y_binary, y_proba)
        roc_auc = roc_auc_score(y_binary, y_proba)

        return {
            'fpr': fpr.tolist(),
            'tpr': tpr.tolist(),
            'thresholds': thresholds.tolist(),
            'auc': float(roc_auc)
        }

    def compute_regression_intervals(
        self,
        predictions: np.ndarray,
        residuals: Optional[np.ndarray] = None,
        confidence: float = 0.95
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Compute prediction intervals for regression.

        Args:
            predictions: Point predictions
            residuals: Model residuals (for empirical intervals)
            confidence: Confidence level (default 95%)

        Returns:
            Tuple of (lower_bounds, upper_bounds)
        """
        if residuals is not None:
            # Empirical intervals based on residual distribution
            residual_std = np.std(residuals)
            z_score = {0.90: 1.645, 0.95: 1.96, 0.99: 2.576}.get(confidence, 1.96)
            margin = z_score * residual_std
        else:
            # Default margin based on prediction variance
            margin = np.std(predictions) * 0.1  # 10% of prediction std

        lower = predictions - margin
        upper = predictions + margin

        return lower, upper

    def compute_cluster_statistics(
        self,
        data: pd.DataFrame,
        cluster_labels: np.ndarray,
        feature_columns: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Compute statistics for each cluster.

        Args:
            data: Original data
            cluster_labels: Cluster assignments
            feature_columns: Columns to analyze

        Returns:
            List of cluster summaries
        """
        df = data.copy()
        df['cluster'] = cluster_labels

        clusters = []
        total_count = len(df)

        for cluster_id in sorted(df['cluster'].unique()):
            cluster_data = df[df['cluster'] == cluster_id]
            cluster_size = len(cluster_data)

            # Compute centroid for numeric columns
            numeric_cols = cluster_data[feature_columns].select_dtypes(
                include=[np.number]
            ).columns
            centroid = cluster_data[numeric_cols].mean().to_dict()

            # Find distinctive features (compare to overall mean)
            overall_mean = df[numeric_cols].mean()
            cluster_mean = cluster_data[numeric_cols].mean()

            # Compute z-scores for feature deviation
            overall_std = df[numeric_cols].std()
            z_scores = ((cluster_mean - overall_mean) / overall_std).fillna(0)

            # Top distinctive features
            top_features = []
            for col in z_scores.abs().nlargest(5).index:
                top_features.append({
                    'feature': col,
                    'cluster_mean': float(cluster_mean[col]),
                    'overall_mean': float(overall_mean[col]),
                    'z_score': float(z_scores[col]),
                    'direction': 'higher' if z_scores[col] > 0 else 'lower'
                })

            clusters.append({
                'cluster_id': int(cluster_id),
                'size': cluster_size,
                'percentage': float(cluster_size / total_count * 100),
                'centroid': {k: float(v) for k, v in centroid.items()},
                'top_features': top_features
            })

        return clusters

    def compute_anomaly_statistics(
        self,
        anomaly_scores: np.ndarray,
        threshold: Optional[float] = None,
        contamination: float = 0.1
    ) -> Dict[str, Any]:
        """
        Compute anomaly detection statistics.

        Args:
            anomaly_scores: Anomaly scores (higher = more anomalous)
            threshold: Score threshold for anomaly flag
            contamination: Expected proportion of anomalies

        Returns:
            Dictionary with anomaly statistics
        """
        if threshold is None:
            # Use contamination to set threshold
            threshold = np.percentile(anomaly_scores, (1 - contamination) * 100)

        is_anomaly = anomaly_scores >= threshold
        n_anomalies = is_anomaly.sum()

        # Score distribution
        distribution = {
            'min': float(np.min(anomaly_scores)),
            'max': float(np.max(anomaly_scores)),
            'mean': float(np.mean(anomaly_scores)),
            'median': float(np.median(anomaly_scores)),
            'std': float(np.std(anomaly_scores)),
            'p90': float(np.percentile(anomaly_scores, 90)),
            'p95': float(np.percentile(anomaly_scores, 95)),
            'p99': float(np.percentile(anomaly_scores, 99))
        }

        return {
            'total_anomalies': int(n_anomalies),
            'anomaly_rate': float(n_anomalies / len(anomaly_scores) * 100),
            'threshold_used': float(threshold),
            'score_distribution': distribution
        }

    def compute_business_impact(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        cost_weights: BusinessCostWeights,
        baseline_rate: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Compute business impact metrics.

        Args:
            y_true: True labels (binary)
            y_pred: Predicted labels
            cost_weights: Business cost configuration
            baseline_rate: Baseline positive rate (for lift calculation)

        Returns:
            Dictionary with business impact metrics
        """
        tp = ((y_true == 1) & (y_pred == 1)).sum()
        tn = ((y_true == 0) & (y_pred == 0)).sum()
        fp = ((y_true == 0) & (y_pred == 1)).sum()
        fn = ((y_true == 1) & (y_pred == 0)).sum()

        # Calculate costs/benefits
        model_value = (
            tp * cost_weights.true_positive_value +
            tn * cost_weights.true_negative_value -
            fp * cost_weights.false_positive_cost -
            fn * cost_weights.false_negative_cost
        )

        # Baseline: random model at same prediction rate
        pred_rate = y_pred.mean()
        total = len(y_true)
        actual_positive_rate = y_true.mean()

        if baseline_rate is None:
            baseline_rate = actual_positive_rate

        # Expected baseline outcomes
        baseline_tp = total * baseline_rate * actual_positive_rate
        baseline_tn = total * (1 - baseline_rate) * (1 - actual_positive_rate)
        baseline_fp = total * baseline_rate * (1 - actual_positive_rate)
        baseline_fn = total * (1 - baseline_rate) * actual_positive_rate

        baseline_value = (
            baseline_tp * cost_weights.true_positive_value +
            baseline_tn * cost_weights.true_negative_value -
            baseline_fp * cost_weights.false_positive_cost -
            baseline_fn * cost_weights.false_negative_cost
        )

        improvement = model_value - baseline_value

        return {
            'model_value': float(model_value),
            'baseline_value': float(baseline_value),
            'improvement': float(improvement),
            'improvement_pct': float(improvement / abs(baseline_value) * 100) if baseline_value != 0 else 0,
            'confusion_matrix': {
                'tp': int(tp),
                'tn': int(tn),
                'fp': int(fp),
                'fn': int(fn)
            }
        }


# Global instance
business_metrics_service = BusinessMetricsService()
