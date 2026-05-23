#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = SCRIPT_DIR.parent / "src"
GUI_DIR = SCRIPT_DIR.parent / "gui"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
if str(GUI_DIR) not in sys.path:
    sys.path.insert(0, str(GUI_DIR))

from processing_runner import run_processing  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Pipeline Windows local minimal pour datasets 3DLiveScanner.")
    parser.add_argument("dataset_input", help="Dossier .dataset ou archive .zip")
    parser.add_argument("output_dir", help="Dossier de sortie")
    parser.add_argument(
        "--mesh",
        action="store_true",
        help="Generer un mesh experimental (Open3D requis)",
    )
    parser.add_argument(
        "--site-glb",
        action="store_true",
        help="Generer site_model.glb si mesh disponible (trimesh requis)",
    )
    args = parser.parse_args()

    result = run_processing(
        args.dataset_input,
        args.output_dir,
        generate_mesh=args.mesh,
        generate_site_glb=args.site_glb,
    )

    print("[pc_processor] Code sortie : %d" % result.exit_code)
    if result.json_report_path:
        print("[pc_processor] Rapport JSON        :", result.json_report_path)
    if result.txt_report_path:
        print("[pc_processor] Rapport TXT         :", result.txt_report_path)
    if result.ply_path:
        print("[pc_processor] Debug PLY           :", result.ply_path)
    if result.preview_html_path:
        print("[pc_processor] Preview HTML        :", result.preview_html_path)
    if result.web_pointcloud_ply_path:
        print("[pc_processor] Web PLY             :", result.web_pointcloud_ply_path)
    if result.debug_mesh_obj_path:
        print("[pc_processor] Mesh OBJ            :", result.debug_mesh_obj_path)
    if result.site_ready_model_path:
        print("[pc_processor] Site-ready model     :", result.site_ready_model_path)
    if result.site_ready_dir:
        print("[pc_processor] Site-ready dossier   :", result.site_ready_dir)
    elif result.site_model_glb_path:
        print("[pc_processor] Site GLB            :", result.site_model_glb_path)

    for message in result.messages:
        print("[pc_processor]", message)

    return result.exit_code


if __name__ == "__main__":
    sys.exit(main())
