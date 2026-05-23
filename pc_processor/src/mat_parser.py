#!/usr/bin/env python3
"""Parse .mat pose files written by 3DLiveScanner Android (GLM column-major text)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, List, Optional

# common/data/dataset.h: COLOR_CAMERA=0, OPENGL_CAMERA=1, SCREEN_CAMERA=2, MAX_CAMERA=3
COLOR_CAMERA_INDEX = 0
CAMERA_MATRIX_NAMES = ("COLOR_CAMERA", "OPENGL_CAMERA", "SCREEN_CAMERA", "MATRIX_4")

FLOAT_PATTERN = re.compile(r"[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?")


@dataclass
class PoseParseResult:
    ok: bool
    matrices: List[List[List[float]]] = field(default_factory=list)
    matrix_count: int = 0
    value_count: int = 0
    line_count: int = 0
    format_name: str = ""
    selected_index: int = COLOR_CAMERA_INDEX
    selected_name: str = CAMERA_MATRIX_NAMES[COLOR_CAMERA_INDEX]
    warning: Optional[str] = None
    error: Optional[str] = None


def extract_floats(text: str) -> List[float]:
    return [float(token) for token in FLOAT_PATTERN.findall(text)]


def floats_to_column_major_matrices(floats: List[float]) -> List[List[List[float]]]:
    """Group floats into 4x4 matrices stored as 4 columns of 4 rows (GLM layout)."""
    complete_blocks = len(floats) // 16
    matrices = []
    for block_index in range(complete_blocks):
        block = floats[block_index * 16:(block_index + 1) * 16]
        columns = []
        for column_index in range(4):
            start = column_index * 4
            columns.append(block[start:start + 4])
        matrices.append(columns)
    return matrices


def parse_pose_file(path, log: Optional[Callable[[str], None]] = None) -> PoseParseResult:
    path = Path(path)
    result = PoseParseResult(ok=False)

    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        result.error = "Unable to read pose file: %s" % exc
        return result

    lines = [line.strip() for line in text.splitlines() if line.strip() and not line.strip().startswith("#")]
    result.line_count = len(lines)
    floats = extract_floats(text)
    result.value_count = len(floats)

    if len(floats) < 16:
        result.error = "Pose file contains only %d floats; need at least 16 for one 4x4 matrix" % len(floats)
        return result

    matrices = floats_to_column_major_matrices(floats)
    result.matrix_count = len(matrices)
    result.matrices = matrices

    remainder = len(floats) % 16
    if remainder:
        result.warning = "%d trailing float(s) ignored after %d complete matrix block(s)" % (
            remainder, result.matrix_count
        )

    if result.matrix_count == 3:
        result.format_name = "android_3_camera"
    elif result.matrix_count == 4:
        result.format_name = "synthetic_4_camera"
    elif result.matrix_count == 1:
        result.format_name = "single_matrix"
    else:
        result.format_name = "generic_%d_matrix" % result.matrix_count

    if result.matrix_count < 1:
        result.error = "No complete 4x4 matrix found in pose file"
        return result

    if COLOR_CAMERA_INDEX >= result.matrix_count:
        result.selected_index = 0
        result.selected_name = CAMERA_MATRIX_NAMES[0]
        extra = "COLOR_CAMERA missing; using matrix index 0"
        result.warning = (result.warning + "; " + extra) if result.warning else extra
    else:
        result.selected_index = COLOR_CAMERA_INDEX
        result.selected_name = CAMERA_MATRIX_NAMES[COLOR_CAMERA_INDEX]

    result.ok = True
    if log:
        log(
            "[MAT] %s: values=%d, lines=%d, matrices=%d, format=%s, selected=%s"
            % (
                path.name,
                result.value_count,
                result.line_count,
                result.matrix_count,
                result.format_name,
                result.selected_name,
            )
        )
    return result


def get_selected_matrix(parse_result: PoseParseResult) -> List[List[float]]:
    if not parse_result.ok or not parse_result.matrices:
        raise ValueError(parse_result.error or "Pose parse failed")
    return parse_result.matrices[parse_result.selected_index]
