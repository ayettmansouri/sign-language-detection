import os
import io
import cv2
import numpy as np
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import (
    HealthResponse,
    ModelMetadata,
    PredictResponse,
    Detection,
    BoundingBox,
)
from app.inference import YOLOInference, CLASSES, MODEL_VERSION

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_PATH = os.getenv("MODEL_PATH", "models/best.onnx")
INPUT_SIZE = int(os.getenv("INPUT_SIZE", 416))

# Global inference engine (loaded once at startup)
engine: YOLOInference = None


# ── Lifespan (replaces deprecated @app.on_event) ─────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    engine = YOLOInference(
        model_path=MODEL_PATH,
        input_size=INPUT_SIZE,
    )
    print(f"Model loaded from {MODEL_PATH}")
    yield
    engine = None
    print("Model unloaded")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Sign Language Detection API",
    description="Real-time ASL alphabet detection using YOLOv8n + ONNX Runtime",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ───────────────────────────────────────────────────────────────────
COLORS = {
    letter: (
        int((i * 47) % 255),
        int((i * 97) % 255),
        int((i * 157) % 255),
    )
    for i, letter in enumerate(CLASSES)
}


def _check_engine():
    if engine is None:
        raise HTTPException(status_code=503, detail="Model not loaded")


def _validate_image(file: UploadFile):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{file.content_type}'. Only JPEG, PNG, WEBP accepted."
        )


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse)
def health():
    """Server status and model availability."""
    return HealthResponse(
        status="ok",
        model_loaded=engine is not None,
        model_version=MODEL_VERSION,
        device="CPU",
    )


@app.get("/model/metadata", response_model=ModelMetadata)
def model_metadata():
    """Model architecture, classes and validation metrics."""
    _check_engine()
    return ModelMetadata(
        model_version=MODEL_VERSION,
        architecture="YOLOv8n",
        input_size=INPUT_SIZE,
        classes=CLASSES,
        map50=0.945,
        map50_95=0.790,
    )


@app.post("/predict", response_model=PredictResponse)
async def predict(
    file: UploadFile = File(...),
    conf: float = Query(default=0.25, ge=0.0, le=1.0, description="Confidence threshold"),
    iou: float = Query(default=0.45, ge=0.0, le=1.0, description="IoU threshold for NMS"),
):
    """Run detection on an uploaded image. Returns detections as JSON."""
    _check_engine()
    _validate_image(file)

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file received")

    engine.conf_threshold = conf
    engine.iou_threshold = iou

    detections_raw, inference_time_ms = engine.predict(image_bytes)

    detections = [
        Detection(
            label=d["label"],
            confidence=d["confidence"],
            bbox=BoundingBox(**d["bbox"]),
        )
        for d in detections_raw
    ]

    return PredictResponse(
        detections=detections,
        inference_time_ms=inference_time_ms,
        model_version=MODEL_VERSION,
    )


@app.post("/predict/visualize")
async def predict_visualize(
    file: UploadFile = File(...),
    conf: float = Query(default=0.25, ge=0.0, le=1.0),
    iou: float = Query(default=0.45, ge=0.0, le=1.0),
):
    """Run detection and return the annotated image with bounding boxes."""
    _check_engine()
    _validate_image(file)

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file received")

    engine.conf_threshold = conf
    engine.iou_threshold = iou

    detections_raw, inference_time_ms = engine.predict(image_bytes)

    # Draw boxes on image
    img_array = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    for d in detections_raw:
        x1, y1, x2, y2 = (
            int(d["bbox"]["x1"]),
            int(d["bbox"]["y1"]),
            int(d["bbox"]["x2"]),
            int(d["bbox"]["y2"]),
        )
        label = d["label"]
        conf_score = d["confidence"]
        color = COLORS.get(label, (255, 0, 255))

        # Draw bounding box
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)

        # Draw label background
        text = f"{label} {conf_score:.2f}"
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
        cv2.rectangle(img, (x1, y1 - th - 8), (x1 + tw, y1), color, -1)

        # Draw label text
        cv2.putText(img, text, (x1, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

    # Encode back to JPEG
    _, buffer = cv2.imencode(".jpg", img)
    return Response(content=buffer.tobytes(), media_type="image/jpeg")