import time
import numpy as np
import onnxruntime as ort
from PIL import Image
import io

# ASL classes A-Z
CLASSES = [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"
]

MODEL_VERSION = "yolov8n-asl-e1"


class YOLOInference:
    def __init__(self, model_path: str, input_size: int = 416, conf_threshold: float = 0.25, iou_threshold: float = 0.45):
        self.input_size = input_size
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.model_version = MODEL_VERSION

        # Load ONNX model
        self.session = ort.InferenceSession(
            model_path,
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
        )
        self.input_name = self.session.get_inputs()[0].name

    def preprocess(self, image_bytes: bytes) -> tuple[np.ndarray, int, int]:
        """Load image bytes, resize to input_size, normalize to [0,1]."""
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        orig_w, orig_h = image.size

        resized = image.resize((self.input_size, self.input_size))
        img_array = np.array(resized, dtype=np.float32) / 255.0
        # HWC -> CHW -> NCHW
        img_array = img_array.transpose(2, 0, 1)[np.newaxis, :]

        return img_array, orig_w, orig_h

    def postprocess(self, output: np.ndarray, orig_w: int, orig_h: int) -> list[dict]:
        """Parse YOLO output, apply confidence filter and NMS, rescale boxes."""
        predictions = output[0]  # shape: (1, 30, 8400) → transpose to (8400, 30)
        predictions = predictions.squeeze(0).T  # (8400, 30)

        detections = []
        for pred in predictions:
            # first 4 values: cx, cy, w, h
            # remaining 26: class scores
            cx, cy, w, h = pred[:4]
            class_scores = pred[4:]
            class_id = int(np.argmax(class_scores))
            confidence = float(class_scores[class_id])

            if confidence < self.conf_threshold:
                continue

            # Convert from center format to corner format
            # Coordinates are relative to input_size → rescale to original
            x1 = (cx - w / 2) / self.input_size * orig_w
            y1 = (cy - h / 2) / self.input_size * orig_h
            x2 = (cx + w / 2) / self.input_size * orig_w
            y2 = (cy + h / 2) / self.input_size * orig_h

            detections.append({
                "label": CLASSES[class_id],
                "confidence": round(confidence, 4),
                "bbox": {
                    "x1": round(float(x1), 2),
                    "y1": round(float(y1), 2),
                    "x2": round(float(x2), 2),
                    "y2": round(float(y2), 2),
                }
            })

        # Simple NMS
        detections = self._nms(detections)
        return detections

    def _nms(self, detections: list[dict]) -> list[dict]:
        """Non-Maximum Suppression to remove overlapping boxes."""
        if not detections:
            return []

        detections = sorted(detections, key=lambda x: x["confidence"], reverse=True)
        kept = []

        while detections:
            best = detections.pop(0)
            kept.append(best)
            detections = [
                d for d in detections
                if self._iou(best["bbox"], d["bbox"]) < self.iou_threshold
            ]

        return kept

    def _iou(self, box1: dict, box2: dict) -> float:
        """Compute Intersection over Union between two boxes."""
        x1 = max(box1["x1"], box2["x1"])
        y1 = max(box1["y1"], box2["y1"])
        x2 = min(box1["x2"], box2["x2"])
        y2 = min(box1["y2"], box2["y2"])

        intersection = max(0, x2 - x1) * max(0, y2 - y1)
        area1 = (box1["x2"] - box1["x1"]) * (box1["y2"] - box1["y1"])
        area2 = (box2["x2"] - box2["x1"]) * (box2["y2"] - box2["y1"])
        union = area1 + area2 - intersection

        return intersection / union if union > 0 else 0.0

    def predict(self, image_bytes: bytes) -> tuple[list[dict], float]:
        """Full inference pipeline. Returns detections and inference time in ms."""
        img, orig_w, orig_h = self.preprocess(image_bytes)

        start = time.perf_counter()
        output = self.session.run(None, {self.input_name: img})
        elapsed_ms = (time.perf_counter() - start) * 1000

        detections = self.postprocess(output, orig_w, orig_h)
        return detections, round(elapsed_ms, 2)