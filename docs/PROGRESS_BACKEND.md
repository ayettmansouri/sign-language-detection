# Sign Language Detection — Backend & MLOps Progress
**Team:** Ayett Mansouri · Mohamed Haroun Mezned  
**Supervisor:** Haythem Ghazouani  
**Date:** 2026-11-18  
**Continuation of:** PROGRESS.md (Training — E1 YOLOv8n)

---

## What We Did

### 1. Model Export ✅

After training on Google Colab (Tesla T4):
- Exported `best.pt` → `best.onnx` (FP32, imgsz=416, dynamic=False)
- Both files downloaded locally and tracked with DVC:

```
models/best.pt.dvc
models/best.onnx.dvc
```

- Added `dvc-storagesign-language/` to `.gitignore` to prevent local DVC storage from entering Git
- Committed and pushed `.dvc` pointer files to GitHub

---

### 2. Backend — FastAPI Application ✅

Built a full REST API under `backend/` following the cahier des charges spec.

#### File structure created:
```
backend/
├── Dockerfile              ✅ multi-stage build
├── requirements.txt        ✅
├── app/
│   ├── __init__.py
│   ├── schemas.py          ✅ Pydantic models
│   ├── inference.py        ✅ ONNX Runtime engine
│   └── main.py             ✅ FastAPI endpoints
└── tests/
    ├── __init__.py
    └── test_api.py         ✅ pytest coverage
```

#### API Endpoints implemented:

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Server status, model loaded, version |
| GET | `/model/metadata` | Architecture, 26 classes, mAP metrics |
| POST | `/predict` | Upload image → JSON detections |
| POST | `/predict/visualize` | Upload image → annotated JPEG |

#### Example `/predict` response:
```json
{
  "detections": [
    {
      "label": "A",
      "confidence": 0.94,
      "bbox": {"x1": 112, "y1": 80, "x2": 310, "y2": 301}
    }
  ],
  "inference_time_ms": 38.2,
  "model_version": "yolov8n-asl-e1"
}
```

#### Key implementation details:
- **ONNX Runtime** loads `best.onnx` at startup via lifespan context
- **Preprocessing**: resize to 416×416, normalize [0,1], HWC→NCHW
- **Postprocessing**: parse raw YOLO output (8400 anchors × 30 values), filter by confidence, apply NMS
- **Visualization**: OpenCV draws colored bounding boxes + labels per class
- **Query params**: `conf` and `iou` thresholds adjustable per request
- **Error handling**: 400 for invalid file type, 400 for empty file, 503 if model not loaded

---

### 3. Tests — pytest ✅

12 tests written in `backend/tests/test_api.py`:

| Test | Validates |
|------|-----------|
| `test_health_returns_200` | `/health` responds |
| `test_health_schema` | all fields present |
| `test_metadata_returns_200` | `/model/metadata` responds |
| `test_metadata_has_26_classes` | exactly 26 ASL classes |
| `test_metadata_map50_above_threshold` | mAP50 ≥ 0.90 |
| `test_predict_valid_image` | happy path |
| `test_predict_invalid_file_type` | 400 on non-image |
| `test_predict_empty_file` | 400 on empty upload |
| `test_predict_detection_schema` | all fields valid + confidence in [0,1] |
| `test_predict_confidence_query_param` | `conf` param accepted |
| `test_visualize_returns_image` | returns JPEG |
| `test_visualize_invalid_file_type` | 400 on non-image |

---

### 4. Docker — Multi-stage Build ✅

`backend/Dockerfile` uses a two-stage build:

| Stage | Role |
|-------|------|
| `builder` | Installs Python dependencies with build tools |
| `runtime` | Copies only installed packages — no build tools |

- Fixed Debian Trixie incompatibility: replaced `libgl1-mesa-glx` → `libgl1`
- Model file (`best.onnx`) mounted as a **volume** at runtime — not baked into the image
- Non-root user (`appuser`) for security

---

### 5. Docker Compose ✅

`docker-compose.yml` orchestrates two services:

| Service | Container | Port | Role |
|---------|-----------|------|------|
| `backend` | `asl_backend` | 8000 | FastAPI + ONNX inference |
| `mlflow` | `asl_mlflow` | 5000 | Experiment tracking UI |

```bash
# Launch everything with one command (cahier des charges ENF-03)
docker-compose up --build
```

Resolved issues during setup:
- `libgl1-mesa-glx` removed in Debian Trixie → replaced with `libgl1`
- MLflow db version mismatch (Colab vs Docker) → re-logged results via Python API
- MLflow backend store URI path mismatch → fixed to `sqlite:////mlflow/mlruns/mlflow.db`
- Upgraded MLflow image from `v2.14.1` → `v3.18.0` to match Colab version

---

### 6. MLflow — Experiment Tracking ✅

E1 run logged to `http://localhost:5000` under experiment `sign-language`:

| Parameter | Value |
|-----------|-------|
| model | yolov8n |
| imgsz | 416 |
| epochs | 50 |
| batch | 16 |
| optimizer | AdamW |
| dataset | ASL-Letters-Roboflow-v6 |
| train_images | 2016 |

| Metric | Value |
|--------|-------|
| mAP50 | 0.945 |
| mAP50_95 | 0.790 |
| precision | 0.894 |
| recall | 0.890 |

Artifacts logged: `best.pt`, `best.onnx`

---

## Current Repository State

```
sign-language-detection/
├── .dvc/                        ✅ DVC initialized
├── .github/workflows/           ❌ CI not yet written
├── data/raw/                    ✅ Dataset tracked by DVC
├── models/
│   ├── best.pt.dvc              ✅ Tracked by DVC
│   └── best.onnx.dvc            ✅ Tracked by DVC
├── mlruns/                      ✅ MLflow runs stored here
├── backend/
│   ├── Dockerfile               ✅
│   ├── requirements.txt         ✅
│   ├── app/
│   │   ├── schemas.py           ✅
│   │   ├── inference.py         ✅
│   │   └── main.py              ✅
│   └── tests/test_api.py        ✅
├── frontend/                    ❌ Not yet created
├── docker-compose.yml           ✅
├── dvc.yaml                     ❌ Not yet created
└── docs/PROGRESS.md             ✅ Previous progress report
```

---

## What Comes Next

### Frontend (React + Vite) 🔜
- Project scaffold with Vite + TailwindCSS
- `/predict` image upload with drag & drop
- `/predict/visualize` bounding box canvas overlay
- Webcam real-time detection (getUserMedia)
- Confidence bars per detected class
- Latency display (client + server)

### Pipeline scripts
- `src/models/train.py` — MLflow-tracked training script
- `src/models/evaluate.py` — metrics + confusion matrix
- `dvc.yaml` — reproducible DVC pipeline

### CI/CD (GitHub Actions)
- `ci-tests.yml` — flake8, black, ESLint, pytest on every push
- `docker-build.yml` — verify Docker images build correctly
