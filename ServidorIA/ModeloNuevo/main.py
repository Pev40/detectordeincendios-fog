from ultralytics import YOLO

model = YOLO("yolov8s.pt")
model.train(
    data="data_unified_yolo/data.yaml",
    imgsz=640,
    epochs=100,
    batch=16,
    optimizer="AdamW",
    cos_lr=True,
    close_mosaic=10,
)
