#!/usr/bin/env python3
"""Validation stricte des modeles texturés pour le dossier site-ready/."""
from __future__ import annotations

import re
import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple


TEXTURE_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp", ".tga", ".bmp")
SOURCE_TEXTURE_SUFFIXES = TEXTURE_SUFFIXES + (".exr", ".tif", ".tiff")
MAP_KD_RE = re.compile(r"^\s*map_kd\s+", re.IGNORECASE | re.MULTILINE)
MTLLIB_RE = re.compile(r"^\s*mtllib\s+", re.IGNORECASE | re.MULTILINE)
USEMTL_RE = re.compile(r"^\s*usemtl\s+", re.IGNORECASE | re.MULTILINE)
GRAY_KD_VALUES = {
    (0.55, 0.62, 0.72),
    (0.64, 0.64, 0.64),
    (0.5, 0.5, 0.5),
    (0.7, 0.7, 0.7),
    (0.8, 0.8, 0.8),
}


@dataclass
class ValidationResult:
    valid: bool
    format: str = ""
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    texture_count: int = 0
    map_kd_count: int = 0
    has_mesh: bool = False
    has_material: bool = False
    has_embedded_texture: bool = False


def _parse_mtl_map_kd(mtl_path: Path) -> Tuple[List[str], bool]:
    """Retourne (chemins map_Kd, uniquement_couleur_grise)."""
    if not mtl_path.is_file():
        return [], True

    map_paths: List[str] = []
    kd_only_gray = True
    kd_values: List[Tuple[float, float, float]] = []

    try:
        lines = mtl_path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return [], True

    for line in lines:
        stripped = line.strip()
        lower = stripped.lower()
        if MAP_KD_RE.match(stripped):
            parts = stripped.split(maxsplit=1)
            if len(parts) > 1:
                map_paths.append(parts[1].strip())
            kd_only_gray = False
        elif lower.startswith("kd "):
            try:
                vals = tuple(float(x) for x in stripped.split()[1:4])
                if len(vals) == 3:
                    kd_values.append(vals)
                    if vals not in GRAY_KD_VALUES:
                        kd_only_gray = False
            except ValueError:
                pass

    if map_paths:
        return map_paths, False

    if kd_values and all(v in GRAY_KD_VALUES for v in kd_values):
        return [], True

    return [], kd_only_gray and bool(kd_values)


def _resolve_texture_path(
    base_dir: Path,
    ref: str,
    allowed_suffixes: Tuple[str, ...] = TEXTURE_SUFFIXES,
) -> Optional[Path]:
    ref_path = Path(ref)
    candidates = [
        base_dir / ref_path,
        base_dir / ref_path.name,
        base_dir / "textures" / ref_path.name,
        base_dir.parent / ref_path,
        base_dir.parent / ref_path.name,
    ]
    for candidate in candidates:
        if candidate.is_file() and candidate.suffix.lower() in allowed_suffixes:
            return candidate
    return None


def mtl_has_map_kd_files(
    mtl_path: Path,
    base_dir: Optional[Path] = None,
) -> Tuple[bool, List[Path]]:
    """True si MTL a map_Kd et fichiers texture existent (EXR accepte pour detection Meshroom)."""
    mtl_path = Path(mtl_path)
    base = Path(base_dir) if base_dir else mtl_path.parent
    map_refs, gray_only = _parse_mtl_map_kd(mtl_path)
    if not map_refs or gray_only:
        return False, []

    resolved: List[Path] = []
    for ref in map_refs:
        tex = _resolve_texture_path(base, ref, allowed_suffixes=SOURCE_TEXTURE_SUFFIXES)
        if tex:
            resolved.append(tex)
    return bool(resolved), resolved


def validate_textured_obj(obj_path: Path, mtl_path: Optional[Path] = None) -> ValidationResult:
    result = ValidationResult(valid=False, format="obj")
    obj_path = Path(obj_path)

    if not obj_path.is_file():
        result.errors.append("OBJ introuvable : %s" % obj_path)
        return result

    if obj_path.stat().st_size <= 0:
        result.errors.append("OBJ vide.")
        return result

    try:
        obj_text = obj_path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        result.errors.append("Lecture OBJ impossible : %s" % exc)
        return result

    has_vertex = any(line.startswith(("v ", "v\t")) for line in obj_text.splitlines())
    has_face = any(line.startswith(("f ", "f\t")) for line in obj_text.splitlines())
    if not has_vertex or not has_face:
        result.errors.append("OBJ sans geometrie mesh (vertices/faces).")
        return result
    result.has_mesh = True

    if not MTLLIB_RE.search(obj_text):
        result.errors.append("OBJ ne reference pas de fichier MTL (mtllib).")
        return result

    if not USEMTL_RE.search(obj_text):
        result.errors.append("OBJ sans materiaux (usemtl).")
        return result

    if mtl_path is None:
        mtl_name = None
        for line in obj_text.splitlines():
            if MTLLIB_RE.match(line):
                mtl_name = line.split(maxsplit=1)[1].strip()
                break
        if mtl_name:
            mtl_path = obj_path.parent / mtl_name
        else:
            mtl_path = obj_path.with_suffix(".mtl")

    mtl_path = Path(mtl_path)
    if not mtl_path.is_file():
        result.errors.append("MTL introuvable : %s" % mtl_path)
        return result

    result.has_material = True
    map_refs, gray_only = _parse_mtl_map_kd(mtl_path)

    if not map_refs:
        if gray_only:
            result.errors.append(
                "MTL sans map_Kd : materiaux gris uniformes uniquement (pas de photos)."
            )
        else:
            result.errors.append("MTL sans map_Kd ni texture diffuse valide.")
        return result

    result.map_kd_count = len(map_refs)
    resolved: List[Path] = []
    for ref in map_refs:
        tex = _resolve_texture_path(mtl_path.parent, ref)
        if tex:
            resolved.append(tex)
        else:
            result.errors.append("Texture map_Kd introuvable : %s" % ref)

    if not resolved:
        result.errors.append("Aucune texture map_Kd resolue sur disque.")
        return result

    result.texture_count = len(resolved)
    result.valid = True
    return result


def _glb_chunk_table(data: bytes) -> List[Tuple[int, int, str]]:
    if len(data) < 12:
        return []
    magic, _version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        return []
    chunks: List[Tuple[int, int, str]] = []
    offset = 12
    while offset + 8 <= min(length, len(data)):
        chunk_len, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk_data = data[offset : offset + chunk_len]
        offset += chunk_len
        chunks.append((chunk_len, chunk_type.decode("ascii", errors="replace"), chunk_data))
    return chunks


def validate_textured_glb(glb_path: Path) -> ValidationResult:
    result = ValidationResult(valid=False, format="glb")
    glb_path = Path(glb_path)

    if not glb_path.is_file():
        result.errors.append("GLB introuvable : %s" % glb_path)
        return result

    size = glb_path.stat().st_size
    if size <= 0:
        result.errors.append("GLB vide.")
        return result

    try:
        data = glb_path.read_bytes()
    except OSError as exc:
        result.errors.append("Lecture GLB impossible : %s" % exc)
        return result

    chunks = _glb_chunk_table(data)
    if not chunks:
        result.errors.append("GLB invalide (en-tete glTF manquant).")
        return result

    json_text = ""
    bin_present = False
    for _length, chunk_type, chunk_data in chunks:
        if chunk_type == "JSON":
            json_text = chunk_data.decode("utf-8", errors="replace")
        elif chunk_type == "BIN":
            bin_present = True

    if '"meshes"' not in json_text and '"mesh"' not in json_text:
        result.errors.append("GLB sans mesh.")
        return result
    result.has_mesh = True

    if '"materials"' not in json_text:
        result.errors.append("GLB sans materiaux.")
        return result
    result.has_material = True

    has_images = '"images"' in json_text
    has_textures = '"textures"' in json_text
    has_basecolor_tex = "baseColorTexture" in json_text

    if has_images or has_textures or has_basecolor_tex:
        result.has_embedded_texture = True
        result.texture_count = json_text.count('"uri"')
        if bin_present or has_basecolor_tex:
            result.valid = True
            return result
        result.warnings.append("GLB declare des textures mais buffer BIN absent.")

    # Materiaux uniquement baseColorFactor gris
    gray_factors = re.findall(
        r'"baseColorFactor"\s*:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\]',
        json_text,
    )
    if gray_factors and not result.has_embedded_texture:
        all_gray = all(
            abs(float(r) - 0.64) < 0.05 and abs(float(g) - 0.64) < 0.05 and abs(float(b) - 0.64) < 0.05
            for r, g, b in gray_factors[:20]
        )
        if all_gray:
            result.errors.append(
                "GLB avec couleur grise uniforme uniquement (pas de texture photo embarquee)."
            )
            return result

    if not result.has_embedded_texture:
        result.errors.append("GLB sans texture/image embarquee.")
        return result

    result.valid = True
    return result


def validate_obj_uv_setup(obj_path: Path, mtl_path: Path) -> ValidationResult:
    """Valide OBJ+MTL+UV avant export GLB."""
    result = validate_textured_obj(obj_path, mtl_path)
    if not result.valid:
        return result

    try:
        obj_text = Path(obj_path).read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        result.errors.append("Lecture OBJ : %s" % exc)
        result.valid = False
        return result

    vt_count = sum(1 for line in obj_text.splitlines() if line.startswith(("vt ", "vt\t")))
    if vt_count == 0:
        result.errors.append("OBJ sans coordonnees UV (vt).")
        result.valid = False
        return result

    has_vt_in_faces = False
    for line in obj_text.splitlines():
        if line.startswith(("f ", "f\t")):
            parts = line.split()[1:]
            if parts and "/" in parts[0]:
                has_vt_in_faces = True
                break
    if not has_vt_in_faces:
        result.errors.append("Faces sans indices UV (f v/vt/vn attendu).")
        result.valid = False
        return result

    return result


def validate_visual_site_model(site_ready_dir: Path) -> ValidationResult:
    """Validation stricte : texture visuellement exploitable + GLB/OBJ."""
    from texture_convert import analyze_texture_image_visual

    site_dir = Path(site_ready_dir)
    result = ValidationResult(valid=False, format="site-ready")

    textures_dir = site_dir / "textures"
    png_files = sorted(textures_dir.glob("*.png")) if textures_dir.is_dir() else []
    if not png_files:
        result.errors.append("Aucune texture PNG dans site-ready/textures/.")
        return result

    vis = analyze_texture_image_visual(png_files[0])
    if not vis.get("visually_valid"):
        result.errors.append(
            "Texture presente mais visuellement invalide (noire/blanche/uniforme)."
        )
        if vis.get("texture_mostly_black"):
            result.errors.append("Texture presque entierement noire.")
        if vis.get("texture_uniform"):
            result.errors.append("Texture uniforme (pas de details photo).")
        result.errors.append("Moyenne couleur visible : %s" % vis.get("mean_rgb"))
        return result

    result.warnings.append(
        "Texture visuelle OK (mean=%s, std=%.1f, couleurs=%d)."
        % (vis.get("mean_rgb"), vis.get("std_rgb", 0), vis.get("unique_colors_sampled", 0))
    )

    obj = site_dir / "site_model.obj"
    mtl = site_dir / "site_model.mtl"
    if obj.is_file() and mtl.is_file():
        obj_val = validate_obj_uv_setup(obj, mtl)
        if not obj_val.valid:
            result.errors.extend(obj_val.errors)
            return result

    glb = site_dir / "site_model.glb"
    if glb.is_file():
        from glb_export import analyze_glb_texture

        glb_info = analyze_glb_texture(glb)
        if not glb_info.get("visually_valid"):
            result.errors.append("GLB : texture embarquee invalide ou baseColorFactor trop sombre.")
            if not glb_info.get("has_embedded_image"):
                result.errors.append("GLB sans image integree.")
            if glb_info.get("base_color_factor"):
                result.errors.append("baseColorFactor=%s" % glb_info.get("base_color_factor"))
            return result
        result.format = "glb"
        result.valid = True
        result.has_embedded_texture = True
        return result

    if obj.is_file():
        result.format = "obj"
        result.valid = True
        return result

    result.errors.append("Ni GLB ni OBJ valide dans site-ready/.")
    return result


def validate_textured_site_model(site_ready_dir: Path) -> ValidationResult:
    """Valide le contenu de site-ready/ (GLB prioritaire, sinon OBJ+MTL+textures)."""
    site_dir = Path(site_ready_dir)
    if not site_dir.is_dir():
        return ValidationResult(valid=False, errors=["Dossier site-ready introuvable."])

    glb = site_dir / "site_model.glb"
    obj = site_dir / "site_model.obj"
    mtl = site_dir / "site_model.mtl"

    if glb.is_file():
        visual = validate_visual_site_model(site_dir)
        if visual.valid:
            return visual
        glb_result = validate_textured_glb(glb)
        if glb_result.valid:
            visual.errors = [
                "GLB technique OK mais validation visuelle echouee."
            ] + visual.errors
            return visual
        if obj.is_file() and mtl.is_file():
            obj_result = validate_textured_obj(obj, mtl)
            if obj_result.valid:
                obj_result.warnings.append(
                    "GLB present mais non texturé — utilisez OBJ+MTL+textures."
                )
                return obj_result
        return glb_result

    if obj.is_file():
        return validate_textured_obj(obj, mtl if mtl.is_file() else None)

    return ValidationResult(
        valid=False,
        errors=["Aucun site_model.glb ni site_model.obj dans site-ready/."],
    )
