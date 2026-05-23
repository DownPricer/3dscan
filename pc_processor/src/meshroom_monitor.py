#!/usr/bin/env python3
"""Suivi temps réel Meshroom : étapes, logs, watchdog, run_status.json."""
from __future__ import annotations

import json
import os
import re
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from pc_processor_core import ensure_directory
from model_validation import mtl_has_map_kd_files


LogCallback = Callable[[str], None]

# Publish lent : avertissement GUI puis finalisation auto depuis cache Texturing
PUBLISH_SLOW_WARN_SEC = 600.0
PUBLISH_AUTO_FINALIZE_SEC = 900.0
TEXTURING_OBJ_NAMES = ("texturedmesh.obj",)
TEXTURE_GLOB_PATTERNS = (
    "texture_*.exr",
    "texture_*.png",
    "texture_*.jpg",
    "texture_*.jpeg",
)

MESHROOM_PIPELINE_STEPS = [
    "CameraInit",
    "FeatureExtraction",
    "ImageMatching",
    "FeatureMatching",
    "StructureFromMotion",
    "PrepareDenseScene",
    "DepthMap",
    "DepthMapFilter",
    "Meshing",
    "MeshFiltering",
    "Texturing",
    "Publish",
]

POST_MESHROOM_STEPS = [
    "Conversion EXR → PNG",
    "Conversion GLB",
    "Validation finale",
]

ERROR_KEYWORDS = (
    "error:",
    " failed",
    "failed:",
    "cuda error",
    "not enough",
    "no output",
    "out of memory",
    "access denied",
    "traceback",
    "exception",
)

ERROR_LINE_SKIP = (
    "erroronmissingcolorprofile",
    "program called with the following parameters",
    "verboselevel",
)

STEP_PATTERNS = [
    (re.compile(r"\[\d+/\d+\]\s*(\w+)", re.I), 1),
    (re.compile(r"Starting Process for '(\w+)_", re.I), 1),
    (re.compile(r"(\w+)\s+report\s*:", re.I), 1),
    (re.compile(r"aliceVision_(\w+)", re.I), 1),
    (re.compile(r"MeshroomCache[/\\](\w+)[/\\]", re.I), 1),
]

ACTIVE_NODE_STATUSES = frozenset({"RUNNING", "SUBMITTED", "STARTED"})
TERMINAL_FAIL_STATUSES = frozenset({"ERROR", "FAILED", "STOPPED"})
CACHE_SCAN_INTERVAL_SEC = 4.0
TASKLIST_INTERVAL_SEC = 15.0
WAIT_LOG_INTERVAL_SEC = 60.0

STEP_NAME_MAP = {
    "camerainit": "CameraInit",
    "featureextraction": "FeatureExtraction",
    "imagematching": "ImageMatching",
    "featurematching": "FeatureMatching",
    "incrementalsfm": "StructureFromMotion",
    "structurefrommotion": "StructureFromMotion",
    "preparedensescene": "PrepareDenseScene",
    "depthmap": "DepthMap",
    "depthmapfilter": "DepthMapFilter",
    "meshing": "Meshing",
    "meshfiltering": "MeshFiltering",
    "texturing": "Texturing",
    "publish": "Publish",
}


def _normalize_step(name: str) -> Optional[str]:
    key = name.lower().replace("_", "")
    if key in STEP_NAME_MAP:
        return STEP_NAME_MAP[key]
    for step in MESHROOM_PIPELINE_STEPS:
        if step.lower() == key or key.startswith(step.lower()):
            return step
    return None


def _detect_step_from_text(text: str) -> Optional[str]:
    if not text:
        return None
    for line in reversed(text.splitlines()):
        stripped = line.strip()
        if not stripped:
            continue
        for pattern, group in STEP_PATTERNS:
            match = pattern.search(stripped)
            if match:
                normalized = _normalize_step(match.group(group))
                if normalized:
                    return normalized
    return None


def _is_useful_log_line(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    if s.startswith("* ") and "=" in s:
        return False
    if "Program called with the following parameters" in s:
        return False
    if "Embedded OCIO configuration" in s:
        return False
    return True


def _extract_error_lines(text: str, max_lines: int = 5) -> List[str]:
    found: List[str] = []
    for line in text.splitlines():
        lower = line.lower()
        if any(skip in lower for skip in ERROR_LINE_SKIP):
            continue
        if any(kw in lower for kw in ERROR_KEYWORDS):
            stripped = line.strip()
            if stripped and stripped not in found:
                found.append(stripped)
        if len(found) >= max_lines:
            break
    return found


def resolve_meshroom_cache_watch_dirs(
    cache_dir: Path,
    fallback_root: Optional[Path] = None,
) -> List[Path]:
    """Dossiers MeshroomCache reels (meshroom_batch utilise souvent TEMP/temp/MeshroomCache)."""
    roots: List[Path] = []
    seen: set[str] = set()

    def add(path: Path) -> None:
        if not path.exists():
            return
        key = str(path.resolve())
        if key not in seen:
            seen.add(key)
            roots.append(path.resolve())

    cache_dir = Path(cache_dir)
    add(cache_dir)
    meshroom_cache = cache_dir / "MeshroomCache"
    if meshroom_cache.is_dir():
        add(meshroom_cache)

    if fallback_root:
        fb = Path(fallback_root)
        add(fb / "meshroom_cache")
        add(fb / "meshroom_cache" / "MeshroomCache")
        temp_dir = fb / "temp"
        add(temp_dir / "MeshroomCache")
        add(temp_dir)

    return roots


def _meshroom_cache_roots(watch_dirs: List[Path]) -> List[Path]:
    roots: List[Path] = []
    seen: set[str] = set()
    for base in watch_dirs:
        base = Path(base)
        candidates = [base]
        if base.name.lower() != "meshroomcache":
            inner = base / "MeshroomCache"
            if inner.is_dir():
                candidates.append(inner)
        for candidate in candidates:
            if not candidate.is_dir():
                continue
            key = str(candidate.resolve())
            if key not in seen:
                seen.add(key)
                roots.append(candidate)
    return roots


def _read_node_status(path: Path) -> Optional[Dict[str, Any]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _status_files_to_scan(node_dir: Path) -> List[Path]:
    """Evite de lire des centaines de *.status (chunks FeatureMatching)."""
    paths: List[Path] = []
    single = node_dir / "status"
    if single.is_file():
        paths.append(single)
    numbered = sorted(node_dir.glob("*.status"), key=lambda p: p.stat().st_mtime if p.exists() else 0)
    if numbered:
        paths.append(numbered[-1])
        for path in reversed(numbered):
            data = _read_node_status(path)
            if data and str(data.get("status", "")).upper() in ACTIVE_NODE_STATUSES:
                return [path]
    return paths


def _collect_texture_files_in_dir(directory: Path) -> List[Path]:
    found: Dict[str, Path] = {}
    if not directory.is_dir():
        return []
    for pattern in TEXTURE_GLOB_PATTERNS:
        try:
            for tex in directory.glob(pattern):
                if tex.is_file():
                    found[str(tex.resolve())] = tex
        except OSError:
            continue
    try:
        for tex in directory.rglob("texture_*"):
            if tex.is_file() and tex.suffix.lower() in (".exr", ".png", ".jpg", ".jpeg"):
                found[str(tex.resolve())] = tex
    except OSError:
        pass
    return list(found.values())


def _texturing_node_dirs(watch_dirs: List[Path]) -> List[Path]:
    """Dossiers noeud Meshroom Texturing (hash) dans le cache du run."""
    nodes: List[Path] = []
    seen: set[str] = set()
    for cache_root in _meshroom_cache_roots(watch_dirs):
        texturing_step = cache_root / "Texturing"
        if not texturing_step.is_dir():
            continue
        try:
            for node_dir in texturing_step.iterdir():
                if not node_dir.is_dir():
                    continue
                key = str(node_dir.resolve())
                if key not in seen:
                    seen.add(key)
                    nodes.append(node_dir)
        except OSError:
            continue
    return nodes


def check_texturing_output_ready(watch_dirs: List[Path]) -> Dict[str, Any]:
    """
    Verifie que Texturing a produit un mesh exploitable (OBJ/MTL/texture + map_Kd).
    Utilise pour finaliser site-ready sans attendre Publish.
    """
    cache_state = scan_meshroom_cache_state(watch_dirs)
    result: Dict[str, Any] = {
        "texturing_output_ready": False,
        "texturing_success": bool(cache_state.get("texturing_success")),
        "texturing_output_path": None,
        "textured_mesh_obj": None,
        "textured_mesh_mtl": None,
        "texture_files_found": [],
        "mtl_has_map_kd": False,
        "publish_slow_warning": False,
        "publish_auto_finalize_due": False,
    }

    candidates: List[Tuple[int, Path, Path, Optional[Path], List[Path]]] = []

    def add_candidate(score: int, obj: Path, mtl: Optional[Path], textures: List[Path]) -> None:
        candidates.append((score, obj, mtl, textures))

    for node_dir in _texturing_node_dirs(watch_dirs):
        for obj_name in TEXTURING_OBJ_NAMES:
            obj_path = node_dir / obj_name
            if not obj_path.is_file():
                try:
                    matches = list(node_dir.rglob(obj_name))
                    obj_path = matches[0] if matches else None
                except OSError:
                    obj_path = None
            if not obj_path or not obj_path.is_file():
                continue
            mtl_path = obj_path.with_suffix(".mtl")
            if not mtl_path.is_file():
                parent_mtls = list(obj_path.parent.glob("*.mtl"))
                mtl_path = parent_mtls[0] if parent_mtls else None
            textures = _collect_texture_files_in_dir(obj_path.parent)
            if mtl_path and mtl_path.parent != obj_path.parent:
                textures.extend(_collect_texture_files_in_dir(mtl_path.parent))
            score = 100
            if "texturing" in str(obj_path).lower():
                score += 50
            add_candidate(score, obj_path, mtl_path, textures)

    for cache_root in _meshroom_cache_roots(watch_dirs):
        try:
            for obj_path in cache_root.rglob("texturedMesh.obj"):
                if not obj_path.is_file():
                    continue
                parts = "/".join(p.lower() for p in obj_path.parts)
                if "texturing" not in parts and "publish" in parts:
                    continue
                mtl_path = obj_path.with_suffix(".mtl")
                if not mtl_path.is_file():
                    parent_mtls = list(obj_path.parent.glob("*.mtl"))
                    mtl_path = parent_mtls[0] if parent_mtls else None
                textures = _collect_texture_files_in_dir(obj_path.parent)
                score = 80 if "texturing" in parts else 40
                add_candidate(score, obj_path, mtl_path, textures)
        except OSError:
            continue

    if not candidates:
        return result

    candidates.sort(key=lambda item: item[0], reverse=True)
    _score, obj_path, mtl_path, texture_list = candidates[0]
    has_map, resolved = (
        mtl_has_map_kd_files(mtl_path, obj_path.parent)
        if mtl_path and mtl_path.is_file()
        else (False, [])
    )
    merged_textures: Dict[str, Path] = {str(p.resolve()): p for p in texture_list}
    for tex in resolved:
        merged_textures[str(tex.resolve())] = tex
    texture_files = list(merged_textures.values())

    result["textured_mesh_obj"] = str(obj_path.resolve())
    result["textured_mesh_mtl"] = str(mtl_path.resolve()) if mtl_path else None
    result["texture_files_found"] = [str(p) for p in texture_files]
    result["mtl_has_map_kd"] = has_map
    result["texturing_output_path"] = str(obj_path.parent.resolve())

    files_ok = (
        obj_path.is_file()
        and mtl_path
        and mtl_path.is_file()
        and bool(texture_files)
        and has_map
    )
    result["texturing_output_ready"] = bool(files_ok)
    return result


def scan_meshroom_cache_state(watch_dirs: List[Path]) -> Dict[str, Any]:
    """
    Etat pipeline depuis MeshroomCache/*/hash/status.
    meshroom_batch peut quitter avant la fin des noeuds AliceVision.
    """
    publish_success = False
    publish_failed = False
    texturing_success = False
    any_active = False
    any_failed = False
    failed_step: Optional[str] = None
    latest_step: Optional[str] = None
    latest_mtime = 0.0
    running_step: Optional[str] = None
    running_rank = -1

    for cache_root in _meshroom_cache_roots(watch_dirs):
        try:
            for step_dir in cache_root.iterdir():
                if not step_dir.is_dir():
                    continue
                step_name = _normalize_step(step_dir.name) or step_dir.name
                try:
                    step_rank = MESHROOM_PIPELINE_STEPS.index(step_name)
                except ValueError:
                    step_rank = -1
                for node_dir in step_dir.iterdir():
                    if not node_dir.is_dir():
                        continue
                    try:
                        node_mtime = node_dir.stat().st_mtime
                    except OSError:
                        node_mtime = 0.0
                    if node_mtime >= latest_mtime:
                        latest_mtime = node_mtime
                        latest_step = step_name

                    for status_path in _status_files_to_scan(node_dir):
                        data = _read_node_status(status_path)
                        if not data:
                            continue
                        node_type = data.get("nodeType") or step_dir.name
                        norm = _normalize_step(str(node_type)) or step_name
                        try:
                            norm_rank = MESHROOM_PIPELINE_STEPS.index(norm)
                        except ValueError:
                            norm_rank = step_rank
                        status = str(data.get("status", "")).upper()
                        if status in ACTIVE_NODE_STATUSES:
                            any_active = True
                            if norm_rank >= running_rank:
                                running_rank = norm_rank
                                running_step = norm
                        elif status in TERMINAL_FAIL_STATUSES:
                            any_failed = True
                            failed_step = failed_step or norm
                            if norm == "Publish":
                                publish_failed = True
                        elif status == "SUCCESS" and norm == "Publish":
                            publish_success = True
                        elif status == "SUCCESS" and norm == "Texturing":
                            texturing_success = True
        except OSError:
            pass

    current = running_step or latest_step
    return {
        "current_step": current,
        "publish_success": publish_success,
        "publish_failed": publish_failed,
        "texturing_success": texturing_success,
        "pipeline_active": any_active,
        "pipeline_failed": any_failed,
        "failed_step": failed_step,
        "pipeline_complete": publish_success and not any_active,
    }


def _quick_cache_activity_marker(watch_dirs: List[Path]) -> int:
    """Signal leger de croissance cache (sans os.walk sur tout le cache)."""
    marker = 0
    for cache_root in _meshroom_cache_roots(watch_dirs):
        try:
            marker += int(cache_root.stat().st_mtime)
            for step_dir in cache_root.iterdir():
                if not step_dir.is_dir():
                    continue
                marker += int(step_dir.stat().st_mtime)
                for node_dir in step_dir.iterdir():
                    if node_dir.is_dir():
                        marker += int(node_dir.stat().st_mtime)
        except OSError:
            pass
    return marker


def _dir_size_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    total = 0
    try:
        if path.is_file():
            return path.stat().st_size
        for root, _dirs, files in os.walk(path):
            for name in files:
                try:
                    total += (Path(root) / name).stat().st_size
                except OSError:
                    pass
    except OSError:
        pass
    return total


def _file_size(path: Path) -> int:
    try:
        return path.stat().st_size if path.is_file() else 0
    except OSError:
        return 0


def _alicevision_processes_running() -> bool:
    if os.name != "nt":
        return False
    try:
        completed = subprocess.run(
            ["tasklist", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        text = (completed.stdout or "").lower()
        return "alicevision_" in text
    except (OSError, subprocess.SubprocessError):
        return False


def _process_alive(pid: Optional[int]) -> bool:
    if pid is None or pid <= 0:
        return False
    if os.name == "nt":
        try:
            completed = subprocess.run(
                ["tasklist", "/FI", "PID eq %d" % pid, "/FO", "CSV", "/NH"],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            out = completed.stdout or ""
            return str(pid) in out and "aucune" not in out.lower() and "no tasks" not in out.lower()
        except (OSError, subprocess.SubprocessError):
            return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def kill_process_tree(pid: int, log: LogCallback | None = None) -> None:
    if pid <= 0:
        return
    if os.name == "nt":
        try:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                capture_output=True,
                timeout=30,
                check=False,
            )
            if log:
                log("[meshroom] Processus arrete (PID %d)." % pid)
        except (OSError, subprocess.SubprocessError) as exc:
            if log:
                log("[meshroom] taskkill echoue : %s" % exc)
    else:
        try:
            import signal

            os.killpg(os.getpgid(pid), signal.SIGTERM)
        except (OSError, ProcessLookupError):
            try:
                os.kill(pid, 9)
            except OSError:
                pass


@dataclass
class ActivitySnapshot:
    stdout_size: int = 0
    stderr_size: int = 0
    cache_size: int = 0
    log_file_path: Optional[str] = None
    log_file_size: int = 0
    alicevision_running: bool = False
    process_alive: bool = False


class MeshroomRunMonitor:
    """Met a jour run_status.json et detecte etapes / blocages."""

    def __init__(
        self,
        output_dir: Path,
        logs_dir: Path,
        cache_dir: Path,
        image_count: int = 0,
        fallback_root: Optional[Path] = None,
        processing_mode: str = "normal",
        started_at: Optional[datetime] = None,
        run_id: Optional[str] = None,
        input_sha256_short: Optional[str] = None,
    ) -> None:
        self.output_dir = Path(output_dir)
        self.logs_dir = ensure_directory(logs_dir)
        self.cache_dir = Path(cache_dir)
        self.cache_watch_dirs = resolve_meshroom_cache_watch_dirs(cache_dir, fallback_root)
        self.image_count = image_count
        self.fallback_root = fallback_root
        self.processing_mode = processing_mode
        self.run_id = run_id or output_dir.name
        self.input_sha256_short = input_sha256_short or ""
        self.started_at = started_at or datetime.now(timezone.utc)
        self.status_path = self.logs_dir / "run_status.json"

        self.current_step = "Demarrage"
        self.last_log_line = ""
        self.status = "running"
        self.process_pid: Optional[int] = None
        self.detected_errors: List[str] = []
        self.cancelled_by_user = False
        self.meshroom_batch_exited = False
        self.meshroom_batch_exit_code: Optional[int] = None
        self.pipeline_complete = False
        self.final_audit_allowed = False

        self._last_activity_time = time.monotonic()
        self._prev_snapshot = ActivitySnapshot()
        self._stall_warning_5min = False
        self._stall_warning_15min = False
        self._activity_message = (
            "Meshroom en cours — le fichier final sera cree apres Publish."
        )
        self._post_step: Optional[str] = None
        self._cache_state_cached: Optional[Dict[str, Any]] = None
        self._cache_state_monotonic = 0.0
        self._alicevision_cached = False
        self._alicevision_check_monotonic = 0.0
        self._cache_activity_marker = 0
        self._publish_step_started_monotonic: Optional[float] = None
        self._texturing_output_cached: Optional[Dict[str, Any]] = None
        self._texturing_check_monotonic = 0.0
        self._auto_finalize_triggered = False
        self._texturing_finalize_recommended = False

    def set_process_pid(self, pid: int) -> None:
        self.process_pid = pid

    def set_post_step(self, step: str) -> None:
        self._post_step = step
        self.current_step = step

    def mark_cancelled(self) -> None:
        self.cancelled_by_user = True
        self.status = "cancelled"

    def mark_meshroom_batch_exited(self, exit_code: int) -> None:
        self.meshroom_batch_exited = True
        self.meshroom_batch_exit_code = exit_code
        if self.status == "running":
            self.status = "meshroom_finishing"
            self._activity_message = (
                "meshroom_batch termine — attente fin des etapes AliceVision (Publish)..."
            )

    def mark_pipeline_complete(self) -> None:
        self.pipeline_complete = True
        self.final_audit_allowed = True
        if self.status in ("running", "meshroom_finishing", "stalled"):
            self.status = "meshroom_finished"

    def mark_success(self) -> None:
        self.status = "success"
        self.final_audit_allowed = True
        self.pipeline_complete = True

    def mark_failed(self) -> None:
        if self.status != "cancelled":
            self.status = "failed"
        self.final_audit_allowed = True

    def mark_stalled(self) -> None:
        if self.status in ("running", "meshroom_finishing"):
            self.status = "stalled"

    def elapsed_seconds(self) -> float:
        return (datetime.now(timezone.utc) - self.started_at).total_seconds()

    def get_cache_state(self, force: bool = False) -> Dict[str, Any]:
        now = time.monotonic()
        if (
            not force
            and self._cache_state_cached is not None
            and (now - self._cache_state_monotonic) < CACHE_SCAN_INTERVAL_SEC
        ):
            return self._cache_state_cached
        state = scan_meshroom_cache_state(self.cache_watch_dirs)
        self._cache_state_cached = state
        self._cache_state_monotonic = now
        return state

    def _alicevision_running_throttled(self) -> bool:
        now = time.monotonic()
        if (now - self._alicevision_check_monotonic) < TASKLIST_INTERVAL_SEC:
            return self._alicevision_cached
        self._alicevision_check_monotonic = now
        self._alicevision_cached = _alicevision_processes_running()
        return self._alicevision_cached

    def _read_log_files(self) -> Tuple[str, str]:
        stdout_path = self.logs_dir / "meshroom_stdout.log"
        stderr_path = self.logs_dir / "meshroom_stderr.log"
        stdout_text = ""
        stderr_text = ""
        try:
            if stdout_path.is_file():
                stdout_text = stdout_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            pass
        try:
            if stderr_path.is_file():
                stderr_text = stderr_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            pass
        return stdout_text, stderr_text

    def get_useful_log_tail(self, n: int = 20) -> List[str]:
        stdout_text, stderr_text = self._read_log_files()
        combined = (stdout_text + "\n" + stderr_text).splitlines()
        useful = [ln for ln in combined if _is_useful_log_line(ln)]
        return useful[-n:]

    def _find_latest_cache_log(self) -> Tuple[Optional[Path], int]:
        latest: Optional[Path] = None
        latest_mtime = 0.0
        for watch in self.cache_watch_dirs:
            if not watch.is_dir():
                continue
            try:
                for path in watch.rglob("*.log"):
                    if not path.is_file():
                        continue
                    mtime = path.stat().st_mtime
                    if mtime >= latest_mtime:
                        latest_mtime = mtime
                        latest = path
            except OSError:
                pass
        size = _file_size(latest) if latest else 0
        return latest, size

    def _take_snapshot(self) -> ActivitySnapshot:
        stdout_path = self.logs_dir / "meshroom_stdout.log"
        stderr_path = self.logs_dir / "meshroom_stderr.log"
        log_file, log_size = self._find_latest_cache_log()
        cache_state = self.get_cache_state()
        pipeline_active = bool(cache_state.get("pipeline_active"))
        av_running = self._alicevision_running_throttled() if not self.meshroom_batch_exited else False
        proc_alive = _process_alive(self.process_pid)
        return ActivitySnapshot(
            stdout_size=_file_size(stdout_path),
            stderr_size=_file_size(stderr_path),
            cache_size=_quick_cache_activity_marker(self.cache_watch_dirs),
            log_file_path=str(log_file) if log_file else None,
            log_file_size=log_size,
            alicevision_running=av_running or pipeline_active,
            process_alive=proc_alive,
        )

    def _check_activity_delta(self, snap: ActivitySnapshot) -> bool:
        prev = self._prev_snapshot
        if snap.stdout_size > prev.stdout_size:
            return True
        if snap.stderr_size > prev.stderr_size:
            return True
        if snap.cache_size != prev.cache_size:
            return True
        if snap.log_file_size > prev.log_file_size:
            return True
        if snap.log_file_path and snap.log_file_path != prev.log_file_path:
            return True
        if snap.alicevision_running:
            return True
        if snap.process_alive and prev.process_alive:
            return True
        return False

    def tick(self, force: bool = False) -> Dict[str, Any]:
        """Analyse l'etat et ecrit run_status.json. Retourne le dict statut."""
        stdout_text, stderr_text = self._read_log_files()
        combined = stdout_text + "\n" + stderr_text

        step = _detect_step_from_text(combined)
        cache_state = self.get_cache_state(force=force)
        cache_step = cache_state.get("current_step")
        if self._post_step:
            step = self._post_step
        elif cache_step:
            step = cache_step
        elif step:
            pass
        if step:
            self.current_step = step

        now = time.monotonic()

        if self.current_step == "Publish":
            if self._publish_step_started_monotonic is None:
                self._publish_step_started_monotonic = now
        elif self._publish_step_started_monotonic is not None and self.current_step not in (
            "Publish",
            None,
        ):
            pass
        else:
            if self.current_step != "Publish":
                self._publish_step_started_monotonic = None

        publish_elapsed = 0.0
        if self._publish_step_started_monotonic is not None:
            publish_elapsed = now - self._publish_step_started_monotonic

        if (now - self._texturing_check_monotonic) >= CACHE_SCAN_INTERVAL_SEC or force:
            self._texturing_output_cached = check_texturing_output_ready(self.cache_watch_dirs)
            self._texturing_check_monotonic = now
        texturing_info = self._texturing_output_cached or {}

        if cache_state.get("pipeline_complete"):
            self.pipeline_complete = True

        useful = [ln for ln in combined.splitlines() if _is_useful_log_line(ln)]
        if useful:
            self.last_log_line = useful[-1].strip()[:500]

        errors = _extract_error_lines(combined)
        if errors:
            self.detected_errors = errors[-5:]

        snap = self._take_snapshot()
        meshroom_alive = (
            snap.process_alive
            or snap.alicevision_running
            or cache_state.get("pipeline_active")
        )

        if self._check_activity_delta(snap) or force:
            self._last_activity_time = now
            if not self._post_step:
                self._activity_message = (
                    "Meshroom en cours — le fichier final sera cree apres Publish."
                )
            self._stall_warning_5min = False
            self._stall_warning_15min = False
            if self.status == "stalled":
                self.status = "meshroom_finishing" if self.meshroom_batch_exited else "running"
        else:
            inactive_sec = now - self._last_activity_time
            if inactive_sec >= 900 and meshroom_alive:
                self._activity_message = (
                    "Le traitement semble bloque. Vous pouvez annuler ou continuer."
                )
                self._stall_warning_15min = True
                self.mark_stalled()
            elif inactive_sec >= 300 and meshroom_alive:
                self._activity_message = (
                    "Attention : aucune activite Meshroom detectee depuis 5 minutes."
                )
                self._stall_warning_5min = True
            elif meshroom_alive:
                if (
                    self.meshroom_batch_exited
                    and self.current_step == "Publish"
                    and texturing_info.get("texturing_output_ready")
                    and publish_elapsed >= PUBLISH_SLOW_WARN_SEC
                ):
                    self._activity_message = (
                        "Texturing termine. Publish prend trop de temps. "
                        "Vous pouvez finaliser depuis Texturing."
                    )
                elif self.meshroom_batch_exited:
                    self._activity_message = (
                        "meshroom_batch termine — etapes AliceVision encore en cours..."
                    )
                else:
                    self._activity_message = (
                        "Meshroom en cours — le fichier final sera cree apres Publish."
                    )
            elif (
                self.meshroom_batch_exited
                and not self.pipeline_complete
                and self.current_step == "Publish"
                and texturing_info.get("texturing_output_ready")
            ):
                if publish_elapsed >= PUBLISH_SLOW_WARN_SEC:
                    self._activity_message = (
                        "Texturing termine. Publish prend trop de temps. "
                        "Vous pouvez finaliser depuis Texturing."
                    )
                else:
                    self._activity_message = (
                        "Publish en cours — sortie Texturing deja prete."
                    )
            elif self.meshroom_batch_exited and not self.pipeline_complete:
                self._activity_message = (
                    "Attente fin de pipeline (verifier cache Meshroom)..."
                )
            elif not self.final_audit_allowed:
                self._activity_message = (
                    "Meshroom en cours — le fichier final sera cree apres Publish."
                )

        if self.status in ("running", "meshroom_finishing", "stalled"):
            self.final_audit_allowed = False

        self._prev_snapshot = snap

        payload = {
            "started_at": self.started_at.isoformat(),
            "run_id": self.run_id,
            "input_sha256_short": self.input_sha256_short,
            "elapsed_seconds": round(self.elapsed_seconds(), 1),
            "image_count": self.image_count,
            "current_step": self.current_step,
            "last_log_line": self.last_log_line,
            "process_alive": snap.process_alive,
            "meshroom_process_alive": meshroom_alive,
            "alicevision_running": snap.alicevision_running,
            "meshroom_batch_exited": self.meshroom_batch_exited,
            "meshroom_batch_exit_code": self.meshroom_batch_exit_code,
            "pipeline_complete": self.pipeline_complete,
            "pipeline_active": cache_state.get("pipeline_active"),
            "publish_success": cache_state.get("publish_success"),
            "texturing_success": cache_state.get("texturing_success"),
            "texturing_output_ready": texturing_info.get("texturing_output_ready", False),
            "texturing_output_path": texturing_info.get("texturing_output_path"),
            "textured_mesh_obj": texturing_info.get("textured_mesh_obj"),
            "textured_mesh_mtl": texturing_info.get("textured_mesh_mtl"),
            "texturing_texture_files": texturing_info.get("texture_files_found", []),
            "texturing_mtl_has_map_kd": texturing_info.get("mtl_has_map_kd", False),
            "publish_elapsed_seconds": round(publish_elapsed, 1),
            "publish_slow_warning": (
                self.current_step == "Publish"
                and texturing_info.get("texturing_output_ready")
                and publish_elapsed >= PUBLISH_SLOW_WARN_SEC
                and not cache_state.get("publish_success")
            ),
            "publish_auto_finalize_due": (
                self.current_step == "Publish"
                and texturing_info.get("texturing_output_ready")
                and publish_elapsed >= PUBLISH_AUTO_FINALIZE_SEC
                and not cache_state.get("publish_success")
            ),
            "auto_finalize_triggered": self._auto_finalize_triggered,
            "failed_step": cache_state.get("failed_step"),
            "final_audit_allowed": self.final_audit_allowed,
            "last_activity_time": datetime.fromtimestamp(
                time.time() - (now - self._last_activity_time), tz=timezone.utc
            ).isoformat(),
            "inactive_seconds": round(now - self._last_activity_time, 1),
            "output_folder": str(self.output_dir.resolve()),
            "fallback_root": str(self.fallback_root.resolve()) if self.fallback_root else "",
            "cache_folder": str(self.cache_dir.resolve()),
            "logs_folder": str(self.logs_dir.resolve()),
            "processing_mode": self.processing_mode,
            "status": self.status,
            "activity_message": self._activity_message,
            "stall_warning_5min": self._stall_warning_5min,
            "stall_warning_15min": self._stall_warning_15min,
            "detected_errors": self.detected_errors,
            "useful_log_tail": self.get_useful_log_tail(20),
            "cancelled_by_user": self.cancelled_by_user,
            "process_pid": self.process_pid,
            "final_note": (
                "Le fichier final sera cree seulement apres l'etape Publish "
                "+ conversion EXR/PNG + GLB + validation texture."
            ),
        }
        try:
            self.status_path.write_text(
                json.dumps(payload, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
        except OSError:
            pass
        return payload

    @staticmethod
    def read_status(logs_dir: Path) -> Optional[Dict[str, Any]]:
        path = Path(logs_dir) / "run_status.json"
        if not path.is_file():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None


def build_param_overrides(processing_mode: str) -> List[str]:
    """
    Overrides Meshroom 2025 (--paramOverrides NODE.param=value).
    textureSide confirme dans les logs aliceVision_texturing (defaut 8192).
    Mode normal : aucun override (comportement Meshroom par defaut).
    """
    mode = (processing_mode or "normal").lower()
    if mode in ("fast", "rapide", "quick", "test"):
        return ["Texturing_1.textureSide=2048"]
    if mode in ("high", "haute", "quality_high"):
        return ["Texturing_1.textureSide=8192"]
    return []


def format_elapsed(seconds: float) -> str:
    sec = int(max(0, seconds))
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    if h:
        return "%dh %02dm %02ds" % (h, m, s)
    if m:
        return "%dm %02ds" % (m, s)
    return "%ds" % s
