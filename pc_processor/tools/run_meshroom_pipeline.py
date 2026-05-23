#!/usr/bin/env python3
"""CLI : dataset Android -> Meshroom -> site-ready."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = SCRIPT_DIR.parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from meshroom_pipeline import (  # noqa: E402
    extract_jpg_images,
    find_meshroom_batch,
    run_meshroom_pipeline,
    save_meshroom_config,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Photogrammetrie Meshroom depuis un dataset Android (.zip ou .dataset)."
    )
    parser.add_argument("dataset_input", help="ZIP ou dossier .dataset")
    parser.add_argument("output_dir", help="Dossier de sortie")
    parser.add_argument(
        "--meshroom-dir",
        help="Dossier d'installation Meshroom (contenant meshroom_batch.exe)",
    )
    parser.add_argument(
        "--save-meshroom-config",
        action="store_true",
        help="Enregistrer --meshroom-dir dans meshroom/user_config.json",
    )
    parser.add_argument(
        "--extract-only",
        action="store_true",
        help="Extraire les JPG seulement, sans lancer meshroom_batch",
    )
    parser.add_argument(
        "--min-images",
        type=int,
        default=8,
        help="Nombre minimum d'images (defaut 8)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=None,
        help="Timeout meshroom_batch en secondes (defaut illimite)",
    )
    args = parser.parse_args()

    if args.meshroom_dir and args.save_meshroom_config:
        save_meshroom_config(Path(args.meshroom_dir))

    batch = find_meshroom_batch(Path(args.meshroom_dir) if args.meshroom_dir else None)
    print("[meshroom] meshroom_batch :", batch or "NON TROUVE")

    if args.extract_only:
        from meshroom_pipeline import ensure_directory

        work = ensure_directory(Path(args.output_dir) / "work")
        images_dir, count, _ = extract_jpg_images(args.dataset_input, work)
        print("[meshroom] Images :", count, "->", images_dir)
        return 0 if count >= args.min_images else 3

    result = run_meshroom_pipeline(
        args.dataset_input,
        args.output_dir,
        meshroom_dir=args.meshroom_dir,
        min_images=args.min_images,
        run_batch=not args.extract_only,
        batch_timeout_seconds=args.timeout,
    )

    for message in result.messages:
        print("[meshroom]", message)

    if result.success and result.site_ready_validated and result.site_ready_model:
        print("[meshroom] Fichier final VALIDE :", result.site_ready_model)
        print("[meshroom] Textures :", len(result.texture_files))
    elif result.exit_code in (6, 7):
        print("[meshroom] AUCUN fichier site-ready valide.")
        for reason in result.failure_reasons:
            print("[meshroom] Cause :", reason)
        if result.audit_path:
            print("[meshroom] Audit :", result.audit_path)

    return result.exit_code


if __name__ == "__main__":
    sys.exit(main())
