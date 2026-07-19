import os
import glob
import re

for fpath in glob.glob("python_engine/**/*.py", recursive=True):
    with open(fpath, "r") as f:
        content = f.read()

    orig = content
    # The regex `re.sub(rf'\bimport {old_mod}\b', f'import {new_mod}', content)`
    # incorrectly matched `from xyz import inventory_service` and turned it into `from xyz import infra.inventory_service`.
    # Let's fix this.
    # Look for `import infra.xyz` or `import engine.xyz` where it should not be.
    # Wait, the error is `from infra.inventory_service import infra.inventory_service`.
    # This means the original text was `from inventory_service import inventory_service`.
    # Regex 2 (`from old import`) changed it to `from infra.inventory_service import inventory_service`.
    # And Regex 1 (`import old`) changed `import inventory_service` to `import infra.inventory_service`.

    # We can just fix the specific bad patterns:
    # "import infra.db_manager" -> maybe keep, but "from infra.db_manager import infra.db_manager" -> "from infra.db_manager import db_manager"

    for prefix in ["infra", "engine", "utils", "tests", "scripts", "api"]:
        # pattern: from X.Y import X.Y -> from X.Y import Y
        content = re.sub(
            rf"from ({prefix}\.([a-zA-Z0-9_]+)) import \1",
            r"from \1 import \2",
            content,
        )

        # pattern: from X import X.Y -> from X import Y (in case it was from . import inventory_service)
        # Actually just find ANY `import X.Y` that's not at the start of a line or after a comma, wait.

        # Let's fix the known ones explicitly:
        for mod in [
            "db_manager",
            "webhook_manager",
            "nexar_client",
            "inventory_service",
            "paper_engine",
            "live_engine",
            "portfolio_backtester",
            "optimize_dna",
            "scraper",
            "debug_decisions",
            "debug_log",
            "debug_sizing",
            "utils",
            "cache_manager",
            "deps",
            "test_dna_sync",
            "test_penny_engine",
            "test_pipeline",
            "memory_test",
        ]:

            bad_import_in_from = rf"import {prefix}\.{mod}"

            # If we see `from something import prefix.mod`, we replace it with `from something import mod`
            # But regex needs to ensure we only replace the import part.
            content = re.sub(
                rf"(from\s+[\w\.]+\s+import(?:\s*\(?\s*|\s*,\s*)){prefix}\.{mod}\b",
                rf"\1{mod}",
                content,
            )

    if content != orig:
        with open(fpath, "w") as f:
            f.write(content)
        print(f"Fixed {fpath}")
