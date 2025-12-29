from ultralytics import YOLO
import os

# Rutas relativas
MODEL_PATH = os.path.join("external_repos", "luminous_yolov8", "weights", "best.pt")
IMAGE_PATH = os.path.join("external_repos", "luminous_yolov8", "train_batch0.jpg")

def test_model():
    if not os.path.exists(MODEL_PATH):
        print(f"Error: No se encuentra el modelo en {MODEL_PATH}")
        return
    
    if not os.path.exists(IMAGE_PATH):
        print(f"Error: No se encuentra la imagen en {IMAGE_PATH}")
        return

    print(f"Cargando modelo desde {MODEL_PATH}...")
    try:
        model = YOLO(MODEL_PATH)
    except Exception as e:
        print(f"Error al cargar el modelo: {e}")
        return

    print(f"Realizando inferencia en {IMAGE_PATH}...")
    results = model(IMAGE_PATH)

    for result in results:
        boxes = result.boxes
        print(f"Detectados {len(boxes)} objetos.")
        for box in boxes:
            cls = int(box.cls[0])
            conf = float(box.conf[0])
            name = model.names[cls]
            print(f" - Clase: {name}, Confianza: {conf:.2f}")
        
        # Guardar resultado
        result.save(filename="test_result.jpg")
        print("Resultado guardado en test_result.jpg")

if __name__ == "__main__":
    test_model()
