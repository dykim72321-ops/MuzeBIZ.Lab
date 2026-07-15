import os
import shutil
import re
from glob import glob

base_dir = "python_engine"

# Define the moves: (source file, target directory)
moves = [
    ("test_dna_sync.py", "tests"),
    ("test_penny_engine.py", "tests"),
    ("test_pipeline.py", "tests"),
    ("memory_test.py", "tests"),
    ("paper_engine.py", "engine"),
    ("live_engine.py", "engine"),
    ("portfolio_backtester.py", "engine"),
    ("db_manager.py", "infra"),
    ("webhook_manager.py", "infra"),
    ("nexar_client.py", "infra"),
    ("inventory_service.py", "infra"),
    ("optimize_dna.py", "scripts"),
    ("scraper.py", "scripts"),
    ("debug_decisions.py", "scripts"),
    ("debug_log.py", "scripts"),
    ("debug_sizing.py", "scripts"),
    ("utils.py", "utils"),
    ("cache_manager.py", "utils"),
    ("deps.py", "api"),
]

# Create directories
dirs = set([tgt for _, tgt in moves])
for d in dirs:
    os.makedirs(os.path.join(base_dir, d), exist_ok=True)
    # create __init__.py so they are treated as packages
    init_path = os.path.join(base_dir, d, "__init__.py")
    if not os.path.exists(init_path):
        with open(init_path, "w") as f:
            pass

# Move files
module_mapping = {}
for src, tgt in moves:
    src_path = os.path.join(base_dir, src)
    if os.path.exists(src_path):
        tgt_path = os.path.join(base_dir, tgt, src)
        shutil.move(src_path, tgt_path)

        mod_name = src.replace(".py", "")
        new_mod_name = f"{tgt}.{mod_name}"
        module_mapping[mod_name] = new_mod_name
        print(f"Moved {src} -> {tgt_path}")

print("Module mapping:")
for k, v in module_mapping.items():
    print(f"  {k} -> {v}")

# Update imports in all .py files
py_files = glob(os.path.join(base_dir, "**", "*.py"), recursive=True)

for fpath in py_files:
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()

    original_content = content

    # 1. Update "import module" to "import target.module"
    for old_mod, new_mod in module_mapping.items():
        # Using word boundaries to avoid partial matches
        content = re.sub(rf"\bimport {old_mod}\b", f"import {new_mod}", content)

    # 2. Update "from module import" to "from target.module import"
    for old_mod, new_mod in module_mapping.items():
        content = re.sub(
            rf"\bfrom {old_mod} import\b", f"from {new_mod} import", content
        )

    if content != original_content:
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Updated imports in {fpath}")

print("Refactoring complete.")
