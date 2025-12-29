# pip install datasets ultralytics pillow tqdm

from datasets import load_dataset
from pathlib import Path
from PIL import Image
import random, yaml
from tqdm import tqdm

OUT = Path("data_unified_yolo")
for s in ["train","val","test"]:
    (OUT/s/"images").mkdir(parents=True, exist_ok=True)
    (OUT/s/"labels").mkdir(parents=True, exist_ok=True)

CLASSES = ["fire", "smoke"]  # mínimo recomendado

def save_yolo_label(label_path, boxes):
    # boxes: list of (cls_id, x_center, y_center, w, h) normalizados [0..1]
    with open(label_path, "w") as f:
        for b in boxes:
            f.write(f"{b[0]} {b[1]:.6f} {b[2]:.6f} {b[3]:.6f} {b[4]:.6f}\n")

def normalize_bbox_xyxy(xmin, ymin, xmax, ymax, W, H):
    xc = ((xmin + xmax) / 2) / W
    yc = ((ymin + ymax) / 2) / H
    w  = (xmax - xmin) / W
    h  = (ymax - ymin) / H
    return xc, yc, w, h

def export_hf_detection_dataset(ds, split_name, source_prefix, class_map_fn):
    """
    ds: HuggingFace Dataset split
    class_map_fn: (raw_label) -> cls_id or None (para filtrar)
    Se asume que cada ejemplo trae:
      - image
      - annotations con bboxes + labels (ajustar según dataset real)
    """
    for i, ex in enumerate(tqdm(ds, desc=f"export {source_prefix}/{split_name}")):
        img = ex["image"]
        if not isinstance(img, Image.Image):
            img = Image.fromarray(img)

        W, H = img.size
        img_name = f"{source_prefix}_{split_name}_{i:07d}.jpg"
        img_path = OUT/split_name/"images"/img_name
        img.save(img_path, quality=95)

        yolo_boxes = []
        # AJUSTA ESTO según el esquema real del dataset
        for ann in ex["annotations"]:
            cls_id = class_map_fn(ann["label"])
            if cls_id is None:
                continue
            xmin, ymin, xmax, ymax = ann["bbox_xyxy"]  # ejemplo
            xc, yc, w, h = normalize_bbox_xyxy(xmin, ymin, xmax, ymax, W, H)
            yolo_boxes.append((cls_id, xc, yc, w, h))

        label_path = OUT/split_name/"labels"/(img_path.stem + ".txt")
        save_yolo_label(label_path, yolo_boxes)

# 1) cargar datasets
ds_fire = load_dataset("touati-kamel/forest-fire-dataset")
ds_smoke = load_dataset("EdBianchi/SmokeFire")

# 2) mapear labels a nuestras clases
def map_fire(raw):
    r = str(raw).lower()
    if "fire" in r:
        return 0
    if "smoke" in r:
        return 1
    return None

def map_smokefire(raw):
    r = str(raw).lower()
    if "fire" in r:
        return 0
    if "smoke" in r:
        return 1
    return None

# 3) export (ideal: split por dominio; aquí simple)
export_hf_detection_dataset(ds_fire["train"], "train", "touati", map_fire)
export_hf_detection_dataset(ds_fire.get("validation", ds_fire["train"]), "val", "touati", map_fire)

export_hf_detection_dataset(ds_smoke["train"], "train", "smokefire", map_smokefire)
export_hf_detection_dataset(ds_smoke.get("validation", ds_smoke["train"]), "val", "smokefire", map_smokefire)

# 4) data.yaml
data_yaml = {
  "path": str(OUT.resolve()),
  "train": "train/images",
  "val": "val/images",
  "test": "test/images",
  "names": {i:n for i,n in enumerate(CLASSES)}
}
with open(OUT/"data.yaml","w") as f:
    yaml.safe_dump(data_yaml, f, sort_keys=False)

print("OK:", OUT/"data.yaml")
