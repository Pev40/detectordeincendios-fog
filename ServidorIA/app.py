from flask import Flask, request, jsonify
import cv2
import time
import base64
import traceback
from ultralytics import YOLO

app = Flask(__name__)

# ==========================
# CONFIG
# ==========================
CONF_FIRE = 0.25
CONF_SMOKE = 0.25
IOU_NMS = 0.45
MAX_DETECTIONS = 50
RESIZE_MAX_W = 1280

FIRE_CONFIRM_THR = 0.55
SMOKE_WARNING_THR = 0.55
COMBINED_CONFIRM_THR = 0.45

# Importante: apunta a pesos reales si puedes (local es mejor en producción)
# Si HF no funciona en tu entorno, descarga y usa ruta local.
FIRE_MODEL_ID = "touati-kamel/yolov8s-forest-fire-detection"
SMOKE_MODEL_ID = "kittendev/YOLOv8m-smoke-detection"

fire_model = None
smoke_model = None
models_error = None
models_load_time = None
models_ready = False

def log(msg):
    print(msg, flush=True)

def load_models_lazy():
    """
    Carga los modelos una sola vez.
    Si falla, guarda el error para healthcheck.
    """
    global fire_model, smoke_model, models_error, models_load_time, models_ready
    if fire_model is not None and smoke_model is not None:
        return True

    try:
        start_time = time.time()
        
        log("\n" + "="*60)
        log("[BOOT] 🔄 Iniciando carga de modelos...")
        log("="*60)
        
        log(f"[BOOT] 📥 Cargando modelo FIRE: {FIRE_MODEL_ID}")
        fire_model = YOLO(FIRE_MODEL_ID)
        log("[BOOT] ✅ Modelo FIRE cargado correctamente")

        log(f"[BOOT] 📥 Cargando modelo SMOKE: {SMOKE_MODEL_ID}")
        smoke_model = YOLO(SMOKE_MODEL_ID)
        log("[BOOT] ✅ Modelo SMOKE cargado correctamente")

        models_load_time = time.time() - start_time
        models_error = None
        models_ready = True
        
        log("="*60)
        log(f"[BOOT] ✨ TODOS LOS MODELOS LISTOS (tiempo: {models_load_time:.2f}s)")
        log("="*60 + "\n")
        
        return True

    except Exception as e:
        models_error = f"{type(e).__name__}: {e}"
        models_ready = False
        models_load_time = time.time() - start_time if 'start_time' in locals() else None
        log("[BOOT] ❌ Error cargando modelos:")
        log(traceback.format_exc())
        fire_model = None
        smoke_model = None
        return False

# ==========================
# RTSP
# ==========================
def build_gst_pipeline(rtsp_url: str) -> str:
    clean_url = rtsp_url.split("?")[0] if "?" in rtsp_url else rtsp_url
    return (
        f"rtspsrc location={clean_url} latency=50 protocols=udp ! "
        "rtph264depay ! h264parse ! avdec_h264 ! videoconvert ! appsink drop=true max-buffers=1"
    )

def capture_frame_from_rtsp(rtsp_url, timeout_ms=2500):
    cap = None
    try:
        gst = build_gst_pipeline(rtsp_url)
        cap = cv2.VideoCapture(gst, cv2.CAP_GSTREAMER)

        if not cap.isOpened():
            cap = cv2.VideoCapture(rtsp_url)

        if not cap.isOpened():
            return None, "No se pudo conectar al stream RTSP (GStreamer/FFmpeg)"

        start = time.time()
        while True:
            ret, frame = cap.read()
            if ret and frame is not None:
                return frame, None
            if (time.time() - start) * 1000 > timeout_ms:
                return None, "Timeout leyendo frame RTSP"

    except Exception as e:
        return None, f"{type(e).__name__}: {e}"
    finally:
        if cap is not None:
            cap.release()

def maybe_resize(frame):
    h, w = frame.shape[:2]
    if w > RESIZE_MAX_W:
        scale = RESIZE_MAX_W / float(w)
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return frame

def encode_jpg_base64(frame, quality=80):
    ret, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ret:
        return None
    return base64.b64encode(buf).decode("utf-8")

# ==========================
# YOLO INFER
# ==========================
def yolo_infer(model: YOLO, frame, conf, iou):
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

            boxes_out.append({
                "x1": x1 / w, "y1": y1 / h,
                "x2": x2 / w, "y2": y2 / h,
                "score": score,
                "label": label
            })

            if label not in best_by_label or score > best_by_label[label]:
                best_by_label[label] = score

    return boxes_out, best_by_label

def fuse_decision(fire_best, smoke_best):
    fire_score = max(fire_best.values()) if fire_best else 0.0
    smoke_score = max(smoke_best.values()) if smoke_best else 0.0

    if fire_score >= FIRE_CONFIRM_THR:
        return "FIRE_CONFIRMED", fire_score, smoke_score

    if fire_score >= COMBINED_CONFIRM_THR and smoke_score >= COMBINED_CONFIRM_THR:
        return "FIRE_CONFIRMED", max(fire_score, smoke_score), smoke_score

    if smoke_score >= SMOKE_WARNING_THR:
        return "SMOKE_WARNING", smoke_score, smoke_score

    return "NORMAL", max(fire_score, smoke_score), smoke_score

# ==========================
# ROUTES
# ==========================
@app.route("/health", methods=["GET"])
def health():
    ok = load_models_lazy()
    return jsonify({
        "ok": ok,
        "models_ready": models_ready,
        "fire_model_loaded": fire_model is not None,
        "smoke_model_loaded": smoke_model is not None,
        "models_error": models_error,
        "models_load_time_seconds": models_load_time
    }), (200 if ok else 500)

@app.route("/analyze", methods=["POST"])
def analyze():
    ts_jetson_start = int(time.time() * 1000)
    image_base64 = None  # SIEMPRE definido

    try:
        if not load_models_lazy():
            return jsonify({"error": "Models not loaded", "detail": models_error}), 500

        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400

        rtsp_url = data.get("rtsp_url")
        event_id = data.get("event_id", "unknown")
        sensor_data = data.get("sensors", {})

        log(f"[ANALYZE] event_id={event_id} rtsp={rtsp_url} sensors={sensor_data}")

        if not rtsp_url:
            return jsonify({"error": "RTSP URL missing"}), 400

        if "rtsp_transport" not in rtsp_url:
            sep = "&" if "?" in rtsp_url else "?"
            rtsp_url = f"{rtsp_url}{sep}rtsp_transport=udp"

        t0 = time.time()
        frame, err = capture_frame_from_rtsp(rtsp_url)
        t_rtsp = int((time.time() - t0) * 1000)
        if frame is None:
            return jsonify({"error": f"RTSP Error: {err}", "timings_ms": {"rtsp": t_rtsp}}), 500

        frame = maybe_resize(frame)

        # Infer FIRE
        t1 = time.time()
        fire_boxes, fire_best = yolo_infer(fire_model, frame, conf=CONF_FIRE, iou=IOU_NMS)
        t_fire = int((time.time() - t1) * 1000)

        # Infer SMOKE
        t2 = time.time()
        smoke_boxes, smoke_best = yolo_infer(smoke_model, frame, conf=CONF_SMOKE, iou=IOU_NMS)
        t_smoke = int((time.time() - t2) * 1000)

        state, confidence, smoke_conf = fuse_decision(fire_best, smoke_best)

        if bool(data.get("include_image", False)):
            image_base64 = encode_jpg_base64(frame, quality=80)

        ts_end = int(time.time() * 1000)

        return jsonify({
            "event_id": event_id,
            "state": state,
            "fireDetected": state == "FIRE_CONFIRMED",
            "smokeDetected": state in ["SMOKE_WARNING", "FIRE_CONFIRMED"],
            "confidence": float(confidence),
            "confidence_smoke": float(smoke_conf),
            "detections": {
                "fire_model": {
                    "model_id": FIRE_MODEL_ID,
                    "best_by_label": fire_best,
                    "boxes": fire_boxes
                },
                "smoke_model": {
                    "model_id": SMOKE_MODEL_ID,
                    "best_by_label": smoke_best,
                    "boxes": smoke_boxes
                }
            },
            "image_base64": image_base64,
            "ts": int(time.time() * 1000),
            "timestamps": {"jetson_start": ts_jetson_start, "jetson_end": ts_end},
            "timings_ms": {"rtsp": t_rtsp, "infer_fire": t_fire, "infer_smoke": t_smoke}
        })

    except Exception as e:
        log("[ERROR] analyze failed:")
        log(traceback.format_exc())
        return jsonify({
            "error": f"{type(e).__name__}: {e}",
            "trace": traceback.format_exc().splitlines()[-8:],  # últimos frames para debug
        }), 500

if __name__ == "__main__":
    # Cargar modelos antes de iniciar el servidor
    log("\n" + "="*60)
    log("[MAIN] Iniciando servidor Flask...")
    log("="*60)
    
    models_loaded = load_models_lazy()
    
    if models_loaded:
        log("[MAIN] ✅ Servidor listo para recibir requests")
        log("[MAIN] 📍 GET http://localhost:5000/health - Ver estado de modelos")
        log("[MAIN] 📍 POST http://localhost:5000/analyze - Procesar frames")
    else:
        log("[MAIN] ⚠️  ADVERTENCIA: Modelos no cargados, el servidor intentará cargarlos en la primera request")
    
    # Para debug ok. En prod: gunicorn -w 1 -b 0.0.0.0:5000 app:app --timeout 60
    app.run(host="0.0.0.0", port=5000)
