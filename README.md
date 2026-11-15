## Team

MANSOURI Ayett
MEZNED Mohamed Haroun


## Repository layout

```
.github/workflows/   CI (lint, pytest) and Docker build
data/                versioned with DVC (never in Git)
src/                 data pipeline, training, evaluation, ONNX export
backend/             FastAPI app, Pydantic schemas, ONNX inference, tests
frontend/            React app (dropzone, webcam, bounding-box canvas)
docker-compose.yml   multi-container orchestration
dvc.yaml             reproducible DVC pipeline
```

## Dataset

Primary: [American Sign Language Letters (Roboflow)](https://public.roboflow.com/object-detection/american-sign-language-letters)
(26 classes, YOLO-format export). See `docs/` and the cahier des charges for alternatives.


