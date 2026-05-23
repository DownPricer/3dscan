#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = SCRIPT_DIR.parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from pc_processor_core import analyse_dataset, build_debug_pointcloud, ensure_directory, write_dataset_reports


def main():
    parser = argparse.ArgumentParser(description="Construit un point cloud global de debug a partir d'un dataset 3DLiveScanner.")
    parser.add_argument("dataset_input", help="Dossier .dataset ou archive .zip")
    parser.add_argument("output_dir", help="Dossier de sortie")
    args = parser.parse_args()

    try:
        output_dir = ensure_directory(args.output_dir)
        report = analyse_dataset(args.dataset_input, output_dir)
        write_dataset_reports(report, output_dir)

        if not report["counts"]["frames_with_pose_and_pcl"]:
            print("[pc_processor] Aucun couple pose + pcl exploitable; export PLY impossible.")
            return 2

        stats, stats_path, ply_path = build_debug_pointcloud(report, output_dir)
        print("[pc_processor] Frames lues      :", stats["frames_read"])
        print("[pc_processor] Frames ignorees  :", len(stats["frames_ignored"]))
        print("[pc_processor] Points lus       :", stats["points_read"])
        print("[pc_processor] Points exportes  :", stats["points_exported"])
        print("[pc_processor] Debug PLY        :", ply_path)
        print("[pc_processor] Stats JSON       :", stats_path)
        return 0
    except Exception as exc:
        print("[pc_processor] ERROR:", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
