#!/usr/bin/env python3
"""Orchestration partagee entre CLI et interface graphique."""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable, List, Optional


GUI_DIR = Path(__file__).resolve().parent
PC_PROCESSOR_DIR = GUI_DIR.parent
SRC_DIR = PC_PROCESSOR_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from pc_processor_core import (  # noqa: E402
    analyse_dataset,
    build_debug_pointcloud,
    ensure_directory,
    write_dataset_reports,
)
from export_pipeline import run_post_pointcloud_pipeline  # noqa: E402


LogCallback = Callable[[str], None]


@dataclass
class ProcessingResult:
    success: bool
    exit_code: int
    output_dir: Path
    report: Optional[dict] = None
    json_report_path: Optional[Path] = None
    txt_report_path: Optional[Path] = None
    ply_path: Optional[Path] = None
    stats_path: Optional[Path] = None
    stats: Optional[dict] = None
    messages: List[str] = field(default_factory=list)
    error_message: Optional[str] = None
    preview_html_path: Optional[Path] = None
    open_preview_bat_path: Optional[Path] = None
    web_pointcloud_ply_path: Optional[Path] = None
    web_pointcloud_glb_path: Optional[Path] = None
    debug_mesh_obj_path: Optional[Path] = None
    site_model_glb_path: Optional[Path] = None
    site_model_obj_path: Optional[Path] = None
    site_ready_dir: Optional[Path] = None
    site_ready_model_path: Optional[Path] = None
    site_compatible: bool = False
    model_textured: bool = False
    pipeline_summary: Optional[dict] = None


def default_output_dir(base_dir: Optional[Path] = None) -> Path:
    root = base_dir or (PC_PROCESSOR_DIR / "output_gui")
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return ensure_directory(root / ("run_" + stamp))


def _path_or_none(value: Optional[str]) -> Optional[Path]:
    if not value:
        return None
    return Path(value)


def run_processing(
    dataset_input: str | Path,
    output_dir: str | Path | None = None,
    log: LogCallback = print,
    generate_mesh: bool = False,
    generate_site_glb: bool = False,
    include_debug_preview: bool = False,
    enable_gray_site_export: bool = False,
) -> ProcessingResult:
    try:
        target_output = ensure_directory(output_dir or default_output_dir())
        ensure_directory(target_output / "preview")
        ensure_directory(target_output / "extracted")
        ensure_directory(target_output / "logs")

        log("[pc_processor] Entree : %s" % Path(dataset_input).resolve())
        log("[pc_processor] Sortie : %s" % target_output.resolve())
        log("")
        log("Etape 1/2 : validation du dataset...")

        report = analyse_dataset(dataset_input, target_output)
        json_path, txt_path = write_dataset_reports(report, target_output)

        log("Rapport JSON : %s" % json_path)
        log("Rapport TXT  : %s" % txt_path)
        if report.get("dataset_valid_with_warnings"):
            log("Dataset valide : oui (avec warnings)")
        else:
            log("Dataset valide : %s" % ("oui" if report["dataset_valid"] else "non"))

        if report.get("warnings"):
            log("Warnings : %d" % len(report["warnings"]))
            for warning in report["warnings"][:20]:
                log("  - %s" % warning)
            if len(report["warnings"]) > 20:
                log("  - ... %d autres warnings" % (len(report["warnings"]) - 20))

        result = ProcessingResult(
            success=False,
            exit_code=2,
            output_dir=target_output,
            report=report,
            json_report_path=json_path,
            txt_report_path=txt_path,
        )

        if report["errors"]:
            log("")
            log("Erreurs detectees :")
            for error in report["errors"]:
                log("  - %s" % error)

        if not report["dataset_valid"]:
            result.messages.append("Dataset invalide.")
            result.messages.append("Consultez le rapport pour les fichiers manquants ou incorrects.")
            result.messages.append(str(txt_path))
            result.error_message = "Dataset invalide"
            log("")
            log("Analyse interrompue : dataset invalide.")
            return result

        if not report["current_pc_processing_possible"]:
            result.success = True
            result.exit_code = 0
            result.messages.append("Dataset valide.")
            result.messages.append(
                report.get("recommendation", {}).get(
                    "message",
                    "Le point cloud debug n'a pas pu etre genere.",
                )
            )
            log("")
            log("Dataset valide, mais point cloud debug impossible.")
            log("Raison : %s" % report["recommendation"]["message"])
            return result

        log("")
        log("Etape 2/2 : generation du point cloud debug...")
        stats, stats_path, ply_path = build_debug_pointcloud(report, target_output, log=log)

        result.stats = stats
        result.stats_path = stats_path
        result.ply_path = ply_path

        if report.get("dataset_valid_with_warnings"):
            result.messages.append("Dataset valide avec warnings.")
            for warning in report["warnings"][:8]:
                result.messages.append("  - %s" % warning)
            if len(report["warnings"]) > 8:
                result.messages.append("  - ... %d autres warnings" % (len(report["warnings"]) - 8))

        log("Fichiers .mat lus : %d / %d" % (
            stats.get("mat_files_parsed", 0),
            stats.get("mat_files_seen", 0),
        ))
        log("Fichiers .pcl lus : %d" % stats.get("pcl_files_read", 0))
        log("Matrice pose utilisee : %s" % stats.get("pose_matrix_selected", "COLOR_CAMERA"))

        if stats["points_exported"] <= 0:
            result.success = False
            result.exit_code = 3
            result.error_message = "Point cloud vide"
            result.messages.append("Dataset valide, mais le PLY debug est vide.")
            result.messages.append("Poses .mat parsees : %d / %d" % (
                stats.get("mat_files_parsed", 0),
                stats.get("mat_files_seen", 0),
            ))
            result.messages.append("Frames lues : %d" % stats.get("frames_read", 0))
            result.messages.append("Frames ignorees : %d" % len(stats.get("frames_ignored", [])))
            if stats.get("frames_ignored"):
                for entry in stats["frames_ignored"][:5]:
                    result.messages.append("  - %s: %s" % (entry.get("frame_id"), entry.get("reason")))
            result.messages.append("Consultez : %s" % stats.get("mat_parse_log", stats_path))
            log("")
            log("Point cloud debug : VIDE")
            return result

        run_mesh = generate_mesh and enable_gray_site_export
        run_site = generate_site_glb and enable_gray_site_export
        if generate_mesh and not enable_gray_site_export:
            log("")
            log(
                "[pc_processor] Export mesh/site gris desactive — "
                "en attente du pipeline texturing (voir ANDROID_TEXTURED_EXPORT_PIPELINE_AUDIT.md)."
            )

        pipeline_summary = run_post_pointcloud_pipeline(
            target_output,
            ply_path,
            stats["points_exported"],
            generate_mesh=run_mesh,
            generate_site_glb=run_site,
            include_debug_preview=include_debug_preview and enable_gray_site_export,
            log=log,
        )
        result.pipeline_summary = pipeline_summary
        result.preview_html_path = _path_or_none(pipeline_summary.get("preview_html"))
        result.open_preview_bat_path = _path_or_none(pipeline_summary.get("open_preview_bat"))
        result.web_pointcloud_ply_path = _path_or_none(pipeline_summary.get("web_pointcloud_ply"))
        result.web_pointcloud_glb_path = _path_or_none(pipeline_summary.get("web_pointcloud_glb"))
        result.debug_mesh_obj_path = _path_or_none(pipeline_summary.get("debug_mesh_obj"))
        result.site_model_glb_path = _path_or_none(pipeline_summary.get("site_model_glb"))
        result.site_model_obj_path = _path_or_none(pipeline_summary.get("site_model_obj"))
        result.site_ready_dir = _path_or_none(pipeline_summary.get("site_ready_dir"))
        result.site_ready_model_path = _path_or_none(pipeline_summary.get("site_ready_model"))
        result.site_compatible = bool(pipeline_summary.get("site_compatible"))
        result.model_textured = bool(pipeline_summary.get("textured"))

        summary_path = target_output / "export_summary.json"
        with summary_path.open("w", encoding="utf-8") as handle:
            json.dump(pipeline_summary, handle, indent=2, ensure_ascii=True)

        result.messages.append("Analyse terminee.")
        result.messages.append("")
        result.messages.append("--- Point cloud genere ---")
        result.messages.append("OK pour verifier la capture (pas le modele final).")
        result.messages.append("Points exportes : %d" % stats["points_exported"])
        result.messages.append("PLY debug : %s" % ply_path.name)
        result.messages.append("")
        result.messages.append("--- Previsualisation ---")
        result.messages.append("preview.html + open_preview.bat")
        if result.web_pointcloud_ply_path:
            result.messages.append("Export web : %s" % result.web_pointcloud_ply_path.name)
        if pipeline_summary.get("status", {}).get("mesh") == "ok":
            result.messages.append("")
            result.messages.append("--- Mesh experimental ---")
            result.messages.append("OK pour test 3D (peut avoir des trous, non texturé).")
            result.messages.append("debug_mesh.obj")
        elif generate_mesh:
            for msg in pipeline_summary.get("messages", []):
                if msg:
                    result.messages.append("Mesh : %s" % msg)
        if result.site_ready_model_path:
            result.messages.append("")
            result.messages.append("--- Fichier pour le site ---")
            result.messages.append("Dossier : site-ready/")
            result.messages.append("Fichier a uploader : %s" % result.site_ready_model_path.name)
            result.messages.append("Compatible site : %s" % ("oui" if result.site_compatible else "non"))
            result.messages.append("Texturé : %s" % ("oui" if result.model_textured else "non"))
            if not result.model_textured:
                result.messages.append(
                    "Attention : modele geometrique non texturé. Test technique, "
                    "pas encore rendu final client."
                )
        elif generate_site_glb and generate_mesh:
            result.messages.append("Export site : non disponible (Open3D + trimesh requis, voir logs).")

        result.success = True
        result.exit_code = 0

        log("")
        log("Point cloud debug : cree")
        log("PLY : %s" % ply_path)
        log("Stats : %s" % stats_path)
        log("Frames lues : %d" % stats["frames_read"])
        log("Points exportes : %d" % stats["points_exported"])
        if result.preview_html_path:
            log("Preview : %s" % result.preview_html_path)
        return result

    except Exception as exc:
        log("")
        log("ERREUR : %s" % exc)
        fallback_output = Path(output_dir) if output_dir else (PC_PROCESSOR_DIR / "output_gui")
        return ProcessingResult(
            success=False,
            exit_code=1,
            output_dir=ensure_directory(fallback_output),
            error_message=str(exc),
            messages=["Erreur pendant le traitement : %s" % exc],
        )
