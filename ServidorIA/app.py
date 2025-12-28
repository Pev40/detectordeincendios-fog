from flask import Flask, request, jsonify
import cv2
import time
import base64
from ultralytics import YOLO

app = Flask(__name__)

# ==========================
# CONFIG (ajusta a tu caso)
# ==========================
CONF_FIRE = 0.25          # umbral detección fuego (baja para no perder eventos)
CONF_SMOKE = 0.25         # umbral detección humo
IOU_NMS = 0.45
MAX_DETECTIONS = 50

# Resize opcional para bajar latencia (mantiene suficiente detalle)
# Si tu cámara es 1080p, esto ayuda bastante en Jetson.
RESIZE_MAX_W = 1280

# Fusión (paper-friendly): estados simples
FIRE_CONFIRM_THR = 0.55       # fuego confirmado visual
SMOKE_WARNING_THR = 0.55      # humo fuerte
COMBINED_CONFIRM_THR = 0.45   # combinación humo+fuego (si ambos aparecen)

# ==========================
# LOAD MODELS
# ==========================
fire_model = None
smoke_model = None

def load_models():
    global fire_model, smoke_model
    try:
        print("Cargando modelo FIRE (touati-kamel/yolov8s-forest-fire-detection)...")
        fire_model = YOLO("touati-kamel/yolov8s-forest-fire-detection")
        print("Modelo FIRE cargado.")

        print("Cargando modelo SMOKE (kittendev/YOLOv8m-smoke-detection)...")
        smoke_model = YOLO("kittendev/YOLOv8m-smoke-detection")
        print("Modelo SMOKE cargado.")

    except Exception as e:
        print(f"Error cargando modelos: {e}")
        fire_model = None
        smoke_model = None

load_models()

# ==========================
# RTSP CAPTURE
# ==========================
def build_gst_pipeline(rtsp_url: str) -> str:
    clean_url = rtsp_url.split("?")[0] if "?" in rtsp_url else rtsp_url
    # Latency bajo + UDP + decode + appsink
    return (
        f"rtspsrc location={clean_url} latency=50 protocols=udp ! "
        "rtph264depay ! h264parse ! avdec_h264 ! videoconvert ! appsink drop=true max-buffers=1"
    )

def capture_frame_from_rtsp(rtsp_url, timeout_ms=2000):
    """
    Captura 1 frame. Intenta GStreamer (Jetson-friendly), fallback FFmpeg/OpenCV.
    """
    cap = None
    try:
        # GStreamer first
        gst_pipeline = build_gst_pipeline(rtsp_url)
        cap = cv2.VideoCapture(gst_pipeline, cv2.CAP_GSTREAMER)

        if not cap.isOpened():
            # Fallback to FFmpeg
            cap = cv2.VideoCapture(rtsp_url)

        if not cap.isOpened():
            return None, "No se pudo conectar al stream RTSP (GStreamer/FFmpeg)"

        # Timeout: OpenCV no maneja timeout perfecto, pero al menos limitamos lectura
        start = time.time()
        while True:
            ret, frame = cap.read()
            if ret and frame is not None:
                return frame, None
            if (time.time() - start) * 1000 > timeout_ms:
                return None, "Timeout leyendo frame del RTSP"

    except Exception as e:
        return None, str(e)
    finally:
        if cap is not None:
            cap.release()

def maybe_resize(frame):
    h, w = frame.shape[:2]
    if w > RESIZE_MAX_W:
        scale = RESIZE_MAX_W / float(w)
        new_w = int(w * scale)
        new_h = int(h * scale)
        frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return frame

# ==========================
# DETECTION UTILS
# ==========================
def yolo_infer(model: YOLO, frame, conf, iou):
    """
    Ejecuta inferencia YOLO y devuelve boxes normalizadas + mejor score por clase relevante.
    """
    results = model.predict(
        source=frame,
        conf=conf,
        iou=iou,
        verbose=False,
        max_det=MAX_DETECTIONS
    )

    h, w = frame.shape[:2]
    boxes_out = []
    best_by_label = {}

    for r in results:
        if r.boxes is None:
            continue
        for b in r.boxes:
            cls_id = int(b.cls[0])
            score = float(b.conf[0])
            x1, y1, x2, y2 = b.xyxy[0].tolist()
            label = model.names.get(cls_id, str(cls_id))

            # Normalizar coords
            boxes_out.append({
                "x1": x1 / w, "y1": y1 / h,
                "x2": x2 / w, "y2": y2 / h,
                "score": score,
                "label": label
            })

            # track best per label
            if (label not in best_by_label) or (score > best_by_label[label]):
                best_by_label[label] = score

    return boxes_out, best_by_label

def safe_encode_jpg_base64(frame, quality=80):
    ret, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ret:
        return None
    return base64.b64encode(buf).decode("utf-8")

def sanitize_rtsp_for_log(url):
    if not url:
        return url
    if "@" in url and "://" in url:
        try:
            prefix = url.split("://")[0]
            rest = url.split("@")[-1]
            return f"{prefix}://****:****@{rest}"
        except:
            return url
    return url

def fuse_decision(best_fire, best_smoke):
    """
    Paper-friendly fusion:
    - SMOKE_WARNING si humo fuerte
    - FIRE_CONFIRMED si fuego fuerte
    - FIRE_CONFIRMED también si ambos aparecen moderados (humo+fuego)
    - NORMAL si nada relevante
    """
    fire_score = max(best_fire.values()) if best_fire else 0.0
    smoke_score = max(best_smoke.values()) if best_smoke else 0.0

    # Confirmación directa
    if fire_score >= FIRE_CONFIRM_THR:
        return "FIRE_CONFIRMED", fire_score, smoke_score

    # Confirmación por combinación
    if (fire_score >= COMBINED_CONFIRM_THR) and (smoke_score >= COMBINED_CONFIRM_THR):
        # alinear score de salida al más alto de ambos
        return "FIRE_CONFIRMED", max(fire_score, smoke_score), smoke_score

    # Warning por humo
    if smoke_score >= SMOKE_WARNING_THR:
        return "SMOKE_WARNING", smoke_score, smoke_score

    return "NORMAL", max(fire_score, smoke_score), smoke_score

# ==========================
# API
# ==========================
@app.route("/analyze", methods=["POST"])
def analyze():
    ts_jetson_start = int(time.time() * 1000)

    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400

        rtsp_url = data.get("rtsp_url")
        event_id = data.get("event_id", "unknown")
        sensor_data = data.get("sensors", {})  # se conserva, pero NO inventa visión

        print(f"Analyze event_id={event_id} rtsp={sanitize_rtsp_for_log(rtsp_url)} sensors={sensor_data}")

        if not rtsp_url:
            return jsonify({"error": "RTSP URL missing"}), 400

        # Fuerza UDP en FFmpeg si no viene
        if "rtsp_transport" not in rtsp_url:
            sep = "&" if "?" in rtsp_url else "?"
            rtsp_url = f"{rtsp_url}{sep}rtsp_transport=udp"

        frame, err = capture_frame_from_rtsp(rtsp_url)
        if frame is None:
            return jsonify({"error": f"RTSP Error: {err}"}), 500

        frame = maybe_resize(frame)

        if fire_model is None or smoke_model is None:
            return jsonify({"error": "Models not loaded"}), 500

        # 1) Inferencia fuego
        fire_boxes, fire_best = yolo_infer(fire_model, frame, conf=CONF_FIRE, iou=IOU_NMS)

        # 2) Inferencia humo
        smoke_boxes, smoke_best = yolo_infer(smoke_model, frame, conf=CONF_SMOKE, iou=IOU_NMS)

        # 3) Fusión
        state, confidence, smoke_conf = fuse_decision(fire_best, smoke_best)

        # 4) Empaquetar respuesta
        include_image = bool(data.get("include_image", False))
        image_base64 = safe_encode_jpg_base64(frame, quality=80) if include_image else None

        ts_end = int(time.time() * 1000)

        response_data = {
            "event_id": event_id,
            "state": state,                       # NORMAL / SMOKE_WARNING / FIRE_CONFIRMED
            "fireDetected": state == "FIRE_CONFIRMED",
            "smokeDetected": state in ["SMOKE_WARNING", "FIRE_CONFIRMED"],
            "confidence": float(confidence),
            "confidence_smoke": float(smoke_conf),
            "detections": {
                "fire_model": {
                    "model_id": "touati-kamel/yolov8s-forest-fire-detection",
                    "best_by_label": fire_best,
                    "boxes": fire_boxes
                },
                "smoke_model": {
                    "model_id": "kittendev/YOLOv8m-smoke-detection",
                    "best_by_label": smoke_best,
                    "boxes": smoke_boxes
                }
            },
            "ts": int(time.time() * 1000),
            "timestamps": {
                "jetson_start": ts_jetson_start,
                "jetson_end": ts_end
            },
            "image_base64": image_base64
        }

        return jsonify(response_data)

    except Exception as e:
        print(f"Error processing analyze: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Para producción fog, normalmente se corre con gunicorn/uvicorn detrás.
    app.run(host="0.0.0.0", port=5000)
