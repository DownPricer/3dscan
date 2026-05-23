#!/usr/bin/env python3
"""Test non-regression : deux ZIP differents => manifests et dossiers runs differents."""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = SCRIPT_DIR.parent / "src"
sys.path.insert(0, str(SRC_DIR))

from run_isolation import allocate_run_for_input, read_run_manifest, sha256_file  # noqa: E402
from run_isolation import get_allowed_search_roots, path_in_global_meshroom_cache  # noqa: E402


def main() -> int:
    test_dir = Path(r"C:\Users\ironi\Outils\Buisnesss\test")
    zips = sorted(test_dir.glob("*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
    if len(zips) < 2:
        print("SKIP: il faut au moins 2 ZIP dans", test_dir)
        return 0

    zip_a, zip_b = zips[0], zips[1]
    print("ZIP A:", zip_a.name)
    print("ZIP B:", zip_b.name)

    sha_a = sha256_file(zip_a)
    sha_b = sha256_file(zip_b)
    print("SHA256 A:", sha_a[:16], "...")
    print("SHA256 B:", sha_b[:16], "...")

    if sha_a == sha_b:
        print("WARN: les deux ZIP ont le meme SHA256 (fichiers identiques?)")
    else:
        print("OK: SHA256 differents")

    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        run_a, id_a, _ = allocate_run_for_input(base, zip_a)
        run_b, id_b, _ = allocate_run_for_input(base, zip_b)

        if run_a == run_b or id_a == id_b:
            print("FAIL: memes dossiers run")
            return 1
        print("OK: dossiers run differents", id_a, id_b)

        man_a = read_run_manifest(run_a)
        man_b = read_run_manifest(run_b)
        if not man_a or not man_b:
            print("FAIL: manifest manquant")
            return 1
        if man_a["input_sha256"] == man_b["input_sha256"]:
            print("FAIL: manifest SHA256 identiques")
            return 1
        print("OK: run_manifest.json differents")

        roots = get_allowed_search_roots(run_a / "work", run_a, None)
        for r in roots:
            if path_in_global_meshroom_cache(r):
                print("FAIL: racine autorisee dans cache global", r)
                return 1
        print("OK: aucune racine globale MeshroomCache")

    print("Tous les tests d'isolation manifest OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
