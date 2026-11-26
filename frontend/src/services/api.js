import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const http = axios.create({ baseURL: BASE_URL, timeout: 10000 });

/**
 * POST /predict
 * @param {Blob|File} file  image JPEG/PNG/WEBP
 * @param {{conf?: number, iou?: number, signal?: AbortSignal}} opts
 * @returns {Promise<{detections: Array<{label:string, confidence:number,
 *   bbox:{x1:number,y1:number,x2:number,y2:number}}>, inference_time_ms:number, model_version:string}>}
 * Les coordonnees de bbox sont en pixels de l'image envoyee.
 */
export async function predictImage(file, { conf = 0.25, iou = 0.45, signal } = {}) {
  const form = new FormData();
  form.append('file', file, file.name ?? 'frame.jpg');
  const { data } = await http.post('/predict', form, { params: { conf, iou }, signal });
  return data;
}

/** POST /predict/visualize -> Blob JPEG annote */
export async function visualizeImage(file, { conf = 0.25, iou = 0.45, signal } = {}) {
  const form = new FormData();
  form.append('file', file, file.name ?? 'image.jpg');
  const { data } = await http.post('/predict/visualize', form, {
    params: { conf, iou },
    responseType: 'blob',
    signal,
  });
  return data;
}

export async function getHealth() {
  const { data } = await http.get('/health');
  return data;
}

export async function getModelMetadata() {
  const { data } = await http.get('/model/metadata');
  return data;
}
