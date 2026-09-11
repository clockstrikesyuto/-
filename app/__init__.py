from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE_PATH = ROOT / "app.py"

spec = importlib.util.spec_from_file_location("_dino_dash_core", BASE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("Could not load DINO DASH core")
core = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = core
spec.loader.exec_module(core)

stage_css = (ROOT / "stage2.css").read_text(encoding="utf-8")
stage_js = (ROOT / "stage2.js").read_text(encoding="utf-8")

core.HTML = core.HTML.replace("</style>", stage_css + "\n</style>", 1)
core.HTML = core.HTML.replace("</body>", f"<script>\n{stage_js}\n</script>\n</body>", 1)

app = core.app
