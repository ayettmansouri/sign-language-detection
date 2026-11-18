# Sign Language Detection — Progress Report
**Team:** Ayett Mansouri · Mohamed Haroun Mezned  
**Supervisor:** Haythem Ghazouani  
**Module:** Deep Learning Avancé + MLOps — TEK-UP 2026–2027  
**Repository:** https://github.com/ayettmansouri/sign-language-detection

---

## What We Did

### 1. Repository & MLOps Setup (Jalon 1) ✅

- Initialized the Git repository with the structure defined in the cahier des charges
- Configured **DVC** for data and model versioning (local remote: `dvc-storagesign-language/`)
- Added `dvc-storagesign-language/` and `models/` to `.gitignore` to keep large files out of Git
- Wrote `requirements.txt` covering all dependencies: Ultralytics, MLflow, DVC, FastAPI, OpenCV, pytest

### 2. Dataset ✅

- **Source:** American Sign Language Letters — [Roboflow Universe](https://universe.roboflow.com/david-lee-d0rhs/american-sign-language-letters/dataset/6), author David Lee
- **Task:** Object detection (bounding boxes)
- **Classes:** 26 (A–Z)
- **Version used:** v6

| Split | Images |
|-------|--------|
| Train | 2 016  |
| Valid | 288    |
| Test  | 144    |
| **Total** | **2 448** |

- Fixed `data.yaml` paths from Roboflow's default `../train/images` to relative paths compatible with our repo structure
- Tracked raw data with DVC: `dvc add data/raw` → `data/raw.dvc` committed to Git

### 3. Training — Experiment E1 ✅

**Configuration:**

| Parameter | Value |
|-----------|-------|
| Model | YOLOv8n (pretrained on COCO) |
| Input size | 416 × 416 px |
| Epochs | 50 |
| Batch size | 16 |
| Optimizer | AdamW (auto) |
| Hardware | Google Colab — Tesla T4 GPU |
| Training time | ~11 minutes |

**MLflow tracking enabled** — experiment name: `sign-language`, run logged to `sqlite:////content/mlflow.db`

### 4. Results — E1 (YOLOv8n) ✅

#### Overall Metrics (validation set)

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| mAP@0.5 | **0.945** | ≥ 0.90 | ✅ Exceeded |
| mAP@0.5:0.95 | **0.790** | ≥ 0.65 | ✅ Exceeded |
| Precision | **0.894** | — | ✅ |
| Recall | **0.890** | — | ✅ |

#### Per-Class mAP@0.5 (best.pt validation)

| Class | mAP@0.5 | Note |
|-------|---------|------|
| A | 0.995 | ✅ |
| B | 0.995 | ✅ |
| C | 0.995 | ✅ |
| D | 0.995 | ✅ |
| E | 0.995 | ✅ |
| F | 0.995 | ✅ |
| G | 0.995 | ✅ |
| H | 0.925 | ✅ |
| **I** | **0.531** | ⚠️ Weakest — visually similar to J/Y |
| J | 0.995 | ✅ (dynamic sign, limit known) |
| **K** | **0.803** | ⚠️ |
| L | 0.895 | ✅ |
| M | 0.971 | ✅ |
| N | 0.945 | ✅ |
| O | 0.995 | ✅ |
| P | 0.995 | ✅ |
| Q | 0.995 | ✅ |
| R | 0.995 | ✅ |
| S | 0.995 | ✅ |
| T | 0.875 | ✅ |
| U | 0.995 | ✅ |
| **V** | **0.800** | ⚠️ |
| W | 0.995 | ✅ |
| X | 0.995 | ✅ |
| Y | 0.908 | ✅ |
| Z | 0.995 | ✅ (dynamic sign, limit known) |

**Weak classes (I, K, V)** are visually similar to neighbouring signs. These will be discussed in the report's limitations section and addressed with temporal voting in the webcam pipeline.

### 5. Model Export ✅

- Exported `best.pt` → `best.onnx` (FP32, imgsz=416)
- Both files tracked with DVC: `models/best.pt.dvc`, `models/best.onnx.dvc`

---

## Current State of the Repository

```
sign-language-detection/
├── .dvc/                  ✅ DVC initialized
├── .github/workflows/     ❌ CI not yet written
├── data/
│   ├── raw/               ✅ Dataset in place (tracked by DVC)
│   └── processed/         ⬜ Not yet needed
├── models/
│   ├── best.pt.dvc        ✅ Tracked by DVC
│   └── best.onnx.dvc      ✅ Tracked by DVC
├── src/
│   ├── data/              ⬜ dataset.py not yet written
│   ├── models/            ⬜ train.py / evaluate.py not yet written
│   └── utils/             ⬜ empty
├── backend/               ❌ Not yet created
├── frontend/              ❌ Not yet created
├── docker-compose.yml     ❌ Not yet created
├── dvc.yaml               ❌ Not yet created
├── requirements.txt       ✅
└── README.md              ✅
```

---

## What Comes Next (Jalon 2 → Jalon 4)

### Immediate — Backend (FastAPI) 🔜
- `backend/app/inference.py` — ONNX Runtime inference engine
- `backend/app/schemas.py` — Pydantic request/response models
- `backend/app/main.py` — `/health`, `/predict`, `/predict/visualize` endpoints
- `backend/tests/test_api.py` — pytest coverage
- `backend/Dockerfile` — multi-stage build

### Next — `src/` pipeline scripts
- `src/models/train.py` — MLflow-tracked training script
- `src/models/evaluate.py` — metrics + confusion matrix
- `dvc.yaml` — reproducible pipeline

### Then — Frontend (React)
- Drag & drop image upload
- Webcam real-time detection
- Bounding box canvas overlay
- Confidence bar display

### Finally — DevOps
- `docker-compose.yml` orchestrating frontend + backend + MLflow
- `.github/workflows/ci-tests.yml` — lint + pytest
- `.github/workflows/docker-build.yml` — image build check

### Optional — Experiment E2
- YOLOv8s at 640px to compare precision vs latency against E1

---

## Known Limitations

| Limitation | Mitigation |
|-----------|------------|
| J and Z require motion (dynamic signs) | Documented as known limit; trajectory tracking as future work |
| I, K, V have lower per-class mAP | Temporal voting over N frames will stabilize predictions |
| Dataset from controlled conditions | Webcam robustness test planned with our own images |
| No real drift monitoring (academic context) | Simulated with held-out webcam images |
