#!/usr/bin/env python3
"""Export GLB avec texture embarquee et baseColorFactor pleine."""
from __future__ import annotations

import json
import struct
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np


LogCallback = Callable[[str], None]


def _noop_log(_message: str) -> None:
    pass


def _patch_glb_json_white_base_color(json_bytes: bytes) -> bytes:
    """Force baseColorFactor [1,1,1,1] (trimesh exporte souvent 0.4)."""
    gltf = json.loads(json_bytes.decode("utf-8"))
    for mat in gltf.get("materials", []):
        pbr = mat.setdefault("pbrMetallicRoughness", {})
        pbr["baseColorFactor"] = [1.0, 1.0, 1.0, 1.0]
    return json.dumps(gltf, separators=(",", ":")).encode("utf-8")


def _rebuild_glb(json_bytes: bytes, bin_bytes: bytes) -> bytes:
    json_padded = json_bytes
    pad = (4 - len(json_padded) % 4) % 4
    json_padded += b" " * pad

    bin_padded = bin_bytes
    pad = (4 - len(bin_padded) % 4) % 4
    bin_padded += b"\x00" * pad

    total = 12 + 8 + len(json_padded) + 8 + len(bin_padded)
    out = bytearray()
    out.extend(struct.pack("<4sII", b"glTF", 2, total))
    out.extend(struct.pack("<I4s", len(json_padded), b"JSON"))
    out.extend(json_padded)
    out.extend(struct.pack("<I4s", len(bin_padded), b"BIN\x00"))
    out.extend(bin_padded)
    return bytes(out)


def _parse_glb_chunks(data: bytes) -> Tuple[bytes, bytes]:
    if len(data) < 12:
        return b"{}", b""
    magic, _version, _length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        return b"{}", b""

    json_bytes = b"{}"
    bin_bytes = b""
    offset = 12
    while offset + 8 <= len(data):
        chunk_len, chunk_type = struct.unpack_from("<I4s", data, offset)
        chunk_data = data[offset + 8 : offset + 8 + chunk_len]
        offset += 8 + chunk_len
        if chunk_type == b"JSON":
            json_bytes = chunk_data
        elif chunk_type.startswith(b"BIN"):
            bin_bytes = chunk_data
    return json_bytes, bin_bytes


def analyze_glb_texture(glb_path: Path) -> Dict[str, object]:
    """Analyse structure GLB pour validation visuelle/technique."""
    glb_path = Path(glb_path)
    result: Dict[str, object] = {
        "has_mesh": False,
        "has_uv": False,
        "has_material": False,
        "has_embedded_image": False,
        "has_base_color_texture": False,
        "base_color_factor": None,
        "image_byte_length": 0,
        "visually_valid": False,
    }

    if not glb_path.is_file():
        result["error"] = "GLB introuvable"
        return result

    data = glb_path.read_bytes()
    json_bytes, bin_bytes = _parse_glb_chunks(data)
    try:
        gltf = json.loads(json_bytes.decode("utf-8"))
    except json.JSONDecodeError:
        result["error"] = "JSON GLB invalide"
        return result

    result["has_mesh"] = bool(gltf.get("meshes"))
    result["has_material"] = bool(gltf.get("materials"))
    result["has_embedded_image"] = bool(gltf.get("images"))

    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            attrs = prim.get("attributes", {})
            if "TEXCOORD_0" in attrs:
                result["has_uv"] = True

    if gltf.get("materials"):
        pbr = gltf["materials"][0].get("pbrMetallicRoughness", {})
        result["base_color_factor"] = pbr.get("baseColorFactor")
        if "baseColorTexture" in pbr:
            result["has_base_color_texture"] = True
            tex_idx = pbr["baseColorTexture"].get("index", 0)
            textures = gltf.get("textures", [])
            if tex_idx < len(textures):
                img_idx = textures[tex_idx].get("source", 0)
                images = gltf.get("images", [])
                if img_idx < len(images):
                    buffer_view = images[img_idx].get("bufferView")
                    views = gltf.get("bufferViews", [])
                    if buffer_view is not None and buffer_view < len(views):
                        view = views[buffer_view]
                        blen = view.get("byteLength", 0)
                        result["image_byte_length"] = blen

    bcf = result.get("base_color_factor") or [1, 1, 1, 1]
    factor_ok = isinstance(bcf, list) and len(bcf) >= 3 and min(bcf[:3]) >= 0.95

    result["visually_valid"] = bool(
        result["has_mesh"]
        and result["has_uv"]
        and result["has_material"]
        and result["has_embedded_image"]
        and result["has_base_color_texture"]
        and result["image_byte_length"] > 1000
        and factor_ok
    )
    return result


def export_textured_glb(
    obj_path: Path,
    png_path: Path,
    glb_path: Path,
    log: LogCallback = _noop_log,
) -> Tuple[bool, Dict[str, object]]:
    """Exporte GLB depuis OBJ+PNG avec texture embarquee."""
    obj_path = Path(obj_path)
    png_path = Path(png_path)
    glb_path = Path(glb_path)
    info: Dict[str, object] = {}

    if not obj_path.is_file() or not png_path.is_file():
        info["error"] = "OBJ ou PNG manquant"
        return False, info

    try:
        import trimesh  # type: ignore
        from PIL import Image  # type: ignore
        from trimesh.visual.material import SimpleMaterial  # type: ignore

        img = Image.open(png_path).convert("RGB")
        material = SimpleMaterial(image=img, diffuse=[255, 255, 255, 255])

        scene = trimesh.load(str(obj_path), force="scene", process=False)
        if not isinstance(scene, trimesh.Scene):
            info["error"] = "Chargement OBJ : pas une scene"
            return False, info

        for geom in scene.geometry.values():
            if hasattr(geom, "visual"):
                geom.visual.material = material

        temp = glb_path.with_suffix(".tmp.glb")
        scene.export(str(temp), file_type="glb")

        raw = temp.read_bytes()
        json_bytes, bin_bytes = _parse_glb_chunks(raw)
        json_bytes = _patch_glb_json_white_base_color(json_bytes)
        final = _rebuild_glb(json_bytes, bin_bytes)
        glb_path.write_bytes(final)
        try:
            temp.unlink()
        except OSError:
            pass

        analysis = analyze_glb_texture(glb_path)
        info.update(analysis)
        ok = bool(analysis.get("visually_valid"))
        if ok:
            log("[glb] Export texturé OK : %s (%d Ko)" % (glb_path.name, glb_path.stat().st_size // 1024))
        else:
            log("[glb] GLB exporte mais validation texture echouee : %s" % analysis)
        return ok, info
    except ImportError:
        info["error"] = "trimesh/Pillow requis"
        log("[glb] %s" % info["error"])
    except Exception as exc:
        info["error"] = str(exc)
        log("[glb] Export echoue : %s" % exc)
    return False, info


def save_render_preview(
    obj_path: Path,
    png_path: Path,
    dest_path: Path,
    log: LogCallback = _noop_log,
) -> bool:
    """Apercu mesh+texture via trimesh (screenshot simple)."""
    try:
        import trimesh  # type: ignore
        from PIL import Image  # type: ignore
        from trimesh.visual.material import SimpleMaterial  # type: ignore

        img = Image.open(png_path).convert("RGB")
        material = SimpleMaterial(image=img, diffuse=[255, 255, 255, 255])
        scene = trimesh.load(str(obj_path), force="scene", process=False)
        if isinstance(scene, trimesh.Scene):
            for geom in scene.geometry.values():
                if hasattr(geom, "visual"):
                    geom.visual.material = material
            png_bytes = scene.save_image(resolution=(800, 600))
            if png_bytes:
                dest_path = Path(dest_path)
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                dest_path.write_bytes(png_bytes)
                log("[glb] render_preview.png genere")
                return True
    except Exception as exc:
        log("[glb] render_preview 3D non genere : %s" % exc)

    # Secours : copie texture_preview (pas de pyglet / moteur 3D)
    try:
        from PIL import Image  # type: ignore
        from shutil import copy2

        preview = png_path.parent.parent / "texture_preview.png"
        if preview.is_file():
            img = Image.open(preview).convert("RGB")
            img.thumbnail((800, 600))
            dest_path = Path(dest_path)
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(dest_path, format="PNG")
            log("[glb] render_preview.png (apercu texture, secours)")
            return True
        copy2(png_path, dest_path)
        log("[glb] render_preview.png (texture brute, secours)")
        return True
    except Exception:
        return False
