import os
import shutil
from pathlib import Path
from tqdm import tqdm

# Configuración
SOURCE_DIR = Path("forest-fire-dataset")
DEST_DIR = Path("dataset_a_etiquetar")
CLASSES = ["fire", "smoke"]

def prepare_labeling_env():
    if not SOURCE_DIR.exists():
        print(f"Error: No se encuentra el directorio {SOURCE_DIR}")
        return

    # Crear directorio de destino
    if not DEST_DIR.exists():
        DEST_DIR.mkdir(parents=True)
        print(f"Creado directorio: {DEST_DIR}")

    # Crear archivo classes.txt
    with open(DEST_DIR / "classes.txt", "w") as f:
        for cls in CLASSES:
            f.write(f"{cls}\n")
    print("Creado classes.txt")

    # Buscar imágenes recursivamente
    print("Buscando imágenes...")
    extensions = ['*.jpg', '*.jpeg', '*.png']
    images = []
    for ext in extensions:
        images.extend(list(SOURCE_DIR.rglob(ext)))
    
    print(f"Encontradas {len(images)} imágenes.")
    
    # Copiar imágenes (limitamos a 100 para prueba inicial, quita el límite si quieres todas)
    # Puedes cambiar [:100] por [:] para copiar todas
    images_to_copy = images[:] 
    
    print(f"Copiando {len(images_to_copy)} imágenes a {DEST_DIR}...")
    for img_path in tqdm(images_to_copy):
        # Mantener nombre único para evitar colisiones
        new_name = f"{img_path.parent.name}_{img_path.name}"
        shutil.copy2(img_path, DEST_DIR / new_name)

    print("\n¡Listo!")
    print(f"1. Instala labelImg:  pip install labelImg")
    print(f"2. Ejecuta:           labelImg {DEST_DIR} {DEST_DIR}/classes.txt")

if __name__ == "__main__":
    prepare_labeling_env()
