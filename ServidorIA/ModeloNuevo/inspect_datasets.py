from datasets import load_dataset
from pathlib import Path
import os

def inspect_local_touati():
    print("--- Inspecting Local Touati ---")
    local_path = Path("forest-fire-dataset")
    if not local_path.exists():
        print("Local path 'forest-fire-dataset' not found.")
        return

    try:
        # Try loading as imagefolder
        ds = load_dataset("imagefolder", data_dir=str(local_path), split="train", streaming=True)
        item = next(iter(ds))
        print("Keys:", item.keys())
        if 'label' in item:
            print("Label:", item['label'])
            if hasattr(ds, 'features') and 'label' in ds.features:
                print("Label Names:", ds.features['label'].names)
        
    except Exception as e:
        print(f"Error inspecting local touati: {e}")

def inspect_smokefire():
    print("\n--- Inspecting SmokeFire ---")
    try:
        ds = load_dataset("EdBianchi/SmokeFire", split="train", streaming=True)
        item = next(iter(ds))
        print("Keys:", item.keys())
        if 'label' in item:
            print("Label:", item['label'])
    except Exception as e:
        print(f"Error inspecting SmokeFire: {e}")

if __name__ == "__main__":
    inspect_local_touati()
    inspect_smokefire()
