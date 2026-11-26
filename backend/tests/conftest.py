"""Fixtures partagees : les tests ne dependent PAS du fichier best.onnx
(il est versionne par DVC et absent en CI)."""
import pytest
from fastapi.testclient import TestClient

import app.main as main


class FakeEngine:
    """Remplace YOLOInference : renvoie toujours une detection 'A'."""

    conf_threshold = 0.25
    iou_threshold = 0.45

    def predict(self, image_bytes):
        detections = [
            {
                "label": "A",
                "confidence": 0.9,
                "bbox": {"x1": 10.0, "y1": 10.0, "x2": 100.0, "y2": 120.0},
            }
        ]
        return detections, 12.3


@pytest.fixture
def client(monkeypatch):
    """Client avec un moteur factice charge (le lifespan n'est pas execute)."""
    monkeypatch.setattr(main, "engine", FakeEngine())
    return TestClient(main.app)


@pytest.fixture
def client_no_model(monkeypatch):
    """Client sans modele charge : l'API doit repondre 503."""
    monkeypatch.setattr(main, "engine", None)
    return TestClient(main.app)
