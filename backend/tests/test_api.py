import io
import pytest
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from app.main import app

client = TestClient(app)


# ── Helpers ───────────────────────────────────────────────────────────────────
def make_fake_image(width=416, height=416) -> bytes:
    """Generate a simple black image as JPEG bytes for testing."""
    img = Image.fromarray(np.zeros((height, width, 3), dtype=np.uint8))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ── /health ───────────────────────────────────────────────────────────────────
def test_health_returns_200():
    response = client.get("/health")
    assert response.status_code == 200


def test_health_schema():
    response = client.get("/health")
    data = response.json()
    assert "status" in data
    assert "model_loaded" in data
    assert "model_version" in data
    assert "device" in data


# ── /model/metadata ───────────────────────────────────────────────────────────
def test_metadata_returns_200():
    response = client.get("/model/metadata")
    assert response.status_code == 200


def test_metadata_has_26_classes():
    response = client.get("/model/metadata")
    data = response.json()
    assert len(data["classes"]) == 26


def test_metadata_map50_above_threshold():
    response = client.get("/model/metadata")
    data = response.json()
    assert data["map50"] >= 0.90


# ── /predict ──────────────────────────────────────────────────────────────────
def test_predict_valid_image():
    image_bytes = make_fake_image()
    response = client.post(
        "/predict",
        files={"file": ("test.jpg", image_bytes, "image/jpeg")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "detections" in data
    assert "inference_time_ms" in data
    assert "model_version" in data


def test_predict_invalid_file_type():
    response = client.post(
        "/predict",
        files={"file": ("test.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 400


def test_predict_empty_file():
    response = client.post(
        "/predict",
        files={"file": ("empty.jpg", b"", "image/jpeg")},
    )
    assert response.status_code == 400


def test_predict_detection_schema():
    image_bytes = make_fake_image()
    response = client.post(
        "/predict",
        files={"file": ("test.jpg", image_bytes, "image/jpeg")},
    )
    data = response.json()
    for det in data["detections"]:
        assert "label" in det
        assert "confidence" in det
        assert "bbox" in det
        assert all(k in det["bbox"] for k in ("x1", "y1", "x2", "y2"))
        assert 0.0 <= det["confidence"] <= 1.0
        assert det["label"] in list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")


def test_predict_confidence_query_param():
    image_bytes = make_fake_image()
    response = client.post(
        "/predict?conf=0.8",
        files={"file": ("test.jpg", image_bytes, "image/jpeg")},
    )
    assert response.status_code == 200


# ── /predict/visualize ────────────────────────────────────────────────────────
def test_visualize_returns_image():
    image_bytes = make_fake_image()
    response = client.post(
        "/predict/visualize",
        files={"file": ("test.jpg", image_bytes, "image/jpeg")},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"


def test_visualize_invalid_file_type():
    response = client.post(
        "/predict/visualize",
        files={"file": ("test.pdf", b"fake", "application/pdf")},
    )
    assert response.status_code == 400