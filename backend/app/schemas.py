from pydantic import BaseModel, Field
from typing import List


class BoundingBox(BaseModel):
    x1: float = Field(..., description="Left coordinate")
    y1: float = Field(..., description="Top coordinate")
    x2: float = Field(..., description="Right coordinate")
    y2: float = Field(..., description="Bottom coordinate")


class Detection(BaseModel):
    label: str = Field(..., description="Predicted ASL letter")
    confidence: float = Field(..., ge=0.0, le=1.0)
    bbox: BoundingBox


class PredictResponse(BaseModel):
    detections: List[Detection]
    inference_time_ms: float
    model_version: str


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_version: str
    device: str


class ModelMetadata(BaseModel):
    model_version: str
    architecture: str
    input_size: int
    classes: List[str]
    map50: float
    map50_95: float