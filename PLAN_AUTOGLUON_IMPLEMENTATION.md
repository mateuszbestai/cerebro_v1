# AutoGluon Implementation Plan

## Executive Summary

Replace Azure AutoML with AutoGluon to provide a simpler, local-first AutoML experience for non-technical business users. This plan addresses all prerequisites and delivers an end-to-end solution with enhanced UX.

---

## Prerequisites Analysis

### 1. GDM Service Assessment: Is it Sufficient for LLM to Recommend Playbooks?

**Current State: Mostly Sufficient with Minor Enhancements Needed**

The `gdm_automl.py` module already provides robust AutoML guidance:

| Feature | Status | Notes |
|---------|--------|-------|
| Semantic type detection | ✅ Good | Detects price, kpi, boolean, categorical, timestamp, foreign_key |
| Target recommendations | ✅ Good | Scores columns by ML task suitability (classification/regression) |
| Business process hints | ✅ Good | Maps tables to domains (Order to Cash, Customer 360, etc.) |
| Feature availability timing | ✅ Good | Identifies timestamp columns for feature engineering |
| Feature suggestions | ✅ Good | Recommends feature columns per table |
| KPI/metric detection | ✅ Good | Identifies monetary and KPI columns |

**Recommended Enhancements:**

1. **Data Quality Signals** (NEW) - Add to help LLM make better recommendations:
   - Null percentage per column
   - Cardinality (unique value count)
   - Data type distribution
   - Outlier indicators

2. **Sample Statistics** (NEW) - Help LLM understand data distribution:
   - Min/max/mean for numeric columns
   - Top categories for categorical columns
   - Date ranges for temporal columns

3. **Target Suitability Score** (ENHANCE) - More explicit scoring criteria:
   - Class balance indicator for classification targets
   - Variance indicator for regression targets
   - Recommended minimum row count warnings

---

## Implementation Plan

### Phase 1: Enhance GDM for Better AutoML Recommendations

**Files to modify:**
- `backend/app/services/gdm_automl.py`
- `backend/app/services/gdm_service.py`

**Changes:**

1.1. Add data quality metrics to column profiling:
```python
# New fields in column metadata
{
    "null_pct": 0.05,           # Percentage of nulls
    "cardinality": 150,          # Unique value count
    "cardinality_ratio": 0.15,   # cardinality / row_count
    "sample_stats": {
        "min": 0, "max": 1000, "mean": 250, "std": 100  # for numeric
        # OR
        "top_values": [("A", 0.4), ("B", 0.35), ("C", 0.25)]  # for categorical
    }
}
```

1.2. Add target suitability warnings:
```python
# New in automl_guidance
{
    "recommended_targets": [...],
    "target_warnings": [
        {
            "table": "schema.table",
            "column": "status",
            "warning": "High class imbalance (95/5 split) - consider SMOTE or class weights",
            "severity": "medium"
        }
    ]
}
```

1.3. Add minimum data requirements indicator:
```python
{
    "data_readiness": {
        "sufficient_rows": true,      # >= 100 rows
        "sufficient_features": true,  # >= 3 non-key columns
        "has_target_candidates": true,
        "recommendation": "Ready for AutoML" | "Need more data" | "Review data quality"
    }
}
```

---

### Phase 2: Create AutoGluon Service (Core Backend)

**New file:** `backend/app/services/autogluon_service.py`

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    AutoGluonService                          │
├─────────────────────────────────────────────────────────────┤
│  submit_job(config) → job_id                                │
│  get_job_status(job_id) → status, progress, metrics         │
│  cancel_job(job_id) → success                               │
│  get_leaderboard(job_id) → model rankings                   │
│  get_feature_importance(job_id) → importance scores         │
│  predict(job_id, data) → predictions                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    AutoGluonJob (Thread)                     │
├─────────────────────────────────────────────────────────────┤
│  - Runs AutoGluon TabularPredictor in background            │
│  - Reports progress via callback                            │
│  - Saves models to disk                                     │
│  - Captures metrics incrementally                           │
└─────────────────────────────────────────────────────────────┘
```

**Key Design Decisions:**

1. **Local execution** - AutoGluon runs on the backend server (no cloud dependency)
2. **Background threading** - Long-running jobs don't block the API
3. **Progress reporting** - Real-time updates via polling endpoint
4. **Model persistence** - Save trained models for later inference
5. **Graceful degradation** - Clear error handling for resource constraints

**AutoGluonJobConfig dataclass:**
```python
@dataclass
class AutoGluonJobConfig:
    task: str  # "classification", "regression", "forecasting"
    target_column: str
    training_data: Union[str, pd.DataFrame]  # Path or DataFrame
    time_limit: int = 300  # seconds (default 5 min for quick results)
    presets: str = "medium_quality"  # "best_quality", "high_quality", "good_quality", "medium_quality"
    eval_metric: Optional[str] = None  # auto-selected based on task
    problem_type: Optional[str] = None  # auto-detected
    excluded_columns: List[str] = field(default_factory=list)
    holdout_frac: float = 0.2
    num_bag_folds: int = 0  # 0 = auto
    num_stack_levels: int = 0  # 0 = auto
    tags: Dict[str, str] = field(default_factory=dict)
```

**Progress Tracking:**
```python
class JobProgress:
    job_id: str
    status: str  # "pending", "preparing", "training", "evaluating", "completed", "failed"
    progress_pct: int  # 0-100
    current_step: str  # "Loading data", "Preprocessing", "Training XGBoost", etc.
    models_trained: int
    best_model: Optional[str]
    best_score: Optional[float]
    elapsed_seconds: int
    estimated_remaining: Optional[int]
    log_messages: List[str]
```

---

### Phase 3: Create AutoML Wizard UI (Frontend)

**New files:**
- `frontend/src/components/AutoML/AutoMLWizard.tsx` (main wizard)
- `frontend/src/components/AutoML/steps/DataSelectionStep.tsx`
- `frontend/src/components/AutoML/steps/TargetSelectionStep.tsx`
- `frontend/src/components/AutoML/steps/ConfigurationStep.tsx`
- `frontend/src/components/AutoML/steps/TrainingStep.tsx`
- `frontend/src/components/AutoML/steps/ResultsStep.tsx`
- `frontend/src/components/AutoML/AutoMLProgress.tsx`
- `frontend/src/components/AutoML/AutoMLResults.tsx`

**Wizard Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│                    Step 1: Select Data                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Choose from:                                        │    │
│  │  • Connected database table                          │    │
│  │  • GDM recommendations (pre-selected if from GDM)    │    │
│  │  • Upload CSV file                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│  [Data Preview Table - first 10 rows]                        │
│  Stats: 50,000 rows • 25 columns • 2 nulls detected          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Step 2: What do you want to predict?         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  🎯 Recommended Targets (from GDM analysis)          │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │ ⭐ churn_flag (Classification)               │    │    │
│  │  │    "Predict customer churn based on behavior"│    │    │
│  │  │    Why: Boolean column with balanced classes │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │    total_revenue (Regression)               │    │    │
│  │  │    "Predict customer lifetime value"        │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
│  Or select any column: [Dropdown ▼]                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Step 3: Configure Training                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Training Speed vs Quality                           │    │
│  │  ┌────────────────────────────────────────────────┐ │    │
│  │  │ ○ Quick (5 min) - Good for exploration         │ │    │
│  │  │ ● Balanced (15 min) - Recommended              │ │    │
│  │  │ ○ Thorough (60 min) - Best accuracy            │ │    │
│  │  └────────────────────────────────────────────────┘ │    │
│  │                                                      │    │
│  │  Advanced Options (collapsed by default)             │    │
│  │  • Exclude columns: [x] customer_id [x] created_at  │    │
│  │  • Evaluation metric: [Auto-detect ▼]               │    │
│  │  • Holdout percentage: [20% ▼]                      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Step 4: Training in Progress               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  🔄 Training models... (42%)                         │    │
│  │  ════════════════════░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │    │
│  │                                                      │    │
│  │  Current: Training LightGBM model                    │    │
│  │  Models completed: 5 of ~12                          │    │
│  │  Best so far: XGBoost (AUC: 0.847)                  │    │
│  │  Time elapsed: 3:24 / ~8:00 remaining               │    │
│  │                                                      │    │
│  │  📋 Activity Log                                     │    │
│  │  ├─ Loaded 50,000 rows                              │    │
│  │  ├─ Auto-detected 15 features                       │    │
│  │  ├─ Preprocessing complete                          │    │
│  │  ├─ ✓ RandomForest: AUC 0.823                       │    │
│  │  ├─ ✓ XGBoost: AUC 0.847                           │    │
│  │  └─ Training LightGBM...                            │    │
│  └─────────────────────────────────────────────────────┘    │
│                        [Cancel Training]                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Step 5: Results                           │
│  (Detailed in Phase 5 below)                                 │
└─────────────────────────────────────────────────────────────┘
```

---

### Phase 4: Real-time Progress Tracking

**Backend API endpoints:**

```python
# New endpoints in backend/app/api/routes/automl.py

POST /api/v1/automl/start
    Request: {
        task: str,
        target_column: str,
        source: "database" | "gdm" | "upload",
        source_config: {
            # For database: connection_id, table_name
            # For GDM: job_id, table_name
            # For upload: file_path
        },
        config: {
            preset: "quick" | "balanced" | "thorough",
            exclude_columns: [],
            eval_metric: null,  # auto
        }
    }
    Response: { job_id: str, status: "pending" }

GET /api/v1/automl/{job_id}/status
    Response: {
        job_id: str,
        status: "pending" | "preparing" | "training" | "evaluating" | "completed" | "failed",
        progress_pct: int,
        current_step: str,
        models_trained: int,
        best_model: str | null,
        best_score: float | null,
        elapsed_seconds: int,
        estimated_remaining: int | null,
        log_messages: [str]
    }

POST /api/v1/automl/{job_id}/cancel
    Response: { success: bool }

GET /api/v1/automl/{job_id}/results
    Response: { ... full results ... }
```

**Frontend polling strategy:**
```typescript
// Poll every 2 seconds during training
const POLL_INTERVAL = 2000;

// AutoMLProgress.tsx
const [status, setStatus] = useState<AutoMLStatus>();

useEffect(() => {
  if (!jobId || status?.status === 'completed' || status?.status === 'failed') return;

  const poll = async () => {
    const result = await apiClient.getAutoMLStatus(jobId);
    setStatus(result);
  };

  const interval = setInterval(poll, POLL_INTERVAL);
  poll(); // Initial fetch

  return () => clearInterval(interval);
}, [jobId, status?.status]);
```

**Progress UI Components:**

1. **Circular Progress with Percentage**
2. **Step Timeline** (vertical stepper showing completed steps)
3. **Live Log Stream** (scrolling activity feed)
4. **Current Best Model Card** (updates as better models found)
5. **Time Estimation** (elapsed / remaining)

---

### Phase 5: Results Display UI

**New file:** `frontend/src/components/AutoML/AutoMLResults.tsx`

**Results Layout:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                       🎉 Training Complete                           │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Best Model: WeightedEnsemble_L2                               │ │
│  │  Accuracy: 94.2% (AUC: 0.947)                                  │ │
│  │  Training Time: 14 minutes 32 seconds                          │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┬──────────────────────────────────────┐
│      Model Leaderboard       │        Business Summary               │
│  ┌────────────────────────┐  │  ┌────────────────────────────────┐  │
│  │ Rank │ Model   │ Score │  │  │ 🤖 AI Analysis                 │  │
│  │──────│─────────│───────│  │  │                                │  │
│  │  1   │ Ensemble│ 0.947 │  │  │ "Your model can predict        │  │
│  │  2   │ XGBoost │ 0.932 │  │  │  customer churn with 94%       │  │
│  │  3   │ LightGBM│ 0.928 │  │  │  accuracy. The most important  │  │
│  │  4   │ CatBoost│ 0.921 │  │  │  factors are: tenure (32%),    │  │
│  │  5   │ RF      │ 0.915 │  │  │  monthly_charges (24%), and    │  │
│  │  ...                   │  │  │  contract_type (18%).          │  │
│  └────────────────────────┘  │  │                                │  │
│                              │  │  💡 Recommendation:             │  │
│                              │  │  Focus retention efforts on     │  │
│                              │  │  customers with <12 month       │  │
│                              │  │  tenure and high monthly bills."│  │
│                              │  └────────────────────────────────┘  │
└──────────────────────────────┴──────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      Feature Importance                              │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  tenure              ████████████████████████████████ 32%      │ │
│  │  monthly_charges     ████████████████████████ 24%              │ │
│  │  contract_type       ██████████████████ 18%                    │ │
│  │  total_charges       ██████████████ 14%                        │ │
│  │  payment_method      ████████ 8%                               │ │
│  │  internet_service    ████ 4%                                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ℹ️  "tenure" is the #1 predictor - customers who stay longer are   │
│      much less likely to churn. Consider loyalty programs.           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      Model Performance                               │
│  ┌─────────────────────────────┬─────────────────────────────────┐  │
│  │   Confusion Matrix          │   ROC Curve                      │  │
│  │   (for classification)      │   [Interactive Plotly Chart]     │  │
│  │   ┌─────┬─────┬─────┐      │                                  │  │
│  │   │     │ Pred│ Pred│      │                                  │  │
│  │   │     │  0  │  1  │      │                                  │  │
│  │   │─────│─────│─────│      │                                  │  │
│  │   │True0│ 850 │  42 │      │                                  │  │
│  │   │True1│  18 │ 290 │      │                                  │  │
│  │   └─────┴─────┴─────┘      │                                  │  │
│  └─────────────────────────────┴─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         Next Steps                                   │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │
│  │  📥 Download   │  │  🔮 Make       │  │  📊 Generate Report    │ │
│  │     Model      │  │  Predictions   │  │     (PDF)              │ │
│  └────────────────┘  └────────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Phase 6: LLM Analysis & Interpretation

**Backend service:** `backend/app/services/automl_insights_service.py`

**Purpose:** Translate AutoGluon results into business-friendly insights

**Key Methods:**

```python
class AutoMLInsightsService:
    async def generate_summary(
        self,
        job_id: str,
        leaderboard: pd.DataFrame,
        feature_importance: Dict[str, float],
        eval_metrics: Dict[str, float],
        task_type: str,
        target_column: str,
        business_context: Optional[str] = None  # From GDM
    ) -> AutoMLInsights:
        """Generate comprehensive business-friendly insights."""

        prompt = f"""
        You are a data science advisor explaining AutoML results to a business user.

        Task: {task_type} to predict "{target_column}"

        Model Performance:
        - Best Model: {leaderboard.iloc[0]['model']}
        - {format_metrics(eval_metrics)}

        Top Features:
        {format_feature_importance(feature_importance)}

        Business Context (from data model):
        {business_context or 'General business data'}

        Provide:
        1. A 2-3 sentence executive summary suitable for a business stakeholder
        2. What the accuracy/score means in practical terms
        3. The top 3 actionable insights from feature importance
        4. One recommendation for next steps
        5. Any caveats or limitations to be aware of

        Use simple language, avoid jargon, focus on business impact.
        """

        return await self._llm.generate_structured_response(prompt, AutoMLInsights)
```

**AutoMLInsights Response Model:**
```python
class AutoMLInsights(BaseModel):
    executive_summary: str
    accuracy_explanation: str
    key_insights: List[KeyInsight]
    recommendation: str
    caveats: List[str]

class KeyInsight(BaseModel):
    feature: str
    insight: str
    business_action: str
```

**Frontend Integration:**

The `AutoMLResults.tsx` component will display:
1. **Executive Summary Card** - Top-level business interpretation
2. **"What This Means" Tooltip** - Next to each metric
3. **Feature Insight Cards** - For each top feature
4. **Recommendations Panel** - Suggested next actions

---

## File Structure Summary

### Backend (New/Modified Files)

```
backend/app/
├── services/
│   ├── autogluon_service.py          # NEW - Core AutoGluon orchestration
│   ├── automl_insights_service.py    # NEW - LLM interpretation layer
│   ├── gdm_automl.py                 # MODIFY - Add data quality signals
│   └── gdm_service.py                # MODIFY - Include enhanced profiling
├── api/routes/
│   └── automl.py                     # MODIFY - New endpoints for AutoGluon
├── models/
│   └── automl.py                     # NEW - Pydantic models for AutoML
└── config.py                         # MODIFY - AutoGluon config options
```

### Frontend (New/Modified Files)

```
frontend/src/
├── components/
│   └── AutoML/
│       ├── AutoMLWizard.tsx          # NEW - Main wizard container
│       ├── AutoMLProgress.tsx        # NEW - Training progress display
│       ├── AutoMLResults.tsx         # NEW - Results dashboard
│       ├── steps/
│       │   ├── DataSelectionStep.tsx     # NEW
│       │   ├── TargetSelectionStep.tsx   # NEW
│       │   ├── ConfigurationStep.tsx     # NEW
│       │   ├── TrainingStep.tsx          # NEW
│       │   └── ResultsStep.tsx           # NEW
│       └── charts/
│           ├── FeatureImportanceChart.tsx  # NEW
│           ├── ConfusionMatrix.tsx         # NEW
│           └── ROCCurve.tsx                # NEW
├── services/
│   └── automlApi.ts                  # NEW - AutoML API client
├── types/
│   └── automl.ts                     # NEW - TypeScript types
└── pages/
    └── AutoMLPage.tsx                # NEW - Route for /automl
```

---

## Dependencies

### Backend (requirements.txt additions)
```
autogluon.tabular>=1.1.0
```

### Notes on AutoGluon Installation
- AutoGluon has many optional dependencies
- Recommend `autogluon.tabular` only (not full `autogluon`)
- May need `torch` for certain models
- Consider creating separate requirements for AutoML features

---

## Migration Path

### Phase 1: Parallel Implementation (Recommended)
1. Keep Azure AutoML service intact
2. Add AutoGluon as alternative backend
3. Feature flag to switch between them
4. Gradual migration per customer preference

### Phase 2: Full Replacement
1. Remove Azure AutoML dependencies
2. Update all playbook references
3. Archive Azure-specific code

---

## API Compatibility

The new AutoGluon service will maintain API compatibility with existing playbook infrastructure:

| Existing Field | AutoGluon Mapping |
|----------------|-------------------|
| `task` | Supported: classification, regression, forecasting* |
| `target_column` | Direct mapping |
| `training_data` | Path or DataFrame |
| `metric` | Mapped to AutoGluon equivalents |
| `time_limit_minutes` | Converted to seconds |
| `max_trials` | Not directly used (AutoGluon auto-manages) |

*Forecasting requires `autogluon.timeseries` extension

---

## Testing Strategy

1. **Unit Tests**
   - AutoGluonService job submission/status
   - Progress tracking callbacks
   - Metric extraction

2. **Integration Tests**
   - End-to-end wizard flow
   - GDM → AutoML pipeline
   - LLM summary generation

3. **Performance Tests**
   - Memory usage during training
   - API response times during polling
   - Concurrent job handling

---

## Estimated Complexity

| Phase | Complexity | Key Risk |
|-------|------------|----------|
| Phase 1: GDM Enhancement | Low | Minimal - additive changes |
| Phase 2: AutoGluon Service | Medium | Threading, resource management |
| Phase 3: Wizard UI | Medium | UX polish, state management |
| Phase 4: Progress Tracking | Low | Polling optimization |
| Phase 5: Results UI | Medium | Chart rendering, responsiveness |
| Phase 6: LLM Integration | Low | Prompt engineering |

---

## Todo List for Implementation

### Phase 1: GDM Enhancements
- [ ] Add null percentage calculation to column profiling
- [ ] Add cardinality metrics to columns
- [ ] Add sample statistics (min/max/mean for numeric, top values for categorical)
- [ ] Add target suitability warnings to automl_guidance
- [ ] Add data readiness indicator
- [ ] Update GDM API response models
- [ ] Write tests for enhanced profiling

### Phase 2: AutoGluon Backend Service
- [ ] Create AutoGluonJobConfig dataclass
- [ ] Create JobProgress model
- [ ] Implement AutoGluonService class
- [ ] Implement background job execution with threading
- [ ] Implement progress callback mechanism
- [ ] Implement job storage (in-memory + optional persistence)
- [ ] Create API endpoints (start, status, cancel, results)
- [ ] Add AutoGluon to requirements.txt
- [ ] Update config.py with AutoGluon settings
- [ ] Write unit tests for service
- [ ] Write integration tests for API

### Phase 3: AutoML Wizard UI
- [ ] Create AutoMLWizard container component
- [ ] Implement DataSelectionStep
- [ ] Implement TargetSelectionStep with GDM recommendations
- [ ] Implement ConfigurationStep with presets
- [ ] Implement TrainingStep (progress display)
- [ ] Implement ResultsStep (summary view)
- [ ] Create automlApi.ts service
- [ ] Create TypeScript types
- [ ] Add route to App.tsx
- [ ] Style with Material-UI

### Phase 4: Progress Tracking
- [ ] Implement polling hook in frontend
- [ ] Create AutoMLProgress component
- [ ] Add circular progress indicator
- [ ] Add step timeline
- [ ] Add live log stream
- [ ] Add time estimation
- [ ] Add cancel functionality

### Phase 5: Results Display
- [ ] Create AutoMLResults dashboard layout
- [ ] Implement model leaderboard table
- [ ] Create FeatureImportanceChart (horizontal bar)
- [ ] Create ConfusionMatrix visualization
- [ ] Create ROC curve (for classification)
- [ ] Add prediction distribution chart (for regression)
- [ ] Create "Next Steps" action buttons
- [ ] Add model download functionality

### Phase 6: LLM Insights
- [ ] Create AutoMLInsightsService
- [ ] Design insight generation prompt
- [ ] Create AutoMLInsights response model
- [ ] Integrate with results endpoint
- [ ] Display executive summary in UI
- [ ] Display feature insights cards
- [ ] Display recommendations panel
- [ ] Add "explain this" tooltips

### Integration & Polish
- [ ] Connect GDM results page to new AutoML wizard
- [ ] Update PlaybookFromGDM to use new service
- [ ] Add loading states and error handling
- [ ] Add responsive design for mobile
- [ ] Performance optimization (lazy loading charts)
- [ ] End-to-end testing
- [ ] Documentation updates
