#!/usr/bin/env python3
"""Isolation stricte des runs Meshroom : un ZIP = un dossier = une provenance prouvee."""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from pc_processor_core import ensure_directory

MESHROOM_RUNS_ROOT = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "MeshroomRuns"
RUN_DIR_PATTERN = re.compile(r"^run_\d{8}_\d{6}_[a-f0-9]{8}$", re.I)


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(chunk_size)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hash_image_file(path: Path, sample_bytes: int = 65536) -> Optional[str]:
    try:
        digest = hashlib.sha256()
        digest.update(path.name.encode("utf-8"))
        with path.open("rb") as handle:
            digest.update(handle.read(sample_bytes))
        return digest.hexdigest()[:16]
    except OSError:
        return None


def build_run_manifest(
    dataset_input: Path,
    images_dir: Path,
    image_count: int,
    run_id: str,
) -> Dict[str, Any]:
    source = Path(dataset_input)
    if source.is_file():
        input_sha256 = sha256_file(source)
        stat = source.stat()
        input_size = stat.st_size
        input_mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        input_label = source.name
    else:
        payload = str(source.resolve()).encode("utf-8")
        for child in sorted(images_dir.glob("*.jpg"))[:3]:
            payload += child.name.encode()
        input_sha256 = sha256_bytes(payload)
        input_size = 0
        input_mtime = ""
        input_label = source.name + "/"

    sample_images = sorted(images_dir.glob("*.jpg")) + sorted(images_dir.glob("*.jpeg"))
    first_hashes = [hash_image_file(p) for p in sample_images[:5]]
    last_hashes = [hash_image_file(p) for p in sample_images[-5:]]
    first_hashes = [h for h in first_hashes if h]
    last_hashes = [h for h in last_hashes if h]

    return {
        "run_id": run_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "input_zip": str(source.resolve()),
        "input_name": input_label,
        "input_sha256": input_sha256,
        "input_sha256_short": input_sha256[:8],
        "input_size": input_size,
        "input_mtime": input_mtime,
        "image_count": image_count,
        "images_dir": str(images_dir.resolve()),
        "first_image_hashes": first_hashes,
        "last_image_hashes": last_hashes,
    }


def write_run_manifest(run_dir: Path, manifest: Dict[str, Any]) -> Path:
    run_dir = Path(run_dir)
    logs_dir = ensure_directory(run_dir / "logs")
    root_path = run_dir / "run_manifest.json"
    logs_path = logs_dir / "run_manifest.json"
    text = json.dumps(manifest, indent=2, ensure_ascii=False)
    root_path.write_text(text, encoding="utf-8")
    logs_path.write_text(text, encoding="utf-8")
    return root_path


def read_run_manifest(run_dir: Path) -> Optional[Dict[str, Any]]:
    for candidate in (Path(run_dir) / "run_manifest.json", Path(run_dir) / "logs" / "run_manifest.json"):
        if candidate.is_file():
            try:
                return json.loads(candidate.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                pass
    return None


def allocate_run_directory(base_output: Path, input_sha256_short: str) -> Tuple[Path, str]:
    """Cree output_gui/run_YYYYMMDD_HHMMSS_<hash8>/ — jamais la racine output_gui."""
    base_output = ensure_directory(Path(base_output))
    short = (input_sha256_short or "00000000")[:8].lower()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_id = "run_%s_%s" % (stamp, short)
    run_dir = base_output / run_id
    if run_dir.exists():
        clean_run_workspace(run_dir)
    ensure_directory(run_dir)
    return run_dir, run_id


def is_isolated_run_dir(path: Path) -> bool:
    return bool(RUN_DIR_PATTERN.match(Path(path).name))


def clean_run_workspace(run_dir: Path) -> None:
    """Supprime tout artefact d'un run precedent dans ce dossier."""
    run_dir = Path(run_dir)
    for name in (
        "site-ready",
        "work",
        "logs",
        "preview.html",
        "open_preview.bat",
        "run_manifest.json",
        "MESHROOM_OUTPUT_AUDIT.md",
        "MESHROOM_REAL_OUTPUT_INVENTORY.md",
    ):
        target = run_dir / name
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
        elif target.is_file():
            try:
                target.unlink()
            except OSError:
                pass
    ensure_directory(run_dir / "logs")


def get_isolated_fallback_root(run_id: str) -> Path:
    """Cache Meshroom dedie au run (pas %TEMP%\\MeshroomCache global)."""
    return ensure_directory(MESHROOM_RUNS_ROOT / run_id)


def build_isolated_subprocess_env(fallback_root: Path, meshroom_root: Optional[Path] = None) -> Dict[str, str]:
    fallback_root = ensure_directory(fallback_root)
    temp_dir = ensure_directory(fallback_root / "temp")
    env = os.environ.copy()
    env["TEMP"] = str(temp_dir)
    env["TMP"] = str(temp_dir)
    env["TMPDIR"] = str(temp_dir)
    env["MESHROOM_CACHE"] = str(fallback_root / "meshroom_cache")
    if meshroom_root:
        env["PATH"] = str(meshroom_root) + os.pathsep + env.get("PATH", "")
    return env


def get_allowed_search_roots(
    work_dir: Path,
    output_dir: Path,
    fallback_root: Optional[Path] = None,
) -> List[Path]:
    """Uniquement les dossiers du run courant — jamais %TEMP%/MeshroomCache global."""
    roots: List[Path] = []
    seen: set[str] = set()

    def add(path: Path) -> None:
        if not path.exists():
            return
        key = str(path.resolve())
        if key not in seen:
            seen.add(key)
            roots.append(path.resolve())

    work_dir = Path(work_dir)
    output_dir = Path(output_dir)
    for candidate in (
        work_dir / "meshroom_out",
        work_dir / "meshroom_cache",
        work_dir / "images",
        output_dir / "work" / "meshroom_out",
        output_dir / "work" / "meshroom_cache",
    ):
        add(candidate)

    if fallback_root:
        fb = Path(fallback_root)
        for name in ("meshroom_out", "meshroom_cache", "images", "temp"):
            add(fb / name)
        add(fb / "temp" / "MeshroomCache")
        add(fb / "meshroom_cache" / "MeshroomCache")

    return roots


def path_is_under(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def path_in_global_meshroom_cache(path: Path) -> bool:
    text = str(path.resolve()).replace("/", "\\").lower()
    return "\\meshroomcache\\" in text and "\\temp\\" in text


def validate_mesh_provenance(
    mesh_info: Dict[str, Any],
    allowed_roots: List[Path],
    images_dir: Path,
    run_started_epoch: float,
    manifest: Dict[str, Any],
) -> Tuple[bool, str]:
    obj_path = Path(mesh_info["obj"]).resolve()
    allowed = [Path(r).resolve() for r in allowed_roots if Path(r).exists()]

    if not allowed:
        return False, "Aucune racine de recherche autorisee pour ce run."

    if not any(path_is_under(obj_path, root) for root in allowed):
        if path_in_global_meshroom_cache(obj_path):
            return False, (
                "Modele dans le cache global %TEMP%\\MeshroomCache — "
                "refuse (pas lie au run courant)."
            )
        return False, "Modele hors des dossiers du run courant : %s" % obj_path

    if path_in_global_meshroom_cache(obj_path):
        return False, "Modele dans cache global Temp interdit : %s" % obj_path

    try:
        obj_mtime = obj_path.stat().st_mtime
        if obj_mtime < run_started_epoch - 2.0:
            return False, (
                "Fichier modele plus ancien que le demarrage du run "
                "(mtime=%s, run_start=%s)."
                % (obj_mtime, run_started_epoch)
            )
    except OSError as exc:
        return False, "Impossible de lire la date du modele : %s" % exc

    images_dir = Path(images_dir).resolve()
    if not images_dir.is_dir():
        return False, "Dossier images du run introuvable."

    return True, ""


def validate_manifest_match(summary_manifest_sha: Optional[str], manifest: Dict[str, Any]) -> bool:
    if not summary_manifest_sha or not manifest.get("input_sha256"):
        return False
    return summary_manifest_sha == manifest["input_sha256"]


def write_source_manifest(site_dir: Path, manifest: Dict[str, Any], mesh_source: str) -> Path:
    site_dir = ensure_directory(site_dir)
    payload = dict(manifest)
    payload["mesh_source_path"] = mesh_source
    payload["site_ready_at"] = datetime.now(timezone.utc).isoformat()
    path = site_dir / "source_manifest.json"
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def generate_meshroom_preview_html(
    run_dir: Path,
    manifest: Dict[str, Any],
    glb_path: Optional[Path],
) -> Path:
    run_dir = Path(run_dir)
    glb_rel = "site-ready/site_model.glb" if glb_path and glb_path.is_file() else ""
    glb_abs = str(glb_path.resolve()) if glb_path and glb_path.is_file() else "(absent)"
    html = """<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>Preview run %(run_id)s</title>
  <style>
    body { font-family: Segoe UI, sans-serif; margin: 16px; background: #1a1a1a; color: #eee; }
    .warn { color: #f88; font-weight: bold; }
    .ok { color: #8f8; }
    model-viewer { width: 100%%; height: 70vh; background: #333; }
  </style>
  <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
</head>
<body>
  <h1>Preview — run courant</h1>
  <p><b>ZIP :</b> %(input_name)s</p>
  <p><b>SHA256 (8) :</b> <code>%(sha_short)s</code> — complet : <code>%(sha_full)s</code></p>
  <p><b>Run ID :</b> <code>%(run_id)s</code></p>
  <p><b>Images :</b> %(image_count)s</p>
  <p><b>GLB affiche :</b> <code>%(glb_abs)s</code></p>
  <p id="status" class="%(status_class)s">%(status_msg)s</p>
  %(viewer)s
  <p><small>Ouvrir uniquement ce fichier depuis le dossier du run en cours.</small></p>
</body>
</html>
""" % {
        "run_id": manifest.get("run_id", "?"),
        "input_name": manifest.get("input_name", manifest.get("input_zip", "?")),
        "sha_short": manifest.get("input_sha256_short", "?"),
        "sha_full": manifest.get("input_sha256", "?"),
        "image_count": manifest.get("image_count", 0),
        "glb_abs": glb_abs,
        "status_class": "ok" if glb_rel else "warn",
        "status_msg": (
            "Modele GLB du run courant charge."
            if glb_rel
            else "ERREUR : site_model.glb absent pour ce run."
        ),
        "viewer": (
            '<model-viewer src="%s" camera-controls auto-rotate shadow-intensity="1"></model-viewer>'
            % glb_rel
            if glb_rel
            else "<p class='warn'>Aucun GLB a afficher.</p>"
        ),
    }
    preview_path = run_dir / "preview.html"
    preview_path.write_text(html, encoding="utf-8")

    bat = run_dir / "open_preview.bat"
    bat.write_text(
        '@echo off\nstart "" "%~dp0preview.html"\n',
        encoding="utf-8",
    )
    return preview_path


def allocate_run_for_input(base_output: Path, dataset_input: Path) -> Tuple[Path, str, Dict[str, Any]]:
    """
    Prepare un run vierge avant le pipeline (appele par la GUI de facon synchrone).
    Manifest partiel (sha ZIP) ; image_count/hashes completes apres extraction.
    """
    source = Path(dataset_input)
    if source.is_file():
        zip_sha = sha256_file(source)
    else:
        zip_sha = sha256_bytes(str(source.resolve()).encode("utf-8"))
    run_dir, run_id = allocate_run_directory(base_output, zip_sha[:8])
    manifest: Dict[str, Any] = {
        "run_id": run_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "input_zip": str(source.resolve()),
        "input_name": source.name,
        "input_sha256": zip_sha,
        "input_sha256_short": zip_sha[:8],
        "input_size": source.stat().st_size if source.is_file() else 0,
        "input_mtime": (
            datetime.fromtimestamp(source.stat().st_mtime, tz=timezone.utc).isoformat()
            if source.is_file()
            else ""
        ),
        "image_count": 0,
        "images_dir": "",
        "first_image_hashes": [],
        "last_image_hashes": [],
    }
    write_run_manifest(run_dir, manifest)
    return run_dir, run_id, manifest
