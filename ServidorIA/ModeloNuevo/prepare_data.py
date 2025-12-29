import os
import yaml
import shutil
from pathlib import Path
from datasets import load_dataset
from PIL import Image
from tqdm import tqdm
import numpy as np

# Configuration
OUTPUT_DIR = Path("data_unified_yolo")
DATASET_TOUATI = "touati-kamel/forest-fire-dataset"
DATASET_TOUATI_LOCAL = Path("forest-fire-dataset") # Local path
DATASET_SMOKEFIRE = "EdBianchi/SmokeFire"
# Fallback detection dataset if others are classification only
DATASET_FALLBACK = "keremberke/fire-object-detection" 

CLASSES = ["fire", "smoke"]
CLASS_MAP = {
    "fire": 0,
    "smoke": 1,
    "neutral": -1  # Background
}

def setup_directories():
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    
    for split in ["train", "val", "test"]:
        (OUTPUT_DIR / split / "images").mkdir(parents=True, exist_ok=True)
        (OUTPUT_DIR / split / "labels").mkdir(parents=True, exist_ok=True)

def normalize_bbox(bbox, width, height):
    # bbox format check: usually [xmin, ymin, xmax, ymax] or [xmin, ymin, w, h]
    # HuggingFace datasets 'objects' usually have 'bbox' as [x, y, w, h] (COCO) or [xmin, ymin, xmax, ymax] (VOC)
    # We need to check the dataset features or assume COCO [x, y, w, h] which is common in 'objects' feature.
    # However, let's try to be robust.
    
    # Assuming COCO format [xmin, ymin, width, height] which is standard for HF 'objects' sequence
    x, y, w, h = bbox
    
    # Convert to YOLO [x_center, y_center, w, h] normalized
    x_center = (x + w / 2) / width
    y_center = (y + h / 2) / height
    w_norm = w / width
    h_norm = h / height
    
    return [x_center, y_center, w_norm, h_norm]

def process_dataset(dataset_name, split_mapping, source_tag, is_local=False):
    print(f"Processing {dataset_name}...")
    ds = None
    try:
        if is_local:
            print(f"  Loading local dataset from {dataset_name}...")
            ds = load_dataset("imagefolder", data_dir=str(dataset_name))
        else:
            # Try loading the auto-converted parquet revision first
            # This downloads large parquet files instead of thousands of small images
            print("  Attempting to load Parquet revision (fast)...")
            ds = load_dataset(dataset_name, revision="refs/convert/parquet")
    except Exception as e:
        if not is_local:
            print(f"  Parquet load failed ({e}), falling back to streaming (slow)...")
            try:
                ds = load_dataset(dataset_name, streaming=True)
            except Exception as e2:
                print(f"  Error loading {dataset_name}: {e2}")
                return
        else:
            print(f"  Error loading local dataset {dataset_name}: {e}")
            return

    for hf_split, yolo_split in split_mapping.items():
        if hf_split not in ds:
            print(f"Split {hf_split} not found in {dataset_name}, skipping.")
            continue
            
        data = ds[hf_split]
        print(f"  Converting {hf_split} -> {yolo_split}...")
        
        for i, item in enumerate(tqdm(data)):
            image = item['image']
            
            # Handle case where image is a dict (e.g. streaming/parquet without auto-decode)
            if isinstance(image, dict) and 'bytes' in image:
                import io
                image = Image.open(io.BytesIO(image['bytes']))
            
            if image.mode != "RGB":
                image = image.convert("RGB")
            
            width, height = image.size
            image_id = f"{source_tag}_{hf_split}_{i:06d}"
            image_path = OUTPUT_DIR / yolo_split / "images" / f"{image_id}.jpg"
            label_path = OUTPUT_DIR / yolo_split / "labels" / f"{image_id}.txt"
            
            # Save Image
            image.save(image_path, quality=90)
            
            # Process Labels
            yolo_labels = []
            
            # Check for objects/annotations
            if 'objects' in item:
                # Detection dataset
                objects = item['objects']
                # Check if it has categories
                if 'category' in objects:
                    categories = objects['category']
                    bboxes = objects['bbox']
                    
                    for cat, bbox in zip(categories, bboxes):
                        # Map category ID to name if possible, or use direct ID if standard
                        # This part is tricky without knowing the dataset's features.
                        # We'll assume standard mapping or try to infer.
                        # For now, let's assume the dataset has a 'features' attribute to map int to str
                        
                        # Get class name
                        class_name = "unknown"
                        if hasattr(data.features['objects'].feature['category'], 'names'):
                            names = data.features['objects'].feature['category'].names
                            if cat < len(names):
                                class_name = names[cat].lower()
                        else:
                            # Fallback: assume 0=fire, 1=smoke if not specified? Dangerous.
                            pass

                        # Map to our classes
                        cid = -1
                        if "fire" in class_name:
                            cid = 0
                        elif "smoke" in class_name:
                            cid = 1
                        
                        if cid != -1:
                            norm_box = normalize_bbox(bbox, width, height)
                            yolo_labels.append(f"{cid} {' '.join(map(str, norm_box))}")
                            
            elif 'label' in item:
                # Classification dataset?
                # If it's classification, we can't generate boxes.
                # BUT, if it's a "Normal" image (negative), we can use it as background (empty label file).
                label = item['label']
                # Get label name
                label_name = "unknown"
                if hasattr(data.features['label'], 'names'):
                    names = data.features['label'].names
                    if label < len(names):
                        label_name = names[label].lower()
                
                if "normal" in label_name or "neutral" in label_name:
                    # It's a background image!
                    pass # Empty yolo_labels list is correct
                elif "fire" in label_name or "smoke" in label_name:
                    # It's a positive image but we don't have boxes.
                    # We should SKIP it for detection training, or use it for classification.
                    # For this pipeline, we skip positive images without boxes.
                    continue 
            
            # Save Label File (even if empty, for background images)
            with open(label_path, "w") as f:
                f.write("\n".join(yolo_labels))

def create_yaml():
    yaml_content = {
        "path": str(OUTPUT_DIR.absolute()),
        "train": "train/images",
        "val": "val/images",
        "test": "test/images",
        "names": {
            0: "fire",
            1: "smoke"
        }
    }
    
    with open(OUTPUT_DIR / "data.yaml", "w") as f:
        yaml.dump(yaml_content, f, sort_keys=False)

if __name__ == "__main__":
    setup_directories()
    
    # Process Touati (Check if detection)
    # Note: Touati might be classification. If so, we might need another dataset.
    # Let's try to process it.
    # if DATASET_TOUATI_LOCAL.exists():
    #     # Local dataset usually loads 'val' folder as 'validation' split
    #     process_dataset(DATASET_TOUATI_LOCAL, {"train": "train", "validation": "val", "test": "test"}, "touati", is_local=True)
    # else:
    #     process_dataset(DATASET_TOUATI, {"train": "train", "val": "val", "test": "test"}, "touati")
    
    # Process SmokeFire
    # Note: SmokeFire has 'Normal' class which is good for background.
    # process_dataset(DATASET_SMOKEFIRE, {"train": "train", "validation": "val", "test": "test"}, "smokefire")
    
    # Process Fallback if needed (Keremberke is definitely detection)
    print(f"Using dataset with labels: {DATASET_FALLBACK}")
    process_dataset(DATASET_FALLBACK, {"train": "train", "validation": "val", "test": "test"}, "keremberke")
    
    create_yaml()
    print("Dataset preparation complete.")
