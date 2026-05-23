#!/usr/bin/env python3
import json
import math
import shutil
import struct
import time
import zipfile
from pathlib import Path

from mat_parser import COLOR_CAMERA_INDEX, parse_pose_file


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}
FRAME_SUFFIXES = {".jpg", ".jpeg", ".mat", ".tms", ".pcl"}
COLOR_CAMERA_INDEX = 0

CRITICAL_ROOT_FILES = frozenset({
    "state.txt",
    "distortion.txt",
    "rotation.txt",
    "metadata.json",
})
NON_CRITICAL_EMPTY_FILES = frozenset({
    "test.txt",
    "capture_log.txt",
    ".ds_store",
    "thumbs.db",
})
NON_CRITICAL_SUFFIXES = frozenset({".bin", ".log", ".tmp", ".partial", ".bak"})


def human_size(size_bytes):
    value = float(size_bytes)
    units = ["B", "KB", "MB", "GB", "TB"]
    for unit in units:
        if value < 1024.0 or unit == units[-1]:
            if unit == "B":
                return "%d %s" % (int(value), unit)
            return "%.2f %s" % (value, unit)
        value /= 1024.0
    return "%.2f TB" % value


def ensure_directory(path):
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def detect_dataset_root(base_dir):
    current = Path(base_dir)
    markers = ("metadata.json", "state.txt")

    while True:
        if any((current / marker).exists() for marker in markers):
            return current

        child_dirs = [item for item in current.iterdir() if item.is_dir()]
        child_files = [item for item in current.iterdir() if item.is_file()]
        if len(child_dirs) == 1 and not child_files:
            current = child_dirs[0]
            continue
        return current


def extract_dataset_input(dataset_input, output_dir):
    input_path = Path(dataset_input).resolve()
    output_dir = ensure_directory(output_dir)
    extracted_dir = ensure_directory(output_dir / "extracted")

    if input_path.is_dir():
        return {
            "input_path": input_path,
            "source_type": "directory",
            "dataset_root": detect_dataset_root(input_path),
            "extracted_path": None,
        }

    if input_path.is_file() and input_path.suffix.lower() == ".zip":
        target_dir = extracted_dir / input_path.stem
        if target_dir.exists():
            shutil.rmtree(target_dir)
        target_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(str(input_path), "r") as archive:
            archive.extractall(str(target_dir))
        return {
            "input_path": input_path,
            "source_type": "zip",
            "dataset_root": detect_dataset_root(target_dir),
            "extracted_path": target_dir,
        }

    raise ValueError("Input must be a .dataset directory or a .zip archive")


def collect_files(root):
    files = [path for path in Path(root).rglob("*") if path.is_file()]
    files.sort()
    return files


def relative_paths(root, paths):
    root = Path(root)
    return [str(Path(path).resolve().relative_to(root.resolve())).replace("\\", "/") for path in paths]


def parse_json_file(path, errors):
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            errors.append("metadata.json ne contient pas un objet JSON")
            return None
        return data
    except Exception as exc:
        errors.append("Impossible de parser metadata.json: %s" % exc)
        return None


def parse_state_file(path, errors):
    result = {
        "present": path.exists(),
        "raw_line": None,
        "count": None,
        "width": None,
        "height": None,
        "cx": None,
        "cy": None,
        "fx": None,
        "fy": None,
    }
    if not path.exists():
        return result
    if path.stat().st_size == 0:
        errors.append("state.txt est vide")
        return result

    try:
        raw_line = path.read_text(encoding="utf-8").strip()
        result["raw_line"] = raw_line
        parts = raw_line.split()
        if len(parts) < 7:
            errors.append("state.txt doit contenir 7 valeurs")
            return result
        result["count"] = int(parts[0])
        result["width"] = int(parts[1])
        result["height"] = int(parts[2])
        result["cx"] = float(parts[3])
        result["cy"] = float(parts[4])
        result["fx"] = float(parts[5])
        result["fy"] = float(parts[6])
    except Exception as exc:
        errors.append("Impossible de parser state.txt: %s" % exc)
    return result


def parse_distortion_file(path, warnings, errors):
    result = {
        "present": path.exists(),
        "coeff_count": None,
        "coefficients": [],
    }
    if not path.exists():
        warnings.append("distortion.txt absent")
        return result
    if path.stat().st_size == 0:
        errors.append("distortion.txt est vide")
        return result

    try:
        lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        coeff_count = int(lines[0])
        coefficients = [float(value) for value in lines[1:1 + coeff_count]]
        if len(coefficients) != coeff_count:
            errors.append("distortion.txt ne contient pas le nombre de coefficients annonce")
        result["coeff_count"] = coeff_count
        result["coefficients"] = coefficients
    except Exception as exc:
        errors.append("Impossible de parser distortion.txt: %s" % exc)
    return result


def parse_rotation_file(path, warnings, errors):
    result = {
        "present": path.exists(),
        "yaw_degrees": None,
    }
    if not path.exists():
        warnings.append("rotation.txt absent; le code Android sait tomber sur une valeur par defaut")
        return result
    if path.stat().st_size == 0:
        errors.append("rotation.txt est vide")
        return result

    try:
        result["yaw_degrees"] = float(path.read_text(encoding="utf-8").strip())
    except Exception as exc:
        errors.append("Impossible de parser rotation.txt: %s" % exc)
    return result


def is_depth_file(path):
    name = path.name.lower()
    return "depth" in name and path.suffix.lower() in IMAGE_SUFFIXES


def is_confidence_file(path):
    name = path.name.lower()
    return "confidence" in name and path.suffix.lower() in IMAGE_SUFFIXES


def is_rgb_image(path):
    suffix = path.suffix.lower()
    if suffix not in IMAGE_SUFFIXES:
        return False
    if is_depth_file(path) or is_confidence_file(path):
        return False
    return True


def is_empty_file_critical(relative_path):
    """Return True if an empty file should block dataset validation."""
    path = Path(relative_path)
    name = path.name.lower()
    if name in NON_CRITICAL_EMPTY_FILES:
        return False
    if name in CRITICAL_ROOT_FILES:
        return True
    suffix = path.suffix.lower()
    if suffix in NON_CRITICAL_SUFFIXES:
        return False
    if suffix in IMAGE_SUFFIXES:
        return not (is_depth_file(path) or is_confidence_file(path))
    if suffix in {".mat", ".pcl", ".tms"}:
        return True
    return False


def minimum_dataset_requirements_met(rgb_images, pose_files, pointcloud_files, state_info, incomplete_frames):
    if not state_info.get("present"):
        return False
    if state_info.get("count") is None:
        return False
    if len(rgb_images) < 1 or len(pose_files) < 1 or len(pointcloud_files) < 1:
        return False
    return len(incomplete_frames) == 0


def discover_frame_files(all_files):
    frames = {}
    categories = {
        "rgb_image": lambda p: is_rgb_image(p),
        "depth_image": lambda p: is_depth_file(p),
        "confidence_image": lambda p: is_confidence_file(p),
        "pose": lambda p: p.suffix.lower() == ".mat",
        "timestamp": lambda p: p.suffix.lower() == ".tms",
        "pointcloud": lambda p: p.suffix.lower() == ".pcl",
    }

    for path in all_files:
        suffix = path.suffix.lower()
        if suffix not in FRAME_SUFFIXES and not is_depth_file(path) and not is_confidence_file(path):
            continue
        stem = path.stem
        frames.setdefault(stem, {})
        for key, matcher in categories.items():
            if matcher(path):
                frames[stem][key] = path
    return frames


def classify_dataset_kind(metadata_present, state_present):
    if metadata_present and state_present:
        return "metadata_plus_android_legacy"
    if state_present:
        return "android_legacy"
    if metadata_present:
        return "metadata_only_package"
    return "unknown"


def analyse_dataset(dataset_input, output_dir):
    output_dir = ensure_directory(output_dir)
    preview_dir = ensure_directory(output_dir / "preview")
    ensure_directory(output_dir / "logs")
    extracted_dir = ensure_directory(output_dir / "extracted")

    extraction = extract_dataset_input(dataset_input, output_dir)
    dataset_root = extraction["dataset_root"]
    all_files = collect_files(dataset_root)
    total_size_bytes = sum(path.stat().st_size for path in all_files)

    errors = []
    warnings = []

    metadata = parse_json_file(dataset_root / "metadata.json", errors)
    state_info = parse_state_file(dataset_root / "state.txt", errors)
    distortion_info = parse_distortion_file(dataset_root / "distortion.txt", warnings, errors)
    rotation_info = parse_rotation_file(dataset_root / "rotation.txt", warnings, errors)

    empty_files = [
        str(path.relative_to(dataset_root)).replace("\\", "/")
        for path in all_files
        if path.stat().st_size == 0
    ]
    empty_files_critical = []
    empty_files_non_critical = []
    for relative_path in empty_files:
        if is_empty_file_critical(relative_path):
            empty_files_critical.append(relative_path)
            errors.append("Fichier critique vide: %s" % relative_path)
        else:
            empty_files_non_critical.append(relative_path)
            warnings.append("Fichier vide non critique ignore: %s" % relative_path)

    frames = discover_frame_files(all_files)
    frame_ids = sorted(frames.keys())
    rgb_images = [frames[frame_id]["rgb_image"] for frame_id in frame_ids if "rgb_image" in frames[frame_id]]
    depth_images = [frames[frame_id]["depth_image"] for frame_id in frame_ids if "depth_image" in frames[frame_id]]
    confidence_images = [frames[frame_id]["confidence_image"] for frame_id in frame_ids if "confidence_image" in frames[frame_id]]
    pose_files = [frames[frame_id]["pose"] for frame_id in frame_ids if "pose" in frames[frame_id]]
    timestamp_files = [frames[frame_id]["timestamp"] for frame_id in frame_ids if "timestamp" in frames[frame_id]]
    pointcloud_files = [frames[frame_id]["pointcloud"] for frame_id in frame_ids if "pointcloud" in frames[frame_id]]
    preview_cache_files = [path for path in all_files if path.suffix.lower() == ".bin"]

    if not rgb_images:
        errors.append("Aucune image RGB .jpg/.png trouvee")
    if not pose_files:
        errors.append("Aucun fichier de pose .mat trouve")

    dataset_kind = classify_dataset_kind(metadata is not None, state_info["present"])
    if dataset_kind == "android_legacy":
        warnings.append("metadata.json absent; format Android legacy accepte mais moins traceable")
    if dataset_kind == "unknown":
        warnings.append("Ni state.txt ni metadata.json trouves a la racine detectee")

    if state_info["present"] and state_info["count"] is not None:
        expected = state_info["count"]
        if expected != len(rgb_images):
            errors.append("state.txt annonce %d images, mais %d images RGB ont ete trouvees" % (expected, len(rgb_images)))
        if expected != len(pose_files):
            errors.append("state.txt annonce %d poses, mais %d poses ont ete trouvees" % (expected, len(pose_files)))
        if pointcloud_files and expected != len(pointcloud_files):
            warnings.append("state.txt annonce %d frames, mais %d fichiers .pcl ont ete trouves" % (expected, len(pointcloud_files)))
        if timestamp_files and expected != len(timestamp_files):
            warnings.append("state.txt annonce %d frames, mais %d fichiers .tms ont ete trouves" % (expected, len(timestamp_files)))

    if metadata is not None:
        expected = metadata.get("frame_count_expected")
        if isinstance(expected, int):
            if expected != len(rgb_images):
                warnings.append("metadata.json annonce %d images attendues, mais %d images RGB ont ete trouvees" % (expected, len(rgb_images)))
            if expected != len(pose_files):
                warnings.append("metadata.json annonce %d poses attendues, mais %d poses ont ete trouvees" % (expected, len(pose_files)))

    incomplete_frames = []
    frames_with_pose_and_pcl = 0
    for frame_id in frame_ids:
        entry = frames[frame_id]
        missing = []
        for field_name, label in (
            ("rgb_image", "jpg"),
            ("pose", "mat"),
            ("timestamp", "tms"),
            ("pointcloud", "pcl"),
        ):
            if field_name not in entry:
                missing.append(label)
        if "pose" in entry and "pointcloud" in entry:
            frames_with_pose_and_pcl += 1
        if missing:
            incomplete_frames.append({
                "frame_id": frame_id,
                "missing": missing,
            })

    if preview_cache_files:
        warnings.append(".bin detectes: caches de preview temporaires, pas source de verite portable")

    if not pointcloud_files:
        warnings.append("Aucun .pcl trouve; le calcul point cloud global ne sera pas possible")
    if not timestamp_files:
        warnings.append("Aucun .tms trouve")

    minimum_ok = minimum_dataset_requirements_met(
        rgb_images, pose_files, pointcloud_files, state_info, incomplete_frames
    )
    dataset_valid = len(errors) == 0 and minimum_ok
    current_processing_possible = dataset_valid and frames_with_pose_and_pcl > 0

    if current_processing_possible and warnings:
        recommendation = {
            "status": "possible_with_warnings",
            "message": "Dataset valide avec warnings: traitement PC et point cloud debug PLY autorises.",
        }
    elif current_processing_possible:
        recommendation = {
            "status": "possible",
            "message": "Traitement PC actuel possible: validation et point cloud debug PLY.",
        }
    elif frames_with_pose_and_pcl > 0 and not minimum_ok:
        recommendation = {
            "status": "impossible",
            "message": "Traitement PC actuel impossible: fichiers critiques manquants ou frames incompletes.",
        }
    elif frames_with_pose_and_pcl > 0:
        recommendation = {
            "status": "possible_with_warnings",
            "message": "Traitement PC partiel possible, mais le dataset comporte des erreurs bloquantes.",
        }
    else:
        recommendation = {
            "status": "impossible",
            "message": "Traitement PC actuel impossible: il manque au minimum des couples pose + point cloud exploitables.",
        }

    copied_preview_files = []
    for special_name in ("metadata.json", "state.txt", "distortion.txt", "rotation.txt"):
        candidate = dataset_root / special_name
        if candidate.exists():
            destination = preview_dir / candidate.name
            shutil.copy2(str(candidate), str(destination))
            copied_preview_files.append(str(destination.resolve()))
    if rgb_images:
        destination = preview_dir / rgb_images[0].name
        shutil.copy2(str(rgb_images[0]), str(destination))
        copied_preview_files.append(str(destination.resolve()))

    report = {
        "input_path": str(extraction["input_path"]),
        "source_type": extraction["source_type"],
        "dataset_root": str(dataset_root),
        "extracted_path": str(extraction["extracted_path"]) if extraction["extracted_path"] else None,
        "dataset_kind": dataset_kind,
        "dataset_valid": dataset_valid,
        "dataset_valid_with_warnings": dataset_valid and len(warnings) > 0,
        "current_pc_processing_possible": current_processing_possible,
        "recommendation": recommendation,
        "metadata_present": metadata is not None,
        "state_present": state_info["present"],
        "distortion_present": distortion_info["present"],
        "rotation_present": rotation_info["present"],
        "total_size_bytes": total_size_bytes,
        "total_size_human": human_size(total_size_bytes),
        "counts": {
            "frame_ids": len(frame_ids),
            "rgb_images": len(rgb_images),
            "depth_images": len(depth_images),
            "confidence_images": len(confidence_images),
            "pose_files": len(pose_files),
            "timestamp_files": len(timestamp_files),
            "pointcloud_files": len(pointcloud_files),
            "preview_cache_files": len(preview_cache_files),
            "frames_with_pose_and_pcl": frames_with_pose_and_pcl,
            "empty_files": len(empty_files),
            "empty_files_critical": len(empty_files_critical),
            "empty_files_non_critical": len(empty_files_non_critical),
            "warning_count": len(warnings),
            "total_files": len(all_files),
        },
        "intrinsics": {
            "width": state_info["width"],
            "height": state_info["height"],
            "cx": state_info["cx"],
            "cy": state_info["cy"],
            "fx": state_info["fx"],
            "fy": state_info["fy"],
        },
        "state": state_info,
        "distortion": distortion_info,
        "rotation": rotation_info,
        "metadata": metadata,
        "empty_files": empty_files,
        "empty_files_critical": empty_files_critical,
        "empty_files_non_critical": empty_files_non_critical,
        "incomplete_frames": incomplete_frames,
        "sample_files": {
            "rgb_images": relative_paths(dataset_root, rgb_images[:5]),
            "pose_files": relative_paths(dataset_root, pose_files[:5]),
            "pointcloud_files": relative_paths(dataset_root, pointcloud_files[:5]),
        },
        "errors": errors,
        "warnings": warnings,
        "preview_files": copied_preview_files,
        "notes": [
            "Le logiciel PC actuel valide le dataset et peut construire un point cloud debug PLY.",
            "Il ne fait pas encore de reconstruction complete ni de texturing PC complet.",
        ],
    }
    return report


def write_dataset_reports(report, output_dir):
    output_dir = ensure_directory(output_dir)
    json_path = output_dir / "dataset_report.json"
    txt_path = output_dir / "dataset_report.txt"

    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, ensure_ascii=True)

    lines = [
        "3DLiveScanner PC Processor - Rapport dataset",
        "",
        "Input: %s" % report["input_path"],
        "Dataset root: %s" % report["dataset_root"],
        "Type: %s" % report["dataset_kind"],
        "Dataset valide: %s" % ("oui" if report["dataset_valid"] else "non"),
        "Dataset valide avec warnings: %s" % ("oui" if report.get("dataset_valid_with_warnings") else "non"),
        "Traitement PC actuel possible: %s" % ("oui" if report["current_pc_processing_possible"] else "non"),
        "Recommendation: %s" % report["recommendation"]["message"],
        "",
        "Taille totale: %s (%d octets)" % (report["total_size_human"], report["total_size_bytes"]),
        "",
        "Comptages:",
        "  - images RGB: %d" % report["counts"]["rgb_images"],
        "  - poses .mat: %d" % report["counts"]["pose_files"],
        "  - timestamps .tms: %d" % report["counts"]["timestamp_files"],
        "  - point clouds .pcl: %d" % report["counts"]["pointcloud_files"],
        "  - frames avec pose + pcl: %d" % report["counts"]["frames_with_pose_and_pcl"],
        "  - fichiers vides: %d" % report["counts"]["empty_files"],
        "  - fichiers vides critiques: %d" % report["counts"].get("empty_files_critical", 0),
        "  - fichiers vides non critiques: %d" % report["counts"].get("empty_files_non_critical", 0),
        "  - warnings: %d" % report["counts"].get("warning_count", len(report["warnings"])),
        "",
        "Intrinsics lus depuis state.txt:",
        "  - width: %s" % report["intrinsics"]["width"],
        "  - height: %s" % report["intrinsics"]["height"],
        "  - cx: %s" % report["intrinsics"]["cx"],
        "  - cy: %s" % report["intrinsics"]["cy"],
        "  - fx: %s" % report["intrinsics"]["fx"],
        "  - fy: %s" % report["intrinsics"]["fy"],
        "",
        "Presence fichiers globaux:",
        "  - metadata.json: %s" % ("oui" if report["metadata_present"] else "non"),
        "  - state.txt: %s" % ("oui" if report["state_present"] else "non"),
        "  - distortion.txt: %s" % ("oui" if report["distortion_present"] else "non"),
        "  - rotation.txt: %s" % ("oui" if report["rotation_present"] else "non"),
        "",
        "Frames incompletes: %d" % len(report["incomplete_frames"]),
    ]

    for frame in report["incomplete_frames"][:20]:
        lines.append("  - %s: manque %s" % (frame["frame_id"], ", ".join(frame["missing"])))
    if len(report["incomplete_frames"]) > 20:
        lines.append("  - ... %d autres frames incompletes" % (len(report["incomplete_frames"]) - 20))

    lines.append("")
    lines.append("Erreurs: %d" % len(report["errors"]))
    for error in report["errors"]:
        lines.append("  - %s" % error)

    lines.append("")
    lines.append("Warnings: %d" % len(report["warnings"]))
    for warning in report["warnings"]:
        lines.append("  - %s" % warning)

    lines.append("")
    lines.append("Ce que le logiciel fait reellement aujourd'hui:")
    lines.append("  - validation structurelle dataset")
    lines.append("  - lecture ZIP/dossier")
    lines.append("  - export PLY debug possible si .pcl + .mat sont presents")
    lines.append("  - pas de reconstruction complete")
    lines.append("  - pas de texturing complet")
    lines.append("")

    txt_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return json_path, txt_path


def multiply_glm_matrix_vector(matrix_columns, vector):
    x, y, z, w = vector
    result = [0.0, 0.0, 0.0, 0.0]
    for row in range(4):
        result[row] = (
            matrix_columns[0][row] * x +
            matrix_columns[1][row] * y +
            matrix_columns[2][row] * z +
            matrix_columns[3][row] * w
        )
    return result


def load_pcl_points(path):
    data = Path(path).read_bytes()
    if len(data) < 4:
        raise ValueError("PCL file too small")
    num_points = struct.unpack("<I", data[:4])[0]
    expected_size = 4 + num_points * 16
    if len(data) != expected_size:
        raise ValueError("PCL size mismatch: expected %d bytes, got %d" % (expected_size, len(data)))

    points = []
    offset = 4
    for _ in range(num_points):
        x, y, z, confidence = struct.unpack_from("<ffff", data, offset)
        points.append((x, y, z, confidence))
        offset += 16
    return points


def transform_point_for_debug_export(local_point, color_camera_matrix, yaw_degrees):
    x, y, z, confidence = local_point
    transformed = multiply_glm_matrix_vector(color_camera_matrix, (x, y, z, 1.0))
    yaw_radians = math.radians(yaw_degrees if yaw_degrees is not None else -90.0)
    sin_yaw = math.sin(-yaw_radians)
    cos_yaw = math.cos(-yaw_radians)
    wx, wy, wz = transformed[0], transformed[1], transformed[2]
    return (
        wx * sin_yaw - wz * cos_yaw,
        wy,
        wx * cos_yaw + wz * sin_yaw,
        confidence,
    )


def write_ascii_ply(points, output_path):
    output_path = Path(output_path)
    with output_path.open("w", encoding="utf-8") as handle:
        handle.write("ply\n")
        handle.write("format ascii 1.0\n")
        handle.write("comment Generated by 3DLiveScanner pc_processor\n")
        handle.write("element vertex %d\n" % len(points))
        handle.write("property float x\n")
        handle.write("property float y\n")
        handle.write("property float z\n")
        handle.write("property uchar red\n")
        handle.write("property uchar green\n")
        handle.write("property uchar blue\n")
        handle.write("end_header\n")
        for x, y, z, confidence in points:
            shade = int(max(0.0, min(1.0, confidence)) * 255.0)
            handle.write("%.6f %.6f %.6f %d %d %d\n" % (x, y, z, shade, shade, shade))


def build_debug_pointcloud(report, output_dir, log=print):
    start_time = time.perf_counter()
    dataset_root = Path(report["dataset_root"])
    output_dir = ensure_directory(output_dir)
    logs_dir = ensure_directory(output_dir / "logs")
    mat_log_path = logs_dir / "mat_parse.log"
    mat_log_lines = []

    def mat_log(message):
        mat_log_lines.append(message)
        if log:
            log(message)

    yaw_degrees = report["rotation"]["yaw_degrees"]
    all_frame_entries = discover_frame_files(collect_files(dataset_root))
    frame_ids = sorted(all_frame_entries.keys())

    merged_points = []
    frames_read = 0
    frames_ignored = []
    total_points_read = 0
    mat_files_seen = 0
    mat_files_parsed = 0
    pcl_files_read = 0

    for frame_id in frame_ids:
        entry = all_frame_entries[frame_id]
        if "pose" not in entry or "pointcloud" not in entry:
            frames_ignored.append({
                "frame_id": frame_id,
                "reason": "missing pose or pointcloud",
            })
            continue

        try:
            mat_files_seen += 1
            pose_result = parse_pose_file(entry["pose"], log=mat_log)
            if not pose_result.ok:
                raise ValueError(pose_result.error or "Pose parse failed")
            mat_files_parsed += 1
            color_matrix = pose_result.matrices[pose_result.selected_index]

            local_points = load_pcl_points(entry["pointcloud"])
            pcl_files_read += 1
            mat_log("[PCL] %s: points=%d" % (entry["pointcloud"].name, len(local_points)))

            frames_read += 1
            total_points_read += len(local_points)
            frame_exported = 0

            for point in local_points:
                if point[2] <= 0.0 or point[2] >= 10.0:
                    continue
                merged_points.append(
                    transform_point_for_debug_export(point, color_matrix, yaw_degrees)
                )
                frame_exported += 1
            mat_log("[PLY] frame %s: exported_points=%d" % (frame_id, frame_exported))
        except Exception as exc:
            frames_ignored.append({
                "frame_id": frame_id,
                "reason": str(exc),
            })
            mat_log("[MAT] %s: FAILED %s" % (frame_id, exc))

    ply_path = output_dir / "debug_pointcloud.ply"
    write_ascii_ply(merged_points, ply_path)
    mat_log("[PLY] exported_points=%d" % len(merged_points))
    mat_log_path.write_text("\n".join(mat_log_lines) + "\n", encoding="utf-8")

    elapsed_seconds = time.perf_counter() - start_time
    stats = {
        "dataset_root": str(dataset_root),
        "frames_discovered": len(frame_ids),
        "frames_read": frames_read,
        "frames_ignored": frames_ignored,
        "mat_files_seen": mat_files_seen,
        "mat_files_parsed": mat_files_parsed,
        "pcl_files_read": pcl_files_read,
        "pose_matrix_selected": "COLOR_CAMERA",
        "points_read": total_points_read,
        "points_exported": len(merged_points),
        "duration_seconds": elapsed_seconds,
        "output_ply": str(ply_path.resolve()),
        "mat_parse_log": str(mat_log_path.resolve()),
        "notes": [
            "Export PLY de debug base sur les .pcl et poses .mat.",
            "Couleur encodee en niveaux de gris a partir de la confiance du point.",
            "Ce n'est pas une reconstruction complete ni un mesh texturise.",
        ],
    }

    stats_path = output_dir / "processing_stats.json"
    with stats_path.open("w", encoding="utf-8") as handle:
        json.dump(stats, handle, indent=2, ensure_ascii=True)

    log_path = logs_dir / "pointcloud_build.log"
    log_lines = [
        "frames_discovered=%d" % stats["frames_discovered"],
        "frames_read=%d" % stats["frames_read"],
        "frames_ignored=%d" % len(stats["frames_ignored"]),
        "points_read=%d" % stats["points_read"],
        "points_exported=%d" % stats["points_exported"],
        "duration_seconds=%.3f" % stats["duration_seconds"],
        "output_ply=%s" % stats["output_ply"],
    ]
    log_path.write_text("\n".join(log_lines) + "\n", encoding="utf-8")

    return stats, stats_path, ply_path
