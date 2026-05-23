#!/usr/bin/env python3
"""Conversion textures Meshroom (EXR HDR) vers PNG 8-bit sRGB pour le site."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np


LogCallback = Callable[[str], None]
SITE_TEXTURE_SUFFIXES = (".png", ".jpg", ".jpeg")
SOURCE_TEXTURE_SUFFIXES = SITE_TEXTURE_SUFFIXES + (".exr", ".tif", ".tiff", ".webp")

# Seuils validation visuelle (pixels « actifs » de l'atlas UDIM)
ACTIVE_LUMINANCE_THRESHOLD = 0.005
MIN_VISIBLE_MEAN = 35.0
MIN_VISIBLE_STD = 18.0
MIN_VISIBLE_UNIQUE_COLORS = 64


def _noop_log(_message: str) -> None:
    pass


def _read_exr_rgb(exr_path: Path) -> Tuple[np.ndarray, Dict[str, Any]]:
    """Lit un EXR AliceVision en float32 HWC."""
    import Imath  # type: ignore
    import OpenEXR  # type: ignore

    exr_file = OpenEXR.InputFile(str(exr_path))
    header = exr_file.header()
    data_window = header["dataWindow"]
    width = data_window.max.x - data_window.min.x + 1
    height = data_window.max.y - data_window.min.y + 1
    channels = list(header["channels"].keys())
    pixel_type = Imath.PixelType(Imath.PixelType.FLOAT)

    def read_channel(name: str) -> Optional[np.ndarray]:
        for candidate in (name, name.upper(), name.lower()):
            if candidate in channels:
                raw = exr_file.channel(candidate, pixel_type)
                return np.frombuffer(raw, dtype=np.float32).reshape(height, width)
        return None

    red = read_channel("R")
    green = read_channel("G")
    blue = read_channel("B")
    if red is None or green is None or blue is None:
        raise ValueError("Canaux RGB manquants dans EXR")

    rgb = np.stack([red, green, blue], axis=-1)
    rgb = np.nan_to_num(rgb, nan=0.0, posinf=1.0, neginf=0.0)

    meta = {
        "width": int(width),
        "height": int(height),
        "exr_min_rgb": [float(rgb[..., c].min()) for c in range(3)],
        "exr_max_rgb": [float(rgb[..., c].max()) for c in range(3)],
        "exr_mean_rgb": [float(rgb[..., c].mean()) for c in range(3)],
    }
    return rgb, meta


def _tone_map_exr_to_uint8(rgb: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Tone-mapping pour atlas UDIM : la majorite des pixels est vide (noir).
    Normalisation sur les pixels actifs uniquement.
    """
    luminance = rgb.max(axis=2)
    active_mask = luminance > ACTIVE_LUMINANCE_THRESHOLD
    active_count = int(active_mask.sum())
    total = int(active_mask.size)

    stats: Dict[str, Any] = {
        "active_pixel_count": active_count,
        "total_pixels": total,
        "active_fraction": active_count / total if total else 0.0,
    }

    if active_count < 100:
        stats["error"] = "Trop peu de pixels actifs dans l'atlas EXR"
        return np.zeros(rgb.shape[:2] + (3,), dtype=np.uint8), stats

    active_rgb = rgb[active_mask]
    lo = float(np.percentile(active_rgb, 1))
    hi = float(np.percentile(active_rgb, 99))
    stats["percentile_1"] = lo
    stats["percentile_99"] = hi

    scaled = (rgb - lo) / max(hi - lo, 1e-6)
    scaled = np.clip(scaled, 0.0, 1.0)
    scaled[~active_mask] = 0.0
    scaled = np.power(scaled, 1.0 / 2.2)

    out = (scaled * 255.0).astype(np.uint8)
    visible = out[active_mask]
    stats["png_min_rgb"] = [int(visible[:, c].min()) for c in range(3)]
    stats["png_max_rgb"] = [int(visible[:, c].max()) for c in range(3)]
    stats["png_mean_rgb"] = [float(visible[:, c].mean()) for c in range(3)]
    stats["png_mean_visible"] = float(visible.mean())
    stats["png_std_visible"] = float(visible.std())

    sample = visible[:: max(1, len(visible) // 5000)]
    unique = len(np.unique(sample, axis=0))
    stats["unique_colors_sampled"] = unique
    stats["texture_uniform"] = unique < MIN_VISIBLE_UNIQUE_COLORS
    stats["texture_mostly_black"] = stats["png_mean_visible"] < MIN_VISIBLE_MEAN
    stats["texture_mostly_white"] = stats["png_mean_visible"] > 240.0
    stats["visually_valid"] = (
        not stats["texture_uniform"]
        and not stats["texture_mostly_black"]
        and not stats["texture_mostly_white"]
        and stats["png_std_visible"] >= MIN_VISIBLE_STD
    )

    return out, stats


def convert_exr_to_png(
    exr_path: Path,
    png_path: Path,
    log: LogCallback = _noop_log,
    stats_path: Optional[Path] = None,
) -> Tuple[bool, Dict[str, Any]]:
    """Convertit un EXR AliceVision en PNG 8-bit sRGB avec tone-mapping UDIM."""
    exr_path = Path(exr_path)
    png_path = Path(png_path)
    stats: Dict[str, Any] = {"source": str(exr_path), "output": str(png_path)}

    if not exr_path.is_file():
        stats["error"] = "EXR introuvable"
        return False, stats

    try:
        from PIL import Image  # type: ignore

        rgb, exr_meta = _read_exr_rgb(exr_path)
        stats.update(exr_meta)

        out, tone_stats = _tone_map_exr_to_uint8(rgb)
        stats.update(tone_stats)

        if stats.get("error"):
            log("[texture] %s" % stats["error"])
            return False, stats

        png_path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(out, mode="RGB").save(png_path, format="PNG")
        stats["png_written"] = png_path.is_file()
        stats["png_size_bytes"] = png_path.stat().st_size if png_path.is_file() else 0

        log(
            "[texture] EXR -> PNG : %s | actifs %.1f%% | mean visible %.0f | valid=%s"
            % (
                png_path.name,
                100.0 * stats.get("active_fraction", 0),
                stats.get("png_mean_visible", 0),
                stats.get("visually_valid", False),
            )
        )

        if stats_path:
            write_texture_conversion_stats(stats, stats_path)

        return bool(stats.get("visually_valid")), stats
    except ImportError:
        stats["error"] = "OpenEXR/Pillow requis"
        log("[texture] %s — py -3 -m pip install OpenEXR Pillow" % stats["error"])
    except Exception as exc:
        stats["error"] = str(exc)
        log("[texture] Conversion EXR echouee (%s) : %s" % (exr_path.name, exc))

    if stats_path:
        write_texture_conversion_stats(stats, stats_path)
    return False, stats


def write_texture_conversion_stats(stats: Dict[str, Any], path: Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        **stats,
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def analyze_texture_image_visual(image_path: Path) -> Dict[str, Any]:
    """Analyse visuelle d'une texture PNG/JPG."""
    from PIL import Image  # type: ignore

    image_path = Path(image_path)
    result: Dict[str, Any] = {"path": str(image_path), "visually_valid": False}

    if not image_path.is_file():
        result["error"] = "Image introuvable"
        return result

    img = np.array(Image.open(image_path).convert("RGB"))
    luminance = img.max(axis=2)
    active = luminance > 12

    if not active.any():
        result["error"] = "Image entierement noire"
        result["texture_mostly_black"] = True
        return result

    visible = img[active]
    result["mean_rgb"] = [float(visible[:, c].mean()) for c in range(3)]
    result["std_rgb"] = float(visible.std())
    result["min_rgb"] = [int(visible[:, c].min()) for c in range(3)]
    result["max_rgb"] = [int(visible[:, c].max()) for c in range(3)]
    result["global_mean"] = float(img.mean())

    sample = visible[:: max(1, len(visible) // 8000)]
    unique = len(np.unique(sample, axis=0))
    result["unique_colors_sampled"] = unique
    result["texture_uniform"] = unique < MIN_VISIBLE_UNIQUE_COLORS
    result["texture_mostly_black"] = result["mean_rgb"][0] < MIN_VISIBLE_MEAN
    result["texture_mostly_white"] = result["mean_rgb"][0] > 240.0

    result["visually_valid"] = (
        not result["texture_uniform"]
        and not result["texture_mostly_black"]
        and not result["texture_mostly_white"]
        and result["std_rgb"] >= MIN_VISIBLE_STD
    )
    return result


def save_texture_preview(texture_path: Path, dest_path: Path, max_size: int = 1024) -> bool:
    """Copie/redimensionne la texture pour apercu."""
    from PIL import Image  # type: ignore

    try:
        img = Image.open(texture_path).convert("RGB")
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        dest_path = Path(dest_path)
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest_path, format="PNG")
        return dest_path.is_file()
    except Exception:
        return False


def prepare_site_texture(
    source_path: Path,
    dest_dir: Path,
    log: LogCallback = _noop_log,
    stats_dir: Optional[Path] = None,
) -> Tuple[Optional[Path], Dict[str, Any]]:
    """Copie ou convertit une texture vers dest_dir en PNG/JPG pour le site."""
    source_path = Path(source_path)
    dest_dir = Path(dest_dir)
    stats: Dict[str, Any] = {}

    if not source_path.is_file():
        return None, {"error": "source_missing"}

    suffix = source_path.suffix.lower()
    if suffix in SITE_TEXTURE_SUFFIXES:
        dest = dest_dir / source_path.name
        import shutil

        shutil.copy2(source_path, dest)
        vis = analyze_texture_image_visual(dest)
        return dest if vis.get("visually_valid") else None, vis

    if suffix == ".exr":
        dest = dest_dir / (source_path.stem + ".png")
        if stats_dir:
            stats_path = stats_dir / "texture_conversion_stats.json"
            if source_path.stem != "texture_1001":
                stats_path = stats_dir / ("texture_conversion_%s_stats.json" % source_path.stem)
        else:
            stats_path = None
        ok, stats = convert_exr_to_png(source_path, dest, log=log, stats_path=stats_path)
        return (dest if ok else None), stats

    log("[texture] Format non supporte : %s" % source_path.name)
    return None, {"error": "unsupported_format"}


def prepare_site_textures(
    texture_paths: List[Path],
    dest_dir: Path,
    log: LogCallback = _noop_log,
    stats_dir: Optional[Path] = None,
) -> Tuple[List[Path], List[str], List[Dict[str, Any]]]:
    """Retourne (fichiers dest, noms, stats par texture)."""
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    prepared: List[Path] = []
    names: List[str] = []
    all_stats: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for src in texture_paths:
        out, st = prepare_site_texture(src, dest_dir, log=log, stats_dir=stats_dir)
        all_stats.append(st)
        if out and out.name not in seen:
            prepared.append(out)
            names.append(out.name)
            seen.add(out.name)

    return prepared, names, all_stats
