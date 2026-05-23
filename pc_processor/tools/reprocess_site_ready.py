#!/usr/bin/env python3
"""Re-publie site-ready depuis un run Meshroom (cache Texturing, sans relancer Meshroom)."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = SCRIPT_DIR.parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from meshroom_monitor import (  # noqa: E402
    check_texturing_output_ready,
    resolve_meshroom_cache_watch_dirs,
)
from meshroom_pipeline import (  # noqa: E402
    _clear_site_ready,
    _expand_meshroom_search_roots,
    _find_textured_mesh,
    finalize_from_texturing_cache,
    publish_site_ready,
    write_meshroom_output_inventory,
)
from run_isolation import get_allowed_search_roots, read_run_manifest  # noqa: E402

TEXTURING_LOG_RE = re.compile(
    r"([A-Za-z]:[^\\s'\"]*?MeshroomCache[/\\]Texturing[/\\][^\\s'\"]+)",
    re.IGNORECASE,
)


def _read_run_status(output_dir: Path) -> Dict[str, Any]:
    path = output_dir / "logs" / "run_status.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _discover_texturing_paths_from_logs(output_dir: Path) -> List[Path]:
    found: List[Path] = []
    seen: set[str] = set()
    logs_dir = output_dir / "logs"

    def add(path: Path) -> None:
        if not path.exists():
            return
        key = str(path.resolve())
        if key not in seen:
            seen.add(key)
            found.append(path.resolve())

    for log_name in ("meshroom_stdout.log", "meshroom_stderr.log"):
        log_path = logs_dir / log_name
        if not log_path.is_file():
            continue
        try:
            text = log_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for match in TEXTURING_LOG_RE.finditer(text):
            raw = match.group(1).strip().strip("'\"")
            p = Path(raw)
            if p.is_dir():
                add(p)
            elif p.parent.is_dir():
                add(p.parent)

    return found


def _build_search_roots(output_dir: Path, work_dir: Path) -> List[Path]:
    status = _read_run_status(output_dir)
    fallback_raw = status.get("fallback_root") or ""
    fallback_root = Path(fallback_raw) if fallback_raw else None

    manifest = read_run_manifest(output_dir) or {}
    if not fallback_root and manifest.get("fallback_root"):
        fallback_root = Path(manifest["fallback_root"])

    roots = _expand_meshroom_search_roots(work_dir, output_dir, fallback_root=fallback_root)
    allowed = get_allowed_search_roots(work_dir, output_dir, fallback_root)
    merged: List[Path] = []
    seen: set[str] = set()

    def add(path: Path) -> None:
        if not path.exists():
            return
        key = str(path.resolve())
        if key not in seen:
            seen.add(key)
            merged.append(path.resolve())

    for extra in (
        work_dir / "meshroom_cache" / "MeshroomCache" / "Texturing",
        work_dir / "meshroom_cache" / "Texturing",
        work_dir / "meshroom_cache",
    ):
        add(extra)

    if fallback_root:
        for extra in (
            fallback_root / "temp" / "MeshroomCache" / "Texturing",
            fallback_root / "temp" / "MeshroomCache",
            fallback_root / "meshroom_cache" / "MeshroomCache" / "Texturing",
            fallback_root / "meshroom_cache",
        ):
            add(extra)

    cache_raw = status.get("cache_folder") or ""
    if cache_raw:
        cache_dir = Path(cache_raw)
        add(cache_dir)
        add(cache_dir / "MeshroomCache" / "Texturing")
        add(cache_dir / "MeshroomCache")

    for tpath in _discover_texturing_paths_from_logs(output_dir):
        add(tpath)
        if tpath.name.lower() == "texturing":
            for node in tpath.iterdir():
                if node.is_dir():
                    add(node)

    for root in roots + allowed:
        add(root)

    return merged


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Re-genere site-ready depuis run Meshroom (cache Texturing, Publish optionnel)"
    )
    parser.add_argument("output_dir", help="Dossier run (ex. output_gui/run_20260520_121658)")
    parser.add_argument(
        "--force-publish",
        action="store_true",
        help="Utiliser publish_site_ready au lieu de finalize_from_texturing_cache",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir).resolve()
    work_dir = output_dir / "work"
    if not output_dir.is_dir():
        print("[reprocess] Dossier run introuvable :", output_dir)
        return 2

    _clear_site_ready(output_dir / "site-ready")
    status = _read_run_status(output_dir)
    fallback_raw = status.get("fallback_root") or ""
    fallback_root = Path(fallback_raw) if fallback_raw else None
    manifest = read_run_manifest(output_dir)

    search_roots = _build_search_roots(output_dir, work_dir)
    print("[reprocess] Racines de recherche : %d" % len(search_roots))

    watch_dirs = resolve_meshroom_cache_watch_dirs(
        work_dir / "meshroom_cache",
        fallback_root,
    )
    texturing_info = check_texturing_output_ready(watch_dirs)
    print(
        "[reprocess] Texturing output pret : %s"
        % ("oui" if texturing_info.get("texturing_output_ready") else "non")
    )
    if texturing_info.get("texturing_output_path"):
        print("[reprocess] Chemin Texturing :", texturing_info["texturing_output_path"])

    image_count = int(status.get("image_count") or 0)

    if not args.force_publish and texturing_info.get("texturing_output_ready"):
        published = finalize_from_texturing_cache(
            output_dir,
            work_dir,
            image_count=image_count,
            log=print,
            manifest=manifest,
            fallback_root=fallback_root,
        )
    else:
        mesh_info = _find_textured_mesh(search_roots, require_textures=True)
        if not mesh_info:
            print("[reprocess] Aucun OBJ texturé Meshroom detecte.")
            if texturing_info.get("textured_mesh_obj"):
                print("[reprocess] texturedMesh.obj signale mais invalide (MTL/texture/map_Kd).")
            return 6
        print("[reprocess] OBJ :", mesh_info["obj"])
        published = publish_site_ready(output_dir, mesh_info, image_count=image_count, log=print)

    write_meshroom_output_inventory(search_roots, output_dir, fallback_root=fallback_root)

    if published.get("success"):
        print("[reprocess] OK :", published.get("site_ready_model"))
        if published.get("finalized_from_texturing"):
            print("[reprocess] Source : cache Texturing (Publish non requis)")
        return 0
    print("[reprocess] ECHEC :", published.get("message"))
    for err in published.get("errors", []):
        print("  -", err)
    return 7


if __name__ == "__main__":
    sys.exit(main())
