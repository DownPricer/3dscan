#!/usr/bin/env python3
"""Pipeline Meshroom / AliceVision : JPG dataset Android -> modele texture site-ready."""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from meshroom_monitor import (
    MeshroomRunMonitor,
    PUBLISH_AUTO_FINALIZE_SEC,
    PUBLISH_SLOW_WARN_SEC,
    WAIT_LOG_INTERVAL_SEC,
    _process_alive as meshroom_process_alive,
    build_param_overrides,
    check_texturing_output_ready,
    format_elapsed,
    kill_process_tree,
    resolve_meshroom_cache_watch_dirs,
    scan_meshroom_cache_state,
)
from run_isolation import (
    allocate_run_directory,
    build_isolated_subprocess_env,
    build_run_manifest,
    generate_meshroom_preview_html,
    get_allowed_search_roots,
    get_isolated_fallback_root,
    is_isolated_run_dir,
    read_run_manifest,
    validate_mesh_provenance,
    write_run_manifest,
    write_source_manifest,
)

from model_validation import (
    mtl_has_map_kd_files,
    validate_obj_uv_setup,
    validate_visual_site_model,
)
from pc_processor_core import ensure_directory, extract_dataset_input
from glb_export import analyze_glb_texture, export_textured_glb, save_render_preview
from texture_convert import (
    analyze_texture_image_visual,
    prepare_site_textures,
    save_texture_preview,
)


LogCallback = Callable[[str], None]

PC_PROCESSOR_DIR = Path(__file__).resolve().parent.parent
MESHROOM_CONFIG_PATH = PC_PROCESSOR_DIR / "meshroom" / "user_config.json"
SITE_READY_DIRNAME = "site-ready"
MIN_IMAGES_DEFAULT = 8
MESHROOM_BATCH_NAMES = ("meshroom_batch.exe", "meshroom_batch")

EXCLUDED_OBJ_PATH_PARTS = (
    "extracted",
    "images",
    ".dataset",
    "debug_mesh",
    "web_pointcloud",
    "pointcloud",
    "sparse",
)

TEXTURE_NAME_HINTS = ("texturedmesh", "textured", "texturing", "publish")

MESHROOM_FALLBACK_ROOT = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "MeshroomRuns"


def _noop_log(_message: str) -> None:
    pass


def _path_has_spaces(path: Path) -> bool:
    return " " in str(path.resolve())


def _format_cmd_for_log(cmd: List[str]) -> str:
    try:
        return subprocess.list2cmdline(cmd)
    except (AttributeError, TypeError, ValueError):
        return repr(cmd)


@dataclass
class MeshroomWorkPaths:
    images_dir: Path
    meshroom_out: Path
    meshroom_cache: Path
    used_fallback: bool = False
    fallback_root: Optional[Path] = None


def _prepare_meshroom_work_paths(
    images_dir: Path,
    work_dir: Path,
    run_id: str,
    log: LogCallback = _noop_log,
) -> MeshroomWorkPaths:
    """Utilise un workdir sans espaces si necessaire (bug meshroom_batch Windows)."""
    images_dir = Path(images_dir)
    work_dir = Path(work_dir)
    meshroom_out = work_dir / "meshroom_out"
    meshroom_cache = work_dir / "meshroom_cache"

    candidates = (images_dir, work_dir, meshroom_out, meshroom_cache)
    if not any(_path_has_spaces(p) for p in candidates):
        return MeshroomWorkPaths(
            images_dir=images_dir,
            meshroom_out=meshroom_out,
            meshroom_cache=meshroom_cache,
            used_fallback=False,
        )

    fallback_root = get_isolated_fallback_root(run_id)
    fb_images = ensure_directory(fallback_root / "images")
    fb_out = fallback_root / "meshroom_out"
    fb_cache = fallback_root / "meshroom_cache"

    log(
        "[meshroom] Chemins avec espaces detectes — workdir Meshroom sans espaces : %s"
        % fallback_root
    )

    copied = 0
    for src in sorted(images_dir.iterdir()):
        if src.is_file() and src.suffix.lower() in (".jpg", ".jpeg", ".png"):
            shutil.copy2(src, fb_images / src.name)
            copied += 1
    log("[meshroom] %d images copiees vers workdir fallback" % copied)

    return MeshroomWorkPaths(
        images_dir=fb_images,
        meshroom_out=fb_out,
        meshroom_cache=fb_cache,
        used_fallback=True,
        fallback_root=fallback_root,
    )


def _sync_fallback_meshroom_output(
    fallback_root: Path,
    work_dir: Path,
    log: LogCallback = _noop_log,
) -> None:
    """Recopie meshroom_out et meshroom_cache vers le dossier de sortie du projet."""
    work_dir = Path(work_dir)
    for name in ("meshroom_out", "meshroom_cache"):
        src = Path(fallback_root) / name
        dest = work_dir / name
        if not src.is_dir():
            continue
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(src, dest)
        log("[meshroom] Sortie recopiee : %s -> %s" % (src, dest))


def _analyze_meshroom_batch_result(
    return_code: int,
    stdout: str,
    stderr: str,
) -> Tuple[int, bool, Optional[str], Optional[str]]:
    """
    meshroom_batch.exe renvoie parfois code 0 malgre une erreur argparse.
    Retourne (code_effectif, command_failed, failure_reason, stderr_excerpt).
    """
    stderr_text = stderr or ""
    stdout_text = stdout or ""
    lower = (stderr_text + "\n" + stdout_text).lower()

    command_failed = False
    failure_reason: Optional[str] = None

    if "unrecognized arguments" in lower or "unrecognized argument" in lower:
        command_failed = True
        failure_reason = "command_line_argument_error"
    elif re.search(r"meshroom_batch:\s*error:", lower):
        command_failed = True
        failure_reason = "meshroom_batch_error"

    effective_code = return_code
    if command_failed and effective_code == 0:
        effective_code = 2

    stderr_excerpt: Optional[str] = None
    for line in stderr_text.splitlines():
        if "error" in line.lower():
            stderr_excerpt = line.strip()
            break
    if not stderr_excerpt and stderr_text.strip():
        stderr_excerpt = stderr_text.strip().splitlines()[-1]

    return effective_code, command_failed, failure_reason, stderr_excerpt


def _meshroom_still_working(
    monitor: MeshroomRunMonitor,
    batch_exit_code: int,
    command_failed: bool,
) -> bool:
    """True tant que le pipeline AliceVision n'est pas termine (Publish SUCCESS)."""
    if command_failed and batch_exit_code != 0:
        return False
    cache_state = monitor.get_cache_state()
    if cache_state.get("pipeline_complete"):
        return False
    if cache_state.get("pipeline_active"):
        return True
    if meshroom_process_alive(monitor.process_pid):
        return True
    if not monitor.meshroom_batch_exited and batch_exit_code == 0 and not command_failed:
        return True
    if not monitor.meshroom_batch_exited and monitor._alicevision_running_throttled():
        return True
    return False


def wait_for_meshroom_pipeline_end(
    monitor: MeshroomRunMonitor,
    batch_exit_code: int,
    command_failed: bool,
    log: LogCallback,
    cancel_event: Optional[threading.Event] = None,
    max_wait_seconds: Optional[int] = None,
    idle_after_batch_seconds: float = 45.0,
) -> Tuple[bool, Dict[str, Any], bool]:
    """
    Apres la sortie de meshroom_batch, attend la fin reelle (noeuds MeshroomCache + AliceVision).
    Retourne (pipeline_complete, cache_state, texturing_finalize_recommended).
    """
    monitor.mark_meshroom_batch_exited(batch_exit_code)
    monitor.tick(force=True)
    log(
        "[meshroom] meshroom_batch termine (code %d) — attente fin pipeline "
        "(CameraInit → … → Publish)..." % batch_exit_code
    )

    start = time.monotonic()
    last_active = time.monotonic()
    last_wait_log = 0.0
    cache_state = monitor.get_cache_state(force=True)
    texturing_finalize_recommended = False

    while True:
        if cancel_event and cancel_event.is_set():
            return False, cache_state, False

        cache_state = monitor.get_cache_state()
        status_payload = monitor.tick()
        texturing_info = check_texturing_output_ready(monitor.cache_watch_dirs)
        current_step = status_payload.get("current_step") or cache_state.get("current_step")
        publish_elapsed = float(status_payload.get("publish_elapsed_seconds") or 0.0)
        on_publish_texturing_ready = (
            current_step == "Publish"
            and texturing_info.get("texturing_output_ready")
            and not cache_state.get("publish_success")
        )

        if cache_state.get("pipeline_complete"):
            monitor.mark_pipeline_complete()
            monitor.tick(force=True)
            log("[meshroom] Pipeline Meshroom termine (Publish SUCCESS).")
            return True, cache_state, False

        if on_publish_texturing_ready and publish_elapsed >= PUBLISH_AUTO_FINALIZE_SEC:
            monitor._auto_finalize_triggered = True
            monitor.tick(force=True)
            log(
                "[meshroom] Publish > %d min avec Texturing pret — finalisation depuis cache Texturing."
                % int(PUBLISH_AUTO_FINALIZE_SEC / 60)
            )
            return False, cache_state, True

        if cache_state.get("pipeline_failed") and not cache_state.get("pipeline_active"):
            failed_step = cache_state.get("failed_step") or "?"
            monitor.mark_failed()
            monitor.tick(force=True)
            log(
                "[meshroom] Echec pipeline Meshroom (etape %s en erreur). "
                "Voir les logs dans MeshroomCache." % failed_step
            )
            return False, cache_state, False

        if command_failed or batch_exit_code != 0:
            if not cache_state.get("pipeline_active"):
                inactive = time.monotonic() - last_active
                idle_limit = idle_after_batch_seconds
                if on_publish_texturing_ready:
                    idle_limit = max(idle_limit, PUBLISH_AUTO_FINALIZE_SEC)
                if inactive >= idle_limit:
                    monitor.tick(force=True)
                    log(
                        "[meshroom] Batch en echec et plus d'activite cache (%ds)."
                        % int(inactive)
                    )
                    return False, cache_state, on_publish_texturing_ready

        still = _meshroom_still_working(monitor, batch_exit_code, command_failed)
        if still:
            last_active = time.monotonic()
        elif monitor.meshroom_batch_exited:
            inactive = time.monotonic() - last_active
            idle_limit = idle_after_batch_seconds
            if on_publish_texturing_ready:
                idle_limit = max(idle_limit, PUBLISH_AUTO_FINALIZE_SEC - publish_elapsed + 30.0)
            if inactive >= idle_limit:
                if cache_state.get("publish_success"):
                    monitor.mark_pipeline_complete()
                    monitor.tick(force=True)
                    return True, cache_state, False
                monitor.tick(force=True)
                if on_publish_texturing_ready:
                    log(
                        "[meshroom] Publish lent (%ds) — sortie Texturing exploitable."
                        % int(publish_elapsed)
                    )
                    return False, cache_state, True
                log(
                    "[meshroom] Plus d'activite depuis %ds — fin pipeline (sans Publish confirme)."
                    % int(inactive)
                )
                return False, cache_state, False

        if max_wait_seconds and (time.monotonic() - start) > max_wait_seconds:
            log("[meshroom] Timeout attente fin pipeline.")
            monitor.tick(force=True)
            texturing_finalize_recommended = on_publish_texturing_ready
            return False, cache_state, texturing_finalize_recommended

        now = time.monotonic()
        if now - last_wait_log >= WAIT_LOG_INTERVAL_SEC:
            last_wait_log = now
            step = current_step or "?"
            tex_ready = "oui" if texturing_info.get("texturing_output_ready") else "non"
            pub_note = ""
            if on_publish_texturing_ready:
                pub_note = " | Publish: %ds" % int(publish_elapsed)
                if publish_elapsed >= PUBLISH_SLOW_WARN_SEC:
                    pub_note += " (lent)"
            log(
                "[meshroom] Attente fin pipeline — %s | etape : %s | Texturing pret : %s%s"
                % (
                    format_elapsed(monitor.elapsed_seconds()),
                    step,
                    tex_ready,
                    pub_note,
                )
            )

        time.sleep(3)


@dataclass
class MeshroomResult:
    success: bool
    exit_code: int
    output_dir: Path
    messages: List[str] = field(default_factory=list)
    error_message: Optional[str] = None
    meshroom_dir: Optional[Path] = None
    meshroom_batch_path: Optional[Path] = None
    images_dir: Optional[Path] = None
    image_count: int = 0
    meshroom_launched: bool = False
    meshroom_output_dir: Optional[Path] = None
    site_ready_dir: Optional[Path] = None
    site_ready_model: Optional[Path] = None
    site_ready_format: Optional[str] = None
    textured: bool = False
    site_ready_validated: bool = False
    visually_validated: bool = False
    texture_files: List[str] = field(default_factory=list)
    validation_errors: List[str] = field(default_factory=list)
    audit_path: Optional[Path] = None
    summary_path: Optional[Path] = None
    debug_pointcloud: bool = False
    debug_gray_mesh: bool = False
    failure_reasons: List[str] = field(default_factory=list)
    meshroom_command_failed: bool = False
    meshroom_failure_reason: Optional[str] = None
    meshroom_stderr_excerpt: Optional[str] = None
    meshroom_used_fallback_paths: bool = False
    meshroom_fallback_root: Optional[Path] = None
    cancelled_by_user: bool = False
    last_detected_step: Optional[str] = None
    elapsed_seconds: float = 0.0
    run_status_path: Optional[Path] = None
    input_source: Optional[str] = None
    input_fingerprint: Optional[str] = None
    input_sha256: Optional[str] = None
    mesh_source_path: Optional[str] = None
    run_id: Optional[str] = None
    run_manifest_path: Optional[Path] = None
    provenance_rejected: bool = False
    provenance_reason: Optional[str] = None
    meshroom_pipeline_complete: bool = False
    final_audit_performed: bool = False
    finalized_from_texturing: bool = False


def load_meshroom_config() -> Dict[str, Any]:
    if MESHROOM_CONFIG_PATH.is_file():
        try:
            with MESHROOM_CONFIG_PATH.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except (OSError, json.JSONDecodeError):
            pass
    return {}


def save_meshroom_config(meshroom_dir: Path) -> None:
    ensure_directory(MESHROOM_CONFIG_PATH.parent)
    payload = {
        "meshroom_dir": str(meshroom_dir.resolve()),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    with MESHROOM_CONFIG_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)


def find_meshroom_batch(meshroom_dir: Optional[Path] = None) -> Optional[Path]:
    """Cherche meshroom_batch.exe dans un dossier Meshroom ou sur le PATH."""
    candidates: List[Path] = []

    if meshroom_dir:
        root = Path(meshroom_dir)
        candidates.extend(
            [
                root / "meshroom_batch.exe",
                root / "Meshroom.exe",
                root / "bin" / "meshroom_batch.exe",
                root / "aliceVision" / "bin" / "meshroom_batch.exe",
            ]
        )
        if root.is_file() and root.name.lower() in MESHROOM_BATCH_NAMES:
            candidates.insert(0, root)

    config = load_meshroom_config()
    if config.get("meshroom_dir"):
        cfg_root = Path(config["meshroom_dir"])
        candidates.extend(
            [
                cfg_root / "meshroom_batch.exe",
                cfg_root / "bin" / "meshroom_batch.exe",
            ]
        )

    env_dir = os.environ.get("MESHROOM_DIR") or os.environ.get("MESHROOM_HOME")
    if env_dir:
        env_root = Path(env_dir)
        candidates.extend(
            [
                env_root / "meshroom_batch.exe",
                env_root / "bin" / "meshroom_batch.exe",
            ]
        )

    for name in MESHROOM_BATCH_NAMES:
        found = shutil.which(name)
        if found:
            candidates.append(Path(found))

    for path in candidates:
        if path.is_file():
            return path.resolve()

    for base in (
        Path(os.environ.get("ProgramFiles", "C:/Program Files")),
        Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)")),
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs",
    ):
        if not base.is_dir():
            continue
        try:
            for match in base.rglob("meshroom_batch.exe"):
                return match.resolve()
        except OSError:
            continue

    return None


def extract_jpg_images(
    dataset_input: str | Path,
    work_dir: Path,
    log: LogCallback = _noop_log,
) -> Tuple[Path, int, Path]:
    """Extrait les JPG du dataset vers work/images/."""
    work_dir = ensure_directory(work_dir)
    images_dir = ensure_directory(work_dir / "images")

    extraction = extract_dataset_input(dataset_input, work_dir)
    dataset_root = Path(extraction["dataset_root"])

    jpg_files = sorted(
        p
        for p in dataset_root.rglob("*")
        if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg")
    )

    filtered: List[Path] = []
    for path in jpg_files:
        name = path.name.lower()
        if name.startswith("texture_") or name.endswith("_face.jpg"):
            continue
        if re.match(r"^\d{8}\.(jpe?g)$", name):
            filtered.append(path)
        elif re.match(r"^\d+\.(jpe?g)$", name):
            filtered.append(path)

    if not filtered:
        filtered = jpg_files

    for index, src in enumerate(filtered):
        dest = images_dir / ("%08d%s" % (index, src.suffix.lower()))
        shutil.copy2(src, dest)

    log("[meshroom] %d images copiees vers %s" % (len(filtered), images_dir))
    return images_dir, len(filtered), dataset_root


def compute_input_fingerprint(
    dataset_input: str | Path,
    images_dir: Path,
    image_count: int,
) -> Dict[str, Any]:
    """Empreinte du ZIP/dataset pour verifier qu'on ne reutilise pas un ancien scan."""
    source = Path(dataset_input)
    hasher = hashlib.sha256()
    hasher.update(str(source.resolve()).encode("utf-8", errors="replace"))

    if source.is_file():
        stat = source.stat()
        hasher.update(str(stat.st_size).encode())
        hasher.update(str(int(stat.st_mtime_ns)).encode())
        source_label = source.name
    else:
        source_label = source.name + "/"
        try:
            stat = source.stat()
            hasher.update(str(int(stat.st_mtime_ns)).encode())
        except OSError:
            pass

    sampled = 0
    sample_images = sorted(images_dir.glob("*.jpg")) + sorted(images_dir.glob("*.jpeg"))
    for img in sample_images[:12]:
        try:
            hasher.update(img.name.encode())
            with img.open("rb") as handle:
                hasher.update(handle.read(65536))
            sampled += 1
        except OSError:
            continue

    return {
        "source": str(source.resolve()),
        "source_name": source_label,
        "image_count": image_count,
        "images_sampled": sampled,
        "fingerprint": hasher.hexdigest()[:24],
    }


def _path_is_under(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def _path_is_excluded_obj(obj_path: Path) -> bool:
    lower_parts = [p.lower() for p in obj_path.parts]
    joined = "/".join(lower_parts)
    if any(part in joined for part in EXCLUDED_OBJ_PATH_PARTS):
        return True
    name = obj_path.name.lower()
    if "pointcloud" in name or "sparse" in name:
        return True
    return False


def _collect_texture_files_near(obj_path: Path, mtl_path: Optional[Path]) -> List[Path]:
    """Collecte textures map_Kd (PNG/JPG/EXR) autour du OBJ Meshroom."""
    found: Dict[str, Path] = {}
    roots = {obj_path.parent}
    if mtl_path and mtl_path.is_file():
        roots.add(mtl_path.parent)

    texture_suffixes = (".png", ".jpg", ".jpeg", ".exr", ".tif", ".tiff", ".webp")

    for root in roots:
        if not root.is_dir():
            continue
        for pattern in (
            "texture_*.png",
            "texture_*.jpg",
            "texture_*.exr",
            "texture_*.tif",
            "*.exr",
        ):
            try:
                for tex in root.glob(pattern):
                    if tex.is_file() and tex.name.lower() not in ("thumbnail.png",):
                        found[str(tex.resolve())] = tex
            except OSError:
                continue
        for sub in ("textures", "Texturing", "texturing", "Publish", "publish"):
            subdir = root / sub
            if subdir.is_dir():
                try:
                    for tex in subdir.rglob("*"):
                        if tex.is_file() and tex.suffix.lower() in texture_suffixes:
                            found[str(tex.resolve())] = tex
                except OSError:
                    continue

    if mtl_path and mtl_path.is_file():
        _has_map, resolved = mtl_has_map_kd_files(mtl_path, mtl_path.parent)
        for tex in resolved:
            found[str(tex.resolve())] = tex

    return list(found.values())


def _obj_mtl_has_real_textures(obj_path: Path, mtl_path: Optional[Path]) -> Tuple[bool, List[Path]]:
    """Detection Meshroom : map_Kd + fichier texture (EXR accepte)."""
    if not mtl_path or not mtl_path.is_file():
        return False, []
    has_map, resolved = mtl_has_map_kd_files(mtl_path, mtl_path.parent)
    if not has_map:
        return False, []
    extra = _collect_texture_files_near(obj_path, mtl_path)
    merged: Dict[str, Path] = {str(p.resolve()): p for p in resolved}
    for tex in extra:
        merged[str(tex.resolve())] = tex
    return True, list(merged.values())


def _expand_meshroom_search_roots(
    work_dir: Path,
    output_dir: Path,
    fallback_root: Optional[Path] = None,
    include_global_cache: bool = False,
) -> List[Path]:
    """Recherche STRICTEMENT dans les dossiers du run courant (jamais cache global)."""
    if include_global_cache:
        pass
    return get_allowed_search_roots(work_dir, output_dir, fallback_root)


def audit_meshroom_output(
    search_roots: List[Path],
    output_dir: Path,
    batch_exit_code: Optional[int] = None,
    pipeline_complete: Optional[bool] = None,
) -> Dict[str, Any]:
    """Inspecte les dossiers Meshroom et produit un rapport d'audit."""
    if pipeline_complete is None:
        meshroom_finished = batch_exit_code == 0 if batch_exit_code is not None else None
    else:
        meshroom_finished = pipeline_complete
    audit: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "meshroom_finished": meshroom_finished,
        "pipeline_complete": pipeline_complete,
        "batch_exit_code": batch_exit_code,
        "texturing_folder_found": False,
        "publish_folder_found": False,
        "textured_obj_candidates": [],
        "texture_image_files": [],
        "mtl_with_map_kd": [],
        "mtl_gray_only": [],
        "abc_files": [],
        "obj_files_all": [],
        "best_textured_path": None,
        "converted_to_glb_source": None,
        "why_glb_might_be_gray": [],
    }

    texture_images: List[str] = []
    texture_suffixes = (".png", ".jpg", ".jpeg", ".exr", ".tif", ".tiff", ".webp")

    for root in search_roots:
        if not root.is_dir():
            continue
        try:
            for path in root.rglob("*"):
                lower = path.name.lower()
                parts_lower = "/".join(p.lower() for p in path.parts)

                if path.is_dir():
                    if path.name.lower() in ("texturing", "texturing_1"):
                        audit["texturing_folder_found"] = True
                    if path.name.lower() in ("publish", "publish_1"):
                        audit["publish_folder_found"] = True
                    continue

                if "texturing" in parts_lower:
                    audit["texturing_folder_found"] = True
                if "publish" in parts_lower:
                    audit["publish_folder_found"] = True

                if path.suffix.lower() == ".abc":
                    audit["abc_files"].append(str(path))
                if path.suffix.lower() == ".obj":
                    audit["obj_files_all"].append(str(path))
                if path.suffix.lower() in texture_suffixes:
                    if (
                        "texture" in lower
                        or "texturing" in parts_lower
                        or "publish" in parts_lower
                        or "meshroom_out" in parts_lower
                    ):
                        texture_images.append(str(path))

                if path.suffix.lower() == ".mtl":
                    try:
                        text = path.read_text(encoding="utf-8", errors="replace")
                        if re.search(r"^\s*map_kd\s+", text, re.MULTILINE | re.IGNORECASE):
                            audit["mtl_with_map_kd"].append(str(path))
                        elif re.search(r"^\s*kd\s+", text, re.MULTILINE | re.IGNORECASE):
                            audit["mtl_gray_only"].append(str(path))
                    except OSError:
                        pass
        except OSError:
            continue

    audit["texture_image_files"] = sorted(set(texture_images))[:200]
    if audit["mtl_with_map_kd"] and audit["texture_image_files"]:
        audit["textures_found"] = True

    mesh_info = _find_textured_mesh(search_roots, require_textures=True)
    if mesh_info:
        audit["best_textured_path"] = str(mesh_info["obj"])
        audit["textured_obj_candidates"].append(
            {
                "obj": str(mesh_info["obj"]),
                "mtl": str(mesh_info.get("mtl") or ""),
                "textures": [str(t) for t in mesh_info.get("textures", [])],
                "score": mesh_info.get("score", 0),
            }
        )
    else:
        loose = _find_textured_mesh(search_roots, require_textures=False)
        if loose:
            audit["textured_obj_candidates"].append(
                {
                    "obj": str(loose["obj"]),
                    "note": "OBJ trouve mais sans map_Kd / textures valides",
                }
            )
            audit["why_glb_might_be_gray"].append(
                "OBJ detecte sans map_Kd (materiaux Kd gris seulement) — probablement mesh Android ou etape Texturing echouee."
            )

    site_glb = output_dir / SITE_READY_DIRNAME / "site_model.glb"
    site_obj = output_dir / SITE_READY_DIRNAME / "site_model.obj"
    if site_glb.is_file():
        audit["converted_to_glb_source"] = str(site_obj) if site_obj.is_file() else str(site_glb)
    elif mesh_info:
        audit["converted_to_glb_source"] = str(mesh_info["obj"])

    if not audit["texture_image_files"]:
        audit["why_glb_might_be_gray"].append(
            "Aucune image texture (PNG/JPG/EXR) dans la sortie Meshroom."
        )
    if not audit["mtl_with_map_kd"]:
        audit["why_glb_might_be_gray"].append("Aucun MTL avec map_Kd dans les dossiers Meshroom.")
    if batch_exit_code not in (None, 0):
        audit["why_glb_might_be_gray"].append("meshroom_batch code sortie : %s" % batch_exit_code)

    return audit


def write_meshroom_output_inventory(
    search_roots: List[Path],
    output_dir: Path,
    fallback_root: Optional[Path] = None,
) -> Path:
    """Inventaire complet des fichiers Meshroom (OBJ/MTL/textures)."""
    lines = [
        "# Inventaire sortie Meshroom reelle",
        "",
        "Dossier run : `%s`" % output_dir.resolve(),
        "",
    ]
    if fallback_root:
        lines.append("Fallback : `%s`" % fallback_root)
        lines.append("")

    texture_suffixes = (".png", ".jpg", ".jpeg", ".exr", ".tif", ".tiff", ".webp", ".mtl", ".obj", ".abc")

    for root in search_roots:
        if not root.is_dir():
            continue
        lines.append("## Racine : `%s`" % root)
        lines.append("")
        try:
            files = sorted(
                (p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in texture_suffixes),
                key=lambda p: p.suffix.lower(),
            )
        except OSError:
            lines.append("(lecture impossible)")
            continue

        if not files:
            lines.append("(aucun fichier OBJ/MTL/texture)")
            lines.append("")
            continue

        for path in files[:150]:
            try:
                size = path.stat().st_size
            except OSError:
                size = 0
            lines.append("- `%s` — %d octets" % (path, size))
        if len(files) > 150:
            lines.append("- ... (%d fichiers supplementaires)" % (len(files) - 150))
        lines.append("")

    mesh_info = _find_textured_mesh(search_roots, require_textures=True)
    lines.append("## Conclusion detecteur")
    lines.append("")
    if mesh_info:
        lines.append("- OBJ texturé retenu : `%s`" % mesh_info["obj"])
        lines.append("- MTL : `%s`" % mesh_info.get("mtl"))
        lines.append("- Textures : %s" % ", ".join(p.name for p in mesh_info.get("textures", [])))
    else:
        lines.append("- Aucun OBJ texturé valide detecte par le processeur.")

    path = Path(output_dir) / "MESHROOM_REAL_OUTPUT_INVENTORY.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def write_meshroom_audit_md(audit: Dict[str, Any], output_dir: Path) -> Path:
    lines = [
        "# Audit sortie Meshroom",
        "",
        "Genere : %s" % audit.get("generated_at", ""),
        "",
        "## Meshroom a-t-il vraiment termine ?",
        "- Code sortie batch : **%s**" % audit.get("batch_exit_code"),
        "- Termine avec succes : **%s**" % (
            "oui" if audit.get("meshroom_finished") else "non / inconnu"
        ),
        "",
        "## Etapes / dossiers",
        "- Dossier Texturing trouve : **%s**" % (
            "oui" if audit.get("texturing_folder_found") else "non"
        ),
        "- Dossier Publish trouve : **%s**" % (
            "oui" if audit.get("publish_folder_found") else "non"
        ),
        "- Fichiers .abc : %d" % len(audit.get("abc_files", [])),
        "",
        "## Textures",
        "- Images texture trouvees : **%s** (%d fichiers)" % (
            "oui" if audit.get("texture_image_files") else "non",
            len(audit.get("texture_image_files", [])),
        ),
        "- MTL avec map_Kd : %d" % len(audit.get("mtl_with_map_kd", [])),
        "- MTL gris uniquement (Kd sans map_Kd) : %d" % len(audit.get("mtl_gray_only", [])),
        "",
        "## Modele texturé",
        "- Meilleur OBJ texturé : `%s`" % (audit.get("best_textured_path") or "AUCUN"),
        "- Source conversion GLB : `%s`" % (audit.get("converted_to_glb_source") or "N/A"),
        "",
        "## Pourquoi le GLB final peut etre blanc/gris",
    ]
    reasons = audit.get("why_glb_might_be_gray") or ["(aucune raison enregistree)"]
    for reason in reasons:
        lines.append("- %s" % reason)

    if audit.get("textured_obj_candidates"):
        lines.extend(["", "## Candidats OBJ", ""])
        for cand in audit["textured_obj_candidates"][:10]:
            lines.append("- `%s`" % cand.get("obj", cand))

    path = Path(output_dir) / "MESHROOM_OUTPUT_AUDIT.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def _mesh_info_from_texturing_check(texturing_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Construit mesh_info depuis la detection cache Texturing."""
    obj_raw = texturing_info.get("textured_mesh_obj")
    if not obj_raw:
        return None
    obj_path = Path(obj_raw)
    if not obj_path.is_file():
        return None
    mtl_raw = texturing_info.get("textured_mesh_mtl")
    mtl_path = Path(mtl_raw) if mtl_raw else obj_path.with_suffix(".mtl")
    if not mtl_path.is_file():
        mtl_path = None
    textures = [Path(p) for p in texturing_info.get("texture_files_found", []) if Path(p).is_file()]
    has_map = bool(texturing_info.get("mtl_has_map_kd"))
    return {
        "obj": obj_path,
        "mtl": mtl_path,
        "textures": textures,
        "score": 1000,
        "root": obj_path.parent,
        "has_map_kd": has_map,
        "from_texturing_cache": True,
    }


def finalize_from_texturing_cache(
    output_dir: Path,
    work_dir: Path,
    image_count: int = 0,
    log: LogCallback = _noop_log,
    manifest: Optional[Dict[str, Any]] = None,
    fallback_root: Optional[Path] = None,
    monitor: Optional[MeshroomRunMonitor] = None,
) -> Dict[str, Any]:
    """
    Genere site-ready (EXR→PNG, GLB, validation) depuis le cache Texturing
    sans attendre l'etape Publish Meshroom.
    """
    output_dir = Path(output_dir)
    work_dir = Path(work_dir)
    watch_dirs = (
        monitor.cache_watch_dirs
        if monitor
        else resolve_meshroom_cache_watch_dirs(work_dir / "meshroom_cache", fallback_root)
    )
    texturing_info = check_texturing_output_ready(watch_dirs)
    if not texturing_info.get("texturing_output_ready"):
        return {
            "success": False,
            "message": "Sortie Texturing incomplete (OBJ/MTL/texture/map_Kd manquants).",
            "errors": [
                "texturing_output_ready=false — verifier MeshroomCache/Texturing/texturedMesh.obj"
            ],
            "texturing_info": texturing_info,
        }

    search_roots = get_allowed_search_roots(work_dir, output_dir, fallback_root)
    mesh_info = _find_textured_mesh(
        search_roots,
        require_textures=True,
        preferred_roots=search_roots,
    )
    if not mesh_info:
        mesh_info = _mesh_info_from_texturing_check(texturing_info)
    if not mesh_info:
        return {
            "success": False,
            "message": "OBJ texturé introuvable dans le cache Texturing.",
            "errors": ["Aucun texturedMesh.obj valide."],
            "texturing_info": texturing_info,
        }

    log(
        "[meshroom] Finalisation depuis Texturing : %s"
        % texturing_info.get("texturing_output_path", mesh_info["obj"])
    )
    if monitor:
        monitor.set_post_step("Conversion EXR → PNG")
        monitor.tick(force=True)

    published = publish_site_ready(output_dir, mesh_info, image_count, log=log, manifest=manifest)
    if monitor:
        monitor.set_post_step("Validation finale")
        monitor.tick(force=True)
        if published.get("success"):
            monitor.mark_success()
        else:
            monitor.mark_failed()

    published["texturing_output_path"] = texturing_info.get("texturing_output_path")
    published["finalized_from_texturing"] = True
    return published


def _find_textured_mesh(
    search_roots: List[Path],
    require_textures: bool = True,
    preferred_roots: Optional[List[Path]] = None,
) -> Optional[Dict[str, Any]]:
    """Trouve le meilleur OBJ Meshroom avec map_Kd et textures reelles."""
    best: Optional[Dict[str, Any]] = None
    priority_names = ("texturedmesh.obj",)
    preferred = [Path(p).resolve() for p in (preferred_roots or []) if Path(p).exists()]

    for root in search_roots:
        if not root.is_dir():
            continue
        try:
            obj_files = list(root.rglob("*.obj"))
        except OSError:
            continue

        for obj_path in obj_files:
            if _path_is_excluded_obj(obj_path):
                continue

            lower = obj_path.name.lower()
            parts_joined = "/".join(p.lower() for p in obj_path.parts)

            mtl_path = obj_path.with_suffix(".mtl")
            if not mtl_path.is_file():
                parent_mtl = list(obj_path.parent.glob("*.mtl"))
                mtl_path = parent_mtl[0] if parent_mtl else None

            has_textures, texture_list = _obj_mtl_has_real_textures(obj_path, mtl_path)
            if require_textures and not has_textures:
                continue

            score = 0
            if lower in priority_names:
                score += 200
            if "textured" in lower:
                score += 80
            if any(hint in parts_joined for hint in TEXTURE_NAME_HINTS):
                score += 60
            if mtl_path and mtl_path.is_file():
                score += 30
            if texture_list:
                score += 20 * min(len(texture_list), 5)
            if preferred and any(_path_is_under(obj_path, pref) for pref in preferred):
                score += 500

            entry = {
                "obj": obj_path,
                "mtl": mtl_path if mtl_path and mtl_path.is_file() else None,
                "textures": texture_list,
                "score": score,
                "root": obj_path.parent,
                "has_map_kd": has_textures,
                "from_current_run": bool(
                    preferred and any(_path_is_under(obj_path, pref) for pref in preferred)
                ),
            }
            if best is None or entry["score"] > best["score"]:
                best = entry

    return best


def _fix_obj_mtllib(obj_path: Path, mtl_name: str = "site_model.mtl") -> None:
    """Corrige mtllib dans OBJ copie (Meshroom ecrit texturedMesh.mtl)."""
    try:
        text = obj_path.read_text(encoding="utf-8", errors="replace")
        text = re.sub(
            r"^mtllib\s+.*$",
            "mtllib %s" % mtl_name,
            text,
            count=1,
            flags=re.MULTILINE | re.IGNORECASE,
        )
        obj_path.write_text(text, encoding="utf-8")
    except OSError:
        pass


def _clear_site_ready(site_dir: Path) -> None:
    if site_dir.is_dir():
        try:
            shutil.rmtree(site_dir)
        except OSError:
            pass


def _rewrite_mtl_for_site(mtl_path: Path, textures_dir: Path, log: LogCallback) -> None:
    """Reecrit MTL : map_Kd textures/*.png, Kd blanc pour fallback."""
    try:
        lines = mtl_path.read_text(encoding="utf-8", errors="replace").splitlines()
        out: List[str] = []
        for line in lines:
            lower = line.strip().lower()
            if lower.startswith("map_kd "):
                ref = line.split(maxsplit=1)[1].strip()
                stem = Path(ref).stem
                png_name = stem + ".png"
                if (textures_dir / png_name).is_file():
                    out.append("map_Kd textures/%s" % png_name)
                else:
                    out.append(line)
            elif lower.startswith("kd "):
                out.append("Kd 1.000000 1.000000 1.000000")
            else:
                out.append(line)
        mtl_path.write_text("\n".join(out) + "\n", encoding="utf-8")
    except OSError as exc:
        log("[meshroom] MTL non reecrit : %s" % exc)


def publish_site_ready(
    output_dir: Path,
    mesh_info: Dict[str, Any],
    image_count: int,
    log: LogCallback = _noop_log,
    manifest: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Copie OBJ/MTL/textures vers site-ready/ si validation visuelle OK."""
    output_dir = Path(output_dir)
    _clear_site_ready(output_dir / SITE_READY_DIRNAME)
    site_dir = ensure_directory(output_dir / SITE_READY_DIRNAME)
    textures_dir = ensure_directory(site_dir / "textures")
    logs_dir = ensure_directory(output_dir / "logs")

    obj_src: Path = mesh_info["obj"]
    mtl_src = mesh_info.get("mtl")

    has_map, source_textures = mtl_has_map_kd_files(
        Path(mtl_src) if mtl_src else obj_src.with_suffix(".mtl"),
        obj_src.parent,
    )
    if not has_map:
        return {
            "success": False,
            "errors": ["MTL sans map_Kd ou textures introuvables (Meshroom)."],
            "message": "Source Meshroom non texturée.",
        }

    if not source_textures:
        source_textures = mesh_info.get("textures", [])

    prepared_paths, texture_names, tex_stats = prepare_site_textures(
        [Path(t) for t in source_textures],
        textures_dir,
        log=log,
        stats_dir=logs_dir,
    )
    if not prepared_paths:
        reason = "Conversion EXR->PNG echouee ou texture visuellement invalide."
        if tex_stats and tex_stats[0].get("texture_mostly_black"):
            reason = "Texture EXR convertie en PNG quasi noire (tone-mapping)."
        return {
            "success": False,
            "errors": [reason],
            "message": "Texture presente mais visuellement invalide.",
            "texture_stats": tex_stats,
        }

    main_png = prepared_paths[0]
    vis = analyze_texture_image_visual(main_png)
    if not vis.get("visually_valid"):
        return {
            "success": False,
            "errors": ["Texture PNG visuellement invalide apres conversion."],
            "message": "Texture presente mais pas de photos visibles.",
            "visual_stats": vis,
        }

    site_obj = site_dir / "site_model.obj"
    shutil.copy2(obj_src, site_obj)
    _fix_obj_mtllib(site_obj, "site_model.mtl")

    site_mtl = site_dir / "site_model.mtl"
    if mtl_src and Path(mtl_src).is_file():
        shutil.copy2(mtl_src, site_mtl)
        _rewrite_mtl_for_site(site_mtl, textures_dir, log)

    obj_val = validate_obj_uv_setup(site_obj, site_mtl)
    if not obj_val.valid:
        _clear_site_ready(site_dir)
        return {
            "success": False,
            "errors": obj_val.errors,
            "message": "OBJ/MTL invalide avant export GLB.",
        }

    save_texture_preview(main_png, site_dir / "texture_preview.png")
    save_render_preview(site_obj, main_png, site_dir / "render_preview.png", log=log)

    site_glb = site_dir / "site_model.glb"
    glb_ok, glb_info = export_textured_glb(site_obj, main_png, site_glb, log=log)

    upload_file = ""
    upload_path: Optional[Path] = None
    glb_visually_ok = False
    obj_visually_ok = True

    if glb_ok:
        final_val = validate_visual_site_model(site_dir)
        if final_val.valid and final_val.format == "glb":
            upload_file = "site_model.glb"
            upload_path = site_glb
            glb_visually_ok = True
        else:
            log("[meshroom] GLB rejete (validation visuelle) — fallback OBJ")
            try:
                site_glb.unlink()
            except OSError:
                pass
            glb_ok = False

    if not glb_ok:
        final_val = validate_visual_site_model(site_dir)
        if final_val.valid:
            upload_file = "site_model.obj (+ site_model.mtl + textures/)"
            upload_path = site_obj
        else:
            _clear_site_ready(site_dir)
            return {
                "success": False,
                "errors": final_val.errors,
                "message": "Ni GLB ni OBJ texturé visuellement valide.",
                "glb_export": glb_info,
            }

    readme_lines = [
        "Modele texturé Meshroom — validation VISUELLE",
        "=" * 50,
        "",
        "Fichier recommande pour le site :",
        "  %s" % upload_file,
        "",
        "GLB texturé visuellement valide : %s" % ("oui" if glb_visually_ok else "non"),
        "OBJ+MTL+textures valide : %s" % ("oui" if obj_visually_ok else "non"),
        "Texture visuellement valide : oui",
        "",
        "Apercu texture : texture_preview.png",
        "Apercu rendu   : render_preview.png (si genere)",
        "",
        "Si le GLB est sombre sur le site, uploader plutot :",
        "  site_model.obj + site_model.mtl + textures/",
        "",
        "Images sources : %d" % image_count,
        "Textures : %s" % ", ".join(texture_names),
    ]
    if manifest:
        readme_lines.extend(
            [
                "",
                "Provenance (run isole) :",
                "  ZIP source : %s" % manifest.get("input_name", "?"),
                "  SHA256 : %s" % manifest.get("input_sha256", "?"),
                "  Run ID : %s" % manifest.get("run_id", "?"),
                "  Genere : %s" % datetime.now(timezone.utc).isoformat(),
            ]
        )
    readme = site_dir / "README_UPLOAD_SITE.txt"
    readme.write_text("\n".join(readme_lines), encoding="utf-8")

    if manifest:
        write_source_manifest(site_dir, manifest, str(obj_src.resolve()))

    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "pipeline": "meshroom",
        "format": "glb" if glb_visually_ok else "obj",
        "upload_file": upload_file,
        "site_compatible": True,
        "textured": True,
        "site_ready_validated": True,
        "visually_validated": True,
        "glb_visually_valid": glb_visually_ok,
        "obj_visually_valid": obj_visually_ok,
        "texture_visual_mean": vis.get("mean_rgb"),
        "texture_files": texture_names,
        "source_images": image_count,
        "source_obj": str(obj_src),
        "glb_export": glb_info,
    }
    meta_path = site_dir / "metadata.json"
    meta_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")

    log("[meshroom] site-ready VISUELLEMENT valide : %s" % upload_file)

    return {
        "success": True,
        "site_ready_dir": site_dir,
        "site_ready_model": upload_path,
        "site_ready_format": "glb" if glb_visually_ok else "obj",
        "textured": True,
        "site_ready_validated": True,
        "visually_validated": True,
        "texture_files": texture_names,
        "readme_path": readme,
        "metadata_path": meta_path,
        "validation": final_val,
        "visual_stats": vis,
    }


def _fix_mtl_texture_paths(mtl_path: Path, textures_dir: Path, log: LogCallback) -> None:
    try:
        lines = mtl_path.read_text(encoding="utf-8", errors="replace").splitlines()
        out: List[str] = []
        for line in lines:
            if line.strip().lower().startswith("map_kd "):
                tex_name = line.split(maxsplit=1)[1].strip()
                basename = Path(tex_name).name
                src_in_parent = mtl_path.parent / basename
                if src_in_parent.is_file() and not (textures_dir / basename).exists():
                    shutil.copy2(src_in_parent, textures_dir / basename)
                out.append("map_Kd textures/%s" % basename)
            else:
                out.append(line)
        mtl_path.write_text("\n".join(out) + "\n", encoding="utf-8")
    except OSError as exc:
        log("[meshroom] MTL non reecrit : %s" % exc)


def _meshroom_failure_reasons(image_count: int, audit: Dict[str, Any]) -> List[str]:
    reasons: List[str] = []
    if image_count < 12:
        reasons.append("Peu de photos (%d) — minimum recommande 15-30 avec recouvrement." % image_count)
    if not audit.get("texturing_folder_found"):
        reasons.append("Etape Texturing Meshroom absente ou non terminee.")
    if not audit.get("texture_image_files"):
        reasons.append(
            "Aucune texture produite par Meshroom (verifier EXR dans meshroom_out/texturedMesh.mtl)."
        )
    if not audit.get("mtl_with_map_kd"):
        reasons.append("Aucun fichier MTL avec map_Kd (textures photo).")
    if audit.get("mtl_gray_only"):
        reasons.append(
            "Des MTL existent mais avec couleur grise uniquement (Kd 0.64) — pas de photos."
        )
    if not reasons:
        reasons.append(
            "Verifier GPU/CUDA, qualite des photos (flou, murs blancs), recouvrement entre vues."
        )
    return reasons


def _clear_processing_artifacts(run_dir: Path) -> None:
    """Efface work/ et site-ready/ avant un traitement dans un run deja alloue."""
    run_dir = Path(run_dir)
    for name in ("site-ready", "work"):
        target = run_dir / name
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)


def _ensure_run_output_dir(output_dir: Path, input_sha256_short: str = "00000000") -> Tuple[Path, str]:
    """Cree run_YYYYMMDD_HHMMSS_<hash8> — jamais reutilise un dossier run existant sans hash."""
    output_dir = Path(output_dir)
    if is_isolated_run_dir(output_dir):
        return ensure_directory(output_dir), output_dir.name
    run_dir, run_id = allocate_run_directory(output_dir, input_sha256_short)
    return run_dir, run_id


def _stream_subprocess_output(
    stream,
    log_path: Path,
    buffer: List[str],
) -> None:
    try:
        with log_path.open("a", encoding="utf-8", errors="replace") as handle:
            for line in iter(stream.readline, ""):
                handle.write(line)
                handle.flush()
                buffer.append(line)
    except OSError:
        pass
    finally:
        try:
            stream.close()
        except OSError:
            pass


def write_meshroom_summary(
    output_dir: Path,
    result: MeshroomResult,
    audit: Dict[str, Any],
    batch_stdout: str = "",
    batch_stderr: str = "",
    monitor: Optional[MeshroomRunMonitor] = None,
) -> Path:
    logs_dir = ensure_directory(Path(output_dir) / "logs")
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "meshroom_launched": result.meshroom_launched,
        "meshroom_batch_path": str(result.meshroom_batch_path or ""),
        "meshroom_command_failed": result.meshroom_command_failed,
        "failure_reason": result.meshroom_failure_reason,
        "stderr_excerpt": result.meshroom_stderr_excerpt,
        "used_fallback_paths": result.meshroom_used_fallback_paths,
        "fallback_root": str(result.meshroom_fallback_root or ""),
        "image_count": result.image_count,
        "batch_exit_code": audit.get("batch_exit_code"),
        "texturing_folder_found": audit.get("texturing_folder_found"),
        "textured_model_found": bool(audit.get("best_textured_path")),
        "textures_found": bool(audit.get("texture_image_files")),
        "site_ready_validated": result.site_ready_validated,
        "glb_conversion_ok": (
            result.site_ready_format == "glb" if result.site_ready_model else False
        ),
        "success": result.success,
        "exit_code": result.exit_code,
        "error_message": result.error_message,
        "validation_errors": result.validation_errors,
        "failure_reasons": result.failure_reasons,
        "best_textured_path": audit.get("best_textured_path"),
        "why_glb_gray": audit.get("why_glb_might_be_gray", []),
        "cancelled_by_user": result.cancelled_by_user,
        "elapsed_time": result.elapsed_seconds,
        "last_detected_step": result.last_detected_step,
        "input_source": result.input_source,
        "input_fingerprint": result.input_fingerprint,
        "input_sha256": result.input_sha256,
        "mesh_source_path": result.mesh_source_path,
        "run_id": result.run_id,
        "provenance_rejected": result.provenance_rejected,
        "provenance_reason": result.provenance_reason,
    }
    if monitor:
        summary["run_status"] = monitor.status
        summary["processing_mode"] = monitor.processing_mode
    path = logs_dir / "meshroom_summary.json"
    path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    result.summary_path = path

    if batch_stdout:
        (logs_dir / "meshroom_stdout.log").write_text(batch_stdout, encoding="utf-8", errors="replace")
    if batch_stderr:
        (logs_dir / "meshroom_stderr.log").write_text(batch_stderr, encoding="utf-8", errors="replace")

    return path


def run_meshroom_batch(
    images_dir: Path,
    meshroom_out: Path,
    meshroom_batch: Path,
    cache_dir: Optional[Path] = None,
    log: LogCallback = _noop_log,
    timeout_seconds: Optional[int] = None,
    logs_dir: Optional[Path] = None,
    processing_mode: str = "normal",
    monitor: Optional[MeshroomRunMonitor] = None,
    cancel_event: Optional[threading.Event] = None,
    force_recompute: bool = False,
    isolated_env: Optional[Dict[str, str]] = None,
) -> Tuple[int, str, str, bool, Optional[str], Optional[str]]:
    """
    Lance meshroom_batch -p photogrammetry avec logs en direct.
    Retourne (code_effectif, stdout, stderr, command_failed, failure_reason, stderr_excerpt).
    """
    meshroom_out = ensure_directory(meshroom_out)
    cache = ensure_directory(cache_dir or meshroom_out.parent / "meshroom_cache")
    logs_dir = ensure_directory(logs_dir or meshroom_out.parent.parent / "logs")

    images_path = str(Path(images_dir).resolve())
    output_path = str(meshroom_out.resolve())
    cache_path = str(cache.resolve())
    batch_exe = str(Path(meshroom_batch).resolve())

    cmd = [
        batch_exe,
        "-i",
        images_path,
        "-o",
        output_path,
        "--cache",
        cache_path,
        "-p",
        "photogrammetry",
    ]

    if force_recompute:
        cmd.append("--forceCompute")
        log("[meshroom] Recalcul force — Meshroom ne reutilisera pas un ancien modele cache.")

    overrides = build_param_overrides(processing_mode)
    if overrides:
        cmd.extend(["--paramOverrides"] + overrides)
        log("[meshroom] Mode %s — paramOverrides : %s" % (processing_mode, " ".join(overrides)))

    log("[meshroom] Commande : %s" % _format_cmd_for_log(cmd))
    log(
        "[meshroom] Le traitement peut prendre longtemps (GPU recommande). "
        "Le fichier site-ready sera cree apres Publish + validation texture."
    )

    meshroom_root = Path(meshroom_batch).parent
    env = dict(isolated_env) if isolated_env else os.environ.copy()
    if "PATH" not in env or str(meshroom_root) not in env.get("PATH", ""):
        env["PATH"] = str(meshroom_root) + os.pathsep + env.get("PATH", os.environ.get("PATH", ""))

    stdout_path = logs_dir / "meshroom_stdout.log"
    stderr_path = logs_dir / "meshroom_stderr.log"
    try:
        stdout_path.write_text("", encoding="utf-8")
        stderr_path.write_text("", encoding="utf-8")
    except OSError:
        pass

    stdout_buffer: List[str] = []
    stderr_buffer: List[str] = []
    return_code = 127
    cancelled = False

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(meshroom_root),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            shell=False,
        )
    except FileNotFoundError:
        log("[meshroom] Executable introuvable : %s" % meshroom_batch)
        return 127, "", "Executable introuvable", True, "executable_not_found", None

    if monitor:
        monitor.set_process_pid(proc.pid)

    if proc.stdout:
        threading.Thread(
            target=_stream_subprocess_output,
            args=(proc.stdout, stdout_path, stdout_buffer),
            daemon=True,
        ).start()
    if proc.stderr:
        threading.Thread(
            target=_stream_subprocess_output,
            args=(proc.stderr, stderr_path, stderr_buffer),
            daemon=True,
        ).start()

    start_time = time.monotonic()
    last_status_log = 0.0

    while proc.poll() is None:
        if cancel_event and cancel_event.is_set():
            cancelled = True
            log("[meshroom] Annulation demandee — arret des processus...")
            kill_process_tree(proc.pid, log=log)
            if monitor:
                monitor.mark_cancelled()
            break

        if timeout_seconds and (time.monotonic() - start_time) > timeout_seconds:
            log("[meshroom] Timeout depasse.")
            kill_process_tree(proc.pid, log=log)
            return_code = 124
            break

        if monitor:
            status = monitor.tick()
            elapsed = status.get("elapsed_seconds", 0)
            if time.monotonic() - last_status_log >= 60:
                last_status_log = time.monotonic()
                step = status.get("current_step", "?")
                log(
                    "[meshroom] %s — etape : %s — %s"
                    % (format_elapsed(elapsed), step, status.get("activity_message", ""))
                )
                for err in status.get("detected_errors") or []:
                    log("[meshroom] ERREUR : %s" % err)

        time.sleep(2)

    if not cancelled and proc.poll() is None:
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            kill_process_tree(proc.pid, log=log)

    return_code = proc.returncode if proc.returncode is not None else return_code
    if cancelled:
        return_code = 130

    if monitor:
        monitor.tick(force=True)

    stdout_text = ""
    stderr_text = ""
    try:
        if stdout_path.is_file():
            stdout_text = stdout_path.read_text(encoding="utf-8", errors="replace")
        if stderr_path.is_file():
            stderr_text = stderr_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        stdout_text = "".join(stdout_buffer)
        stderr_text = "".join(stderr_buffer)

    effective_code, command_failed, failure_reason, stderr_excerpt = _analyze_meshroom_batch_result(
        return_code, stdout_text, stderr_text
    )

    pipeline_complete = False
    texturing_finalize_recommended = False
    if monitor and not cancelled:
        pipeline_complete, _cache_state, texturing_finalize_recommended = wait_for_meshroom_pipeline_end(
            monitor,
            effective_code,
            command_failed,
            log=log,
            cancel_event=cancel_event,
            max_wait_seconds=timeout_seconds,
        )
        monitor._texturing_finalize_recommended = texturing_finalize_recommended
        try:
            if stdout_path.is_file():
                stdout_text = stdout_path.read_text(encoding="utf-8", errors="replace")
            if stderr_path.is_file():
                stderr_text = stderr_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            pass
        monitor.tick(force=True)
    elif monitor:
        monitor.mark_meshroom_batch_exited(effective_code)

    if stdout_text:
        for line in stdout_text.strip().splitlines()[-40:]:
            log("  | %s" % line)
    if stderr_text:
        for line in stderr_text.strip().splitlines()[-20:]:
            log("  ! %s" % line)

    if cancelled:
        command_failed = True
        failure_reason = "cancelled_by_user"
        effective_code = 130
        log("[meshroom] Traitement annule par l'utilisateur.")
    elif command_failed:
        log("[meshroom] Echec commande Meshroom (stderr) : %s" % (stderr_excerpt or failure_reason))
        if return_code == 0:
            log(
                "[meshroom] Code sortie brut 0 mais erreur detectee — traite comme echec (code %d)"
                % effective_code
            )
    else:
        log("[meshroom] Code sortie meshroom_batch : %d" % effective_code)

    if monitor and not cancelled and not pipeline_complete and not command_failed:
        log(
            "[meshroom] Attention : pipeline non marque complet (Publish) — "
            "audit final avec prudence."
        )

    return effective_code, stdout_text, stderr_text, command_failed, failure_reason, stderr_excerpt


def run_meshroom_pipeline(
    dataset_input: str | Path,
    output_dir: str | Path,
    meshroom_dir: Optional[str | Path] = None,
    min_images: int = MIN_IMAGES_DEFAULT,
    run_batch: bool = True,
    batch_timeout_seconds: Optional[int] = None,
    log: LogCallback = _noop_log,
    processing_mode: str = "normal",
    cancel_event: Optional[threading.Event] = None,
    force_recompute: bool = True,
) -> MeshroomResult:
    """Pipeline complet : extract JPG -> meshroom_batch -> site-ready valide."""
    run_started_epoch = time.time()
    pipeline_started = time.monotonic()
    base_out = Path(output_dir)

    try:
        return _run_meshroom_pipeline_impl(
            dataset_input,
            output_dir,
            meshroom_dir,
            min_images,
            run_batch,
            batch_timeout_seconds,
            log,
            processing_mode,
            cancel_event,
            force_recompute,
            run_started_epoch,
            pipeline_started,
            base_out,
        )
    except Exception as exc:
        log("[meshroom] ERREUR CRITIQUE pipeline : %s" % exc)
        import traceback

        log(traceback.format_exc())
        target = Path(output_dir) if output_dir else base_out
        result = MeshroomResult(success=False, exit_code=1, output_dir=ensure_directory(target))
        result.error_message = "Erreur interne pipeline : %s" % exc
        result.messages.append(result.error_message)
        try:
            if is_isolated_run_dir(target):
                write_meshroom_summary(target, result, {"batch_exit_code": None})
        except OSError:
            pass
        return result


def _run_meshroom_pipeline_impl(
    dataset_input: str | Path,
    output_dir: str | Path,
    meshroom_dir: Optional[str | Path],
    min_images: int,
    run_batch: bool,
    batch_timeout_seconds: Optional[int],
    log: LogCallback,
    processing_mode: str,
    cancel_event: Optional[threading.Event],
    force_recompute: bool,
    run_started_epoch: float,
    pipeline_started: float,
    base_out: Path,
) -> MeshroomResult:
    if is_isolated_run_dir(base_out):
        output_dir = ensure_directory(base_out)
        run_id = output_dir.name
        _clear_processing_artifacts(output_dir)
    else:
        placeholder_sha = "00000000"
        output_dir, run_id = _ensure_run_output_dir(base_out, placeholder_sha)

    work_dir = ensure_directory(output_dir / "work")
    logs_dir = ensure_directory(output_dir / "logs")
    result = MeshroomResult(success=False, exit_code=2, output_dir=output_dir)
    result.run_id = run_id

    batch_path = find_meshroom_batch(Path(meshroom_dir) if meshroom_dir else None)
    result.meshroom_batch_path = batch_path
    if batch_path:
        result.meshroom_dir = batch_path.parent

    log("[meshroom] Sortie : %s" % output_dir.resolve())

    try:
        images_dir, count, _dataset_root = extract_jpg_images(dataset_input, work_dir, log=log)
        result.images_dir = images_dir
        result.image_count = count
    except Exception as exc:
        result.error_message = str(exc)
        result.messages.append("Extraction images echouee : %s" % exc)
        result.exit_code = 1
        return result

    if count < min_images:
        msg = "Pas assez de photos pour photogrammetrie (%d/%d minimum)." % (count, min_images)
        result.error_message = msg
        result.messages.append(msg)
        result.exit_code = 3
        result.failure_reasons.append(msg)
        log("[meshroom] %s" % msg)
        return result

    result.messages.append("%d images extraites vers work/images/" % count)

    manifest = build_run_manifest(dataset_input, images_dir, count, run_id)
    write_run_manifest(output_dir, manifest)
    result.run_manifest_path = output_dir / "run_manifest.json"
    result.input_source = manifest["input_zip"]
    result.input_sha256 = manifest["input_sha256"]
    result.input_fingerprint = manifest["input_sha256_short"]
    log(
        "[meshroom] Run %s | ZIP %s | sha256 %s | %d images"
        % (run_id, manifest["input_name"], manifest["input_sha256_short"], count)
    )

    if not batch_path:
        msg = (
            "Meshroom non trouve. Installez Meshroom puis selectionnez son dossier "
            "dans l'interface, ou definissez MESHROOM_DIR."
        )
        result.error_message = msg
        result.messages.append(msg)
        result.exit_code = 4
        result.failure_reasons.append("Meshroom absent ou mal configure.")
        log("[meshroom] %s" % msg)
        return result

    work_paths = _prepare_meshroom_work_paths(images_dir, work_dir, run_id, log=log)
    result.meshroom_used_fallback_paths = work_paths.used_fallback
    result.meshroom_fallback_root = work_paths.fallback_root

    meshroom_out = work_paths.meshroom_out
    meshroom_cache = work_paths.meshroom_cache
    if force_recompute:
        for folder in (meshroom_out, meshroom_cache):
            if folder.exists():
                try:
                    shutil.rmtree(folder)
                    log("[meshroom] Cache run efface : %s" % folder.name)
                except OSError as exc:
                    log("[meshroom] Impossible d'effacer %s : %s" % (folder, exc))
    meshroom_out = ensure_directory(meshroom_out)
    meshroom_cache = ensure_directory(meshroom_cache)
    result.meshroom_output_dir = work_dir / "meshroom_out"

    if not run_batch:
        result.messages.append("Mode extraction seule — meshroom_batch non lance.")
        result.exit_code = 0
        return result

    isolated_fallback = work_paths.fallback_root or get_isolated_fallback_root(run_id)
    isolated_env = build_isolated_subprocess_env(
        isolated_fallback,
        result.meshroom_dir if result.meshroom_dir else None,
    )
    log("[meshroom] Cache isole : %s" % isolated_env.get("MESHROOM_CACHE", "?"))
    log("[meshroom] TEMP isole : %s" % isolated_env.get("TEMP", "?"))

    monitor = MeshroomRunMonitor(
        output_dir=output_dir,
        logs_dir=logs_dir,
        cache_dir=meshroom_cache,
        image_count=count,
        fallback_root=work_paths.fallback_root,
        processing_mode=processing_mode,
        run_id=run_id,
        input_sha256_short=manifest.get("input_sha256_short"),
        started_at=datetime.fromtimestamp(run_started_epoch, tz=timezone.utc),
    )
    result.run_status_path = monitor.status_path
    monitor.tick(force=True)
    log("[meshroom] Suivi temps reel : %s" % monitor.status_path)

    (
        code,
        stdout_text,
        stderr_text,
        command_failed,
        failure_reason,
        stderr_excerpt,
    ) = run_meshroom_batch(
        work_paths.images_dir,
        meshroom_out,
        batch_path,
        cache_dir=meshroom_cache,
        log=log,
        timeout_seconds=batch_timeout_seconds,
        logs_dir=logs_dir,
        processing_mode=processing_mode,
        monitor=monitor,
        cancel_event=cancel_event,
        force_recompute=force_recompute,
        isolated_env=isolated_env,
    )
    result.meshroom_launched = True
    result.meshroom_command_failed = command_failed
    result.meshroom_failure_reason = failure_reason
    result.meshroom_stderr_excerpt = stderr_excerpt
    result.last_detected_step = monitor.current_step
    result.elapsed_seconds = monitor.elapsed_seconds()

    if failure_reason == "cancelled_by_user" or (cancel_event and cancel_event.is_set()):
        result.cancelled_by_user = True
        monitor.mark_cancelled()
        result.error_message = "Traitement annule par l'utilisateur."
        result.messages.append(result.error_message)
        result.exit_code = 8
        _clear_site_ready(output_dir / SITE_READY_DIRNAME)
        monitor.tick(force=True)
        write_meshroom_summary(
            output_dir,
            result,
            {"batch_exit_code": code, "cancelled": True},
            stdout_text,
            stderr_text,
            monitor=monitor,
        )
        return result

    if work_paths.used_fallback and work_paths.fallback_root and not command_failed:
        _sync_fallback_meshroom_output(work_paths.fallback_root, work_dir, log=log)

    cache_state = monitor.get_cache_state(force=True)
    result.meshroom_pipeline_complete = bool(
        monitor.pipeline_complete or cache_state.get("pipeline_complete")
    )

    if cache_state.get("pipeline_failed") and not result.meshroom_pipeline_complete:
        failed_step = cache_state.get("failed_step") or "inconnue"
        msg = (
            "Echec pipeline Meshroom a l'etape %s. "
            "Consultez MeshroomCache/<etape>/*/log et logs/meshroom_stderr.log."
        ) % failed_step
        result.error_message = msg
        result.messages.append(msg)
        result.exit_code = 5
        result.failure_reasons.append("Etape %s en erreur (voir cache Meshroom)." % failed_step)
        monitor.mark_failed()
        monitor.tick(force=True)
        write_meshroom_summary(
            output_dir,
            result,
            {"batch_exit_code": code, "pipeline_complete": False, "failed_step": failed_step},
            stdout_text,
            stderr_text,
            monitor=monitor,
        )
        return result

    if result.meshroom_pipeline_complete:
        monitor.mark_pipeline_complete()
    elif cache_state.get("publish_success"):
        monitor.mark_pipeline_complete()
        result.meshroom_pipeline_complete = True
    else:
        texturing_finalize = bool(
            getattr(monitor, "_texturing_finalize_recommended", False)
            or getattr(monitor, "_auto_finalize_triggered", False)
        )
        texturing_info = check_texturing_output_ready(monitor.cache_watch_dirs)
        if texturing_info.get("texturing_output_ready") and (
            texturing_finalize
            or texturing_info.get("publish_auto_finalize_due")
        ):
            log("[meshroom] Publish non termine — finalisation depuis cache Texturing...")
            published = finalize_from_texturing_cache(
                output_dir,
                work_dir,
                image_count=count,
                log=log,
                manifest=manifest,
                fallback_root=work_paths.fallback_root,
                monitor=monitor,
            )
            if published.get("success"):
                result.meshroom_pipeline_complete = False
                result.finalized_from_texturing = True
                result.mesh_source_path = texturing_info.get("textured_mesh_obj") or ""
                result.site_ready_dir = published["site_ready_dir"]
                result.site_ready_model = published["site_ready_model"]
                result.site_ready_format = published["site_ready_format"]
                result.textured = published["textured"]
                result.site_ready_validated = published["site_ready_validated"]
                result.visually_validated = published.get("visually_validated", False)
                result.texture_files = published["texture_files"]
                result.success = True
                result.exit_code = 0
                result.elapsed_seconds = time.monotonic() - pipeline_started
                result.last_detected_step = "Validation finale (Texturing)"
                result.messages.append(
                    "Site-ready genere depuis cache Texturing (Publish non requis)."
                )
                result.messages.append("Fichier site : %s" % result.site_ready_model)
                result.final_audit_performed = True
                search_roots = get_allowed_search_roots(
                    work_dir, output_dir, work_paths.fallback_root
                )
                audit = audit_meshroom_output(
                    search_roots,
                    output_dir,
                    batch_exit_code=code,
                    pipeline_complete=False,
                )
                result.audit_path = write_meshroom_audit_md(audit, output_dir)
                write_meshroom_output_inventory(
                    search_roots,
                    output_dir,
                    fallback_root=work_paths.fallback_root,
                )
                preview_glb = (
                    result.site_ready_model if result.site_ready_format == "glb" else None
                )
                generate_meshroom_preview_html(output_dir, manifest, preview_glb)
                monitor.tick(force=True)
                write_meshroom_summary(
                    output_dir, result, audit, stdout_text, stderr_text, monitor=monitor
                )
                log("[meshroom] site-ready depuis Texturing : %s" % result.site_ready_model)
                return result
            err = published.get("message") or "Finalisation Texturing echouee."
            result.validation_errors = published.get("errors", [])
            result.failure_reasons.append(err)
            log("[meshroom] Finalisation Texturing echouee : %s" % err)

        msg = (
            "Pipeline Meshroom incomplet (etape Publish non terminee). "
            "Consultez logs/meshroom_stdout.log et le cache MeshroomCache."
        )
        if texturing_info.get("texturing_output_ready"):
            msg += (
                " Sortie Texturing prete — utilisez « Finaliser depuis Texturing » "
                "ou attendez la finalisation automatique (%d min)."
                % int(PUBLISH_AUTO_FINALIZE_SEC / 60)
            )
        result.error_message = msg
        result.messages.append(msg)
        result.exit_code = 5
        result.failure_reasons.append("Publish non termine ou pipeline interrompu trop tot.")
        monitor.mark_failed()
        monitor.tick(force=True)
        write_meshroom_summary(
            output_dir,
            result,
            {"batch_exit_code": code, "pipeline_complete": False},
            stdout_text,
            stderr_text,
            monitor=monitor,
        )
        return result

    monitor.tick(force=True)
    result.final_audit_performed = True

    search_roots = get_allowed_search_roots(work_dir, output_dir, work_paths.fallback_root)
    log("[meshroom] Racines autorisees (run courant uniquement) : %d" % len(search_roots))
    audit = audit_meshroom_output(
        search_roots,
        output_dir,
        batch_exit_code=code,
        pipeline_complete=result.meshroom_pipeline_complete,
    )
    result.audit_path = write_meshroom_audit_md(audit, output_dir)
    inventory_path = write_meshroom_output_inventory(
        search_roots,
        output_dir,
        fallback_root=work_paths.fallback_root,
    )
    log("[meshroom] Audit ecrit : %s" % result.audit_path.name)
    log("[meshroom] Inventaire : %s" % inventory_path.name)

    if code != 0 or command_failed:
        if command_failed and failure_reason == "command_line_argument_error":
            msg = (
                "meshroom_batch : erreur de ligne de commande (chemins avec espaces ou arguments invalides). "
                "Voir logs/meshroom_stderr.log"
            )
        else:
            msg = "meshroom_batch a echoue (code %d). Voir logs/meshroom_stderr.log" % code
        result.error_message = msg
        result.messages.append(msg)
        if stderr_excerpt:
            result.messages.append(stderr_excerpt)
        result.exit_code = 5
        result.failure_reasons = _meshroom_failure_reasons(count, audit)
        if command_failed:
            result.failure_reasons.insert(
                0,
                "Echec lancement Meshroom : %s" % (failure_reason or "commande"),
            )
        monitor.mark_failed()
        monitor.tick(force=True)
        write_meshroom_summary(output_dir, result, audit, stdout_text, stderr_text, monitor=monitor)
        return result

    mesh_info = _find_textured_mesh(
        search_roots,
        require_textures=True,
        preferred_roots=search_roots,
    )

    if mesh_info:
        result.mesh_source_path = str(mesh_info["obj"].resolve())
        ok_prov, prov_reason = validate_mesh_provenance(
            mesh_info,
            search_roots,
            work_paths.images_dir,
            run_started_epoch,
            manifest,
        )
        if not ok_prov:
            result.provenance_rejected = True
            result.provenance_reason = prov_reason
            result.error_message = (
                "Resultat rejete : provenance du modele non liee au ZIP courant."
            )
            result.messages.append(result.error_message)
            result.messages.append(prov_reason)
            result.exit_code = 9
            _clear_site_ready(output_dir / SITE_READY_DIRNAME)
            log("[meshroom] REJET PROVENANCE : %s" % prov_reason)
            monitor.mark_failed()
            monitor.tick(force=True)
            write_meshroom_summary(
                output_dir, result, audit, stdout_text, stderr_text, monitor=monitor
            )
            return result
        log("[meshroom] Provenance OK — modele du run courant : %s" % mesh_info["obj"])

    if not mesh_info:
        msg = (
            "Aucun modele texturé Meshroom genere. "
            "Meshroom n'a pas produit de sortie exploitable (pas de map_Kd / textures)."
        )
        result.error_message = msg
        result.messages.append(msg)
        result.exit_code = 6
        result.failure_reasons = _meshroom_failure_reasons(count, audit)
        _clear_site_ready(output_dir / SITE_READY_DIRNAME)
        log("[meshroom] %s" % msg)
        for reason in result.failure_reasons:
            log("[meshroom] Cause possible : %s" % reason)
        monitor.mark_failed()
        monitor.tick(force=True)
        write_meshroom_summary(output_dir, result, audit, stdout_text, stderr_text, monitor=monitor)
        return result

    log("[meshroom] OBJ texturé detecte : %s" % mesh_info["obj"])
    monitor.set_post_step("Conversion EXR → PNG")
    monitor.tick(force=True)
    published = publish_site_ready(
        output_dir, mesh_info, count, log=log, manifest=manifest
    )
    monitor.set_post_step("Validation finale")
    monitor.tick(force=True)

    if not published.get("success"):
        result.error_message = published.get(
            "message",
            "Aucun modele texturé généré. Meshroom n'a pas produit de sortie exploitable.",
        )
        result.validation_errors = published.get("errors", [])
        result.messages.append(result.error_message)
        result.exit_code = 7
        result.failure_reasons = _meshroom_failure_reasons(count, audit)
        if published.get("errors"):
            for err in published["errors"]:
                log("[meshroom] Validation : %s" % err)
        _clear_site_ready(output_dir / SITE_READY_DIRNAME)
        monitor.mark_failed()
        monitor.tick(force=True)
        write_meshroom_summary(output_dir, result, audit, stdout_text, stderr_text, monitor=monitor)
        return result

    result.site_ready_dir = published["site_ready_dir"]
    result.site_ready_model = published["site_ready_model"]
    result.site_ready_format = published["site_ready_format"]
    result.textured = published["textured"]
    result.site_ready_validated = published["site_ready_validated"]
    result.visually_validated = published.get("visually_validated", False)
    result.texture_files = published["texture_files"]

    result.success = True
    result.exit_code = 0
    result.elapsed_seconds = time.monotonic() - pipeline_started
    result.last_detected_step = "Validation finale"
    result.messages.append("Modele texturé visuellement valide genere.")
    result.messages.append("Fichier site : %s" % result.site_ready_model)
    result.messages.append("Format : %s" % result.site_ready_format)
    log("[meshroom] site-ready valide : %s" % result.site_ready_model)
    log("[meshroom] Modele texturé pret pour le site : %s" % result.site_ready_model)
    preview_glb = result.site_ready_model if result.site_ready_format == "glb" else None
    generate_meshroom_preview_html(output_dir, manifest, preview_glb)
    log("[meshroom] Preview run : %s/preview.html" % output_dir)

    monitor.mark_success()
    monitor.set_post_step("Validation finale")
    monitor.tick(force=True)
    write_meshroom_summary(output_dir, result, audit, stdout_text, stderr_text, monitor=monitor)
    return result
