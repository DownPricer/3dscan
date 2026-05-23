#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = SCRIPT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from pc_processor_core import analyse_dataset, ensure_directory, write_dataset_reports


def validate_dataset(dataset_input, output_dir):
    output_dir = ensure_directory(output_dir)
    report = analyse_dataset(dataset_input, output_dir)
    json_path, txt_path = write_dataset_reports(report, output_dir)
    return report, json_path, txt_path


def print_summary(report, json_path, txt_path):
    print("[pc_processor] Dataset type         :", report["dataset_kind"])
    print("[pc_processor] Dataset valide      :", "oui" if report["dataset_valid"] else "non")
    print("[pc_processor] Traitement possible :", "oui" if report["current_pc_processing_possible"] else "non")
    print("[pc_processor] Taille totale       :", report["total_size_human"])
    print("[pc_processor] Images RGB          :", report["counts"]["rgb_images"])
    print("[pc_processor] Poses .mat          :", report["counts"]["pose_files"])
    print("[pc_processor] Timestamps .tms     :", report["counts"]["timestamp_files"])
    print("[pc_processor] Point clouds .pcl   :", report["counts"]["pointcloud_files"])
    print("[pc_processor] Frames incompletes  :", len(report["incomplete_frames"]))
    print("[pc_processor] Recommendation      :", report["recommendation"]["message"])

    if report["errors"]:
        print("[pc_processor] Erreurs:")
        for error in report["errors"]:
            print("  -", error)

    if report["warnings"]:
        print("[pc_processor] Warnings:")
        for warning in report["warnings"]:
            print("  -", warning)

    print("[pc_processor] Rapport JSON        :", json_path)
    print("[pc_processor] Rapport TXT         :", txt_path)


def main():
    parser = argparse.ArgumentParser(description="Valide un dataset 3DLiveScanner pour traitement PC Windows.")
    parser.add_argument("dataset_input", help="Dossier .dataset ou archive .zip")
    parser.add_argument("output_dir", help="Dossier de sortie")
    args = parser.parse_args()

    try:
        report, json_path, txt_path = validate_dataset(args.dataset_input, args.output_dir)
        print_summary(report, json_path, txt_path)
        return 0 if report["dataset_valid"] else 2
    except Exception as exc:
        print("[pc_processor] ERROR:", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
