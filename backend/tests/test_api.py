import io

import numpy as np
from PIL import Image


# -- Helpers ------------------------------------------------------------------
def make_fake_image(width=416, height=416) -> bytes:
    """Image noire JPEG pour les tests."""
    img = Image.fromarray(np.zeros((height, width, 3), dtype=np.uint8))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def post_image(client, url="/predict"):
    return client.post(url, files={"file": ("test.jpg", make_fake_image(), "image/jpeg")})


# -- /health ------------------------------------------------------------------
def test_health_returns_200(client):
    assert client.get("/health").status_code == 200


def test_health_schema(client):
    data = client.get("/health").json()
    for key in ("status", "model_loaded", "model_version", "device"):
        assert key in data
    assert data["model_loaded"] is True


def test_health_without_model(client_no_model):
    data = client_no_model.get("/health").json()
    assert data["model_loaded"] is False


# -- /model/metadata ----------------------------------------------------------
def test_metadata_returns_200(client):
    assert client.get("/model/metadata").status_code == 200


def test_metadata_has_26_classes(client):
    assert len(client.get("/model/metadata").json()["classes"]) == 26


def test_metadata_map50_above_threshold(client):
    assert client.get("/model/metadata").json()["map50"] >= 0.90


def test_metadata_503_without_model(client_no_model):
    assert client_no_model.get("/model/metadata").status_code == 503


# -- /predict -----------------------------------------------------------------
def test_predict_valid_image(client):
    response = post_image(client)
    assert response.status_code == 200
    data = response.json()
    assert {"detections", "inference_time_ms", "model_version"} <= set(data)
    assert data["inference_time_ms"] == 12.3


def test_predict_invalid_file_type(client):
    response = client.post("/predict", files={"file": ("test.txt", b"not an image", "text/plain")})
    assert response.status_code == 400


def test_predict_empty_file(client):
    response = client.post("/predict", files={"file": ("empty.jpg", b"", "image/jpeg")})
    assert response.status_code == 400


def test_predict_detection_schema(client):
    data = post_image(client).json()
    assert len(data["detections"]) == 1
    det = data["detections"][0]
    assert det["label"] == "A"
    assert 0.0 <= det["confidence"] <= 1.0
    assert all(k in det["bbox"] for k in ("x1", "y1", "x2", "y2"))


def test_predict_confidence_query_param(client):
    response = client.post(
        "/predict?conf=0.8&iou=0.5",
        files={"file": ("test.jpg", make_fake_image(), "image/jpeg")},
    )
    assert response.status_code == 200


def test_predict_rejects_out_of_range_conf(client):
    response = client.post(
        "/predict?conf=2",
        files={"file": ("test.jpg", make_fake_image(), "image/jpeg")},
    )
    assert response.status_code == 422


def test_predict_503_without_model(client_no_model):
    assert post_image(client_no_model).status_code == 503


# -- /predict/visualize -------------------------------------------------------
def test_visualize_returns_image(client):
    response = post_image(client, "/predict/visualize")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"


def test_visualize_invalid_file_type(client):
    response = client.post(
        "/predict/visualize", files={"file": ("test.pdf", b"fake", "application/pdf")}
    )
    assert response.status_code == 400
