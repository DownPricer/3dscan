#!/usr/bin/env python3
"""Preview locale (debug), export web et dossier site-ready (Open3D / trimesh optionnels)."""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

LogCallback = Callable[[str], None]


def _noop_log(_message: str) -> None:
    pass


def count_ply_vertices(ply_path: Path) -> int:
    try:
        with ply_path.open("r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                stripped = line.strip()
                if stripped.startswith("element vertex"):
                    parts = stripped.split()
                    if len(parts) >= 3:
                        return int(parts[2])
                if stripped == "end_header":
                    break
    except (OSError, ValueError):
        pass
    return 0


_PREVIEW_HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>3DLiveScanner — Prévisualisation</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Segoe UI", system-ui, sans-serif; background: #f4f6f8; color: #1a1a1a; overflow: hidden; }
    #bar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 10;
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      padding: 10px 14px; background: rgba(255,255,255,0.95);
      border-bottom: 1px solid #d0d5dc; box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }
    #bar h1 { font-size: 15px; font-weight: 600; margin-right: 8px; }
    #bar button {
      padding: 6px 14px; font-size: 13px; cursor: pointer;
      border: 1px solid #b8c0cc; border-radius: 4px; background: #fff;
    }
    #bar button:hover { background: #eef2f6; }
    #info { font-size: 13px; color: #444; }
    #err {
      display: none; position: fixed; top: 56px; left: 12px; right: 12px; z-index: 11;
      padding: 12px; background: #fde8e8; border: 1px solid #e8a0a0; border-radius: 4px;
      color: #8b1a1a; font-size: 13px;
    }
    #canvas-wrap { position: fixed; top: 48px; left: 0; right: 0; bottom: 0; }
    canvas { display: block; width: 100%; height: 100%; }
    #badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #e8eef4; color: #334; }
    #badge.warn { background: #fff3cd; color: #664d03; }
  </style>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <div id="bar">
    <h1>3DLiveScanner — Preview</h1>
    <span id="badge">Point cloud debug</span>
    <span id="info">Points : __POINT_COUNT__</span>
    <button type="button" id="btn-reset">Réinitialiser la caméra</button>
    <button type="button" id="btn-grid">Grille</button>
    <button type="button" id="btn-pc">Point cloud</button>
    <button type="button" id="btn-mesh" disabled>Mesh expérimental</button>
  </div>
  <div id="err"></div>
  <div id="canvas-wrap"></div>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
    import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

    const PLY_FILE = '__PLY_FILE__';
    const MESH_FILE = '__MESH_FILE__';
    const EXPECTED_POINTS = __POINT_COUNT__;

    const errEl = document.getElementById('err');
    const infoEl = document.getElementById('info');
    const btnMesh = document.getElementById('btn-mesh');
    const wrap = document.getElementById('canvas-wrap');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f6f8);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 500);
    camera.position.set(2, 1.5, 2);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    wrap.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(5, 8, 4);
    scene.add(dir);

    let grid = new THREE.GridHelper(8, 16, 0xcccccc, 0xe0e0e0);
    scene.add(grid);
    let axes = new THREE.AxesHelper(1.2);
    scene.add(axes);
    let gridVisible = true;
    let contentGroup = new THREE.Group();
    scene.add(contentGroup);

    function showError(msg) {
      errEl.style.display = 'block';
      errEl.textContent = msg;
    }

    function fitCamera(obj) {
      const box = new THREE.Box3().setFromObject(obj);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.01);
      const dist = maxDim * 1.8;
      camera.position.set(center.x + dist, center.y + dist * 0.6, center.z + dist);
      controls.target.copy(center);
      controls.update();
    }

    function resetCamera() {
      if (contentGroup.children.length) fitCamera(contentGroup);
    }

    function toggleGrid() {
      gridVisible = !gridVisible;
      grid.visible = gridVisible;
      axes.visible = gridVisible;
    }

    function clearContent() {
      while (contentGroup.children.length) {
        const c = contentGroup.children[0];
        contentGroup.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
          else c.material.dispose();
        }
      }
    }

    function addPointCloud(geometry) {
      clearContent();
      const mat = new THREE.PointsMaterial({
        size: 0.012, vertexColors: !!geometry.attributes.color, sizeAttenuation: true,
      });
      if (!geometry.attributes.color) mat.color.set(0x6688aa);
      contentGroup.add(new THREE.Points(geometry, mat));
      fitCamera(contentGroup);
      const n = geometry.attributes.position.count;
      infoEl.textContent = 'Points affichés : ' + n.toLocaleString('fr-FR');
    }

    function addMesh(object) {
      clearContent();
      object.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x8899aa, metalness: 0.1, roughness: 0.75,
          });
        }
      });
      contentGroup.add(object);
      fitCamera(contentGroup);
      infoEl.textContent = 'Mesh expérimental (non texturé)';
      document.getElementById('badge').textContent = 'Mesh expérimental';
      document.getElementById('badge').className = 'badge warn';
    }

    async function loadPLY() {
      return new Promise((resolve, reject) => {
        new PLYLoader().load(PLY_FILE, resolve, undefined, reject);
      });
    }

    async function loadOBJ() {
      return new Promise((resolve, reject) => {
        new OBJLoader().load(MESH_FILE, resolve, undefined, reject);
      });
    }

    async function init() {
      try {
        addPointCloud(await loadPLY());
      } catch (e) {
        showError(
          'Impossible de charger ' + PLY_FILE + '. Utilisez open_preview.bat (serveur local http://localhost:8765). ' +
          (e && e.message ? e.message : String(e))
        );
        if (EXPECTED_POINTS > 0) {
          infoEl.textContent = 'Points attendus : ' + EXPECTED_POINTS.toLocaleString('fr-FR');
        }
      }
      fetch(MESH_FILE, { method: 'HEAD' }).then((r) => { if (r.ok) btnMesh.disabled = false; }).catch(() => {});
    }

    document.getElementById('btn-reset').addEventListener('click', resetCamera);
    document.getElementById('btn-grid').addEventListener('click', toggleGrid);
    document.getElementById('btn-pc').addEventListener('click', async () => {
      try {
        addPointCloud(await loadPLY());
        document.getElementById('badge').textContent = 'Point cloud debug';
        document.getElementById('badge').className = 'badge';
      } catch (e) { showError(String(e)); }
    });
    btnMesh.addEventListener('click', async () => {
      try { addMesh(await loadOBJ()); } catch (e) { showError('Mesh : ' + String(e)); }
    });

    function resize() {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', resize);
    resize();
    (function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    })();
    init();
  </script>
</body>
</html>
"""


def generate_preview_html(
    output_dir: Path,
    point_count: int = 0,
    log: LogCallback = _noop_log,
) -> Tuple[Path, Path]:
    """Genere preview.html et open_preview.bat dans le dossier de sortie."""
    output_dir = Path(output_dir)
    ply_name = "debug_pointcloud.ply"
    mesh_name = "debug_mesh.obj"

    html = _PREVIEW_HTML_TEMPLATE.replace(
        "__POINT_COUNT__", str(point_count)
    ).replace(
        "__PLY_FILE__", ply_name
    ).replace(
        "__MESH_FILE__", mesh_name
    )

    preview_path = output_dir / "preview.html"
    preview_path.write_text(html, encoding="utf-8")

    bat_content = """@echo off
cd /d "%~dp0"
echo Demarrage du serveur local sur http://localhost:8765 ...
echo Fermez cette fenetre pour arreter le serveur.
start "" http://localhost:8765/preview.html
py -3 -m http.server 8765 2>nul || python -m http.server 8765
"""
    bat_path = output_dir / "open_preview.bat"
    bat_path.write_text(bat_content, encoding="utf-8")

    log("[preview] preview.html cree")
    log("[preview] open_preview.bat cree (serveur http://localhost:8765)")
    return preview_path, bat_path


def export_web_pointcloud(
    source_ply: Path,
    output_dir: Path,
    log: LogCallback = _noop_log,
) -> Dict[str, Optional[Path]]:
    """Copie le PLY debug vers web_pointcloud.ply ; tente web_pointcloud.glb si trimesh dispo."""
    output_dir = Path(output_dir)
    source_ply = Path(source_ply)
    result: Dict[str, Optional[Path]] = {
        "web_pointcloud_ply": None,
        "web_pointcloud_glb": None,
    }

    if not source_ply.is_file():
        log("[web] Source PLY introuvable : %s" % source_ply)
        return result

    web_ply = output_dir / "web_pointcloud.ply"
    shutil.copy2(source_ply, web_ply)
    result["web_pointcloud_ply"] = web_ply
    log("[web] web_pointcloud.ply cree (point cloud, pas mesh final)")

    try:
        import trimesh  # type: ignore

        mesh = trimesh.load(str(web_ply))
        if hasattr(mesh, "vertices") and len(mesh.vertices) > 0:
            web_glb = output_dir / "web_pointcloud.glb"
            scene = trimesh.Scene(mesh)
            scene.export(str(web_glb), file_type="glb")
            result["web_pointcloud_glb"] = web_glb
            log("[web] web_pointcloud.glb cree (point cloud GLB, test web uniquement)")
    except ImportError:
        log("[web] trimesh non installe : web_pointcloud.glb ignore (PLY suffit pour test)")
    except Exception as exc:
        log("[web] web_pointcloud.glb non cree : %s" % exc)

    return result


def build_experimental_mesh(
    source_ply: Path,
    output_dir: Path,
    log: LogCallback = _noop_log,
) -> Dict[str, Optional[Path]]:
    """Reconstruction mesh experimentale via Open3D si disponible."""
    output_dir = Path(output_dir)
    source_ply = Path(source_ply)
    result: Dict[str, Optional[Path]] = {
        "debug_mesh_ply": None,
        "debug_mesh_obj": None,
        "open3d_available": False,
        "mesh_generated": False,
        "message": "",
    }

    try:
        import open3d as o3d  # type: ignore
    except ImportError:
        result["message"] = (
            "Open3D non installe : point cloud genere, mesh experimental desactive. "
            "Installez avec : py -3 -m pip install open3d"
        )
        log("[mesh] %s" % result["message"])
        return result

    result["open3d_available"] = True
    log("[mesh] Open3D detecte — reconstruction experimentale...")

    try:
        pcd = o3d.io.read_point_cloud(str(source_ply))
        if len(pcd.points) == 0:
            result["message"] = "Point cloud vide, mesh impossible."
            log("[mesh] %s" % result["message"])
            return result

        voxel = max(0.02, float(pcd.get_max_bound()[0] - pcd.get_min_bound()[0]) / 100.0)
        pcd = pcd.voxel_down_sample(voxel)
        log("[mesh] Downsample voxel=%.4f, points=%d" % (voxel, len(pcd.points)))

        pcd.estimate_normals(
            search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=voxel * 4, max_nn=30)
        )
        pcd.orient_normals_consistent_tangent_plane(10)

        mesh = None
        try:
            mesh, _ = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
                pcd, depth=8, width=0, scale=1.1, linear_fit=False
            )
            mesh = mesh.remove_degenerate_triangles()
            mesh = mesh.remove_duplicated_triangles()
            mesh = mesh.remove_duplicated_vertices()
            mesh = mesh.remove_non_manifold_edges()
            log("[mesh] Poisson OK, triangles=%d" % len(mesh.triangles))
        except Exception as poisson_exc:
            log("[mesh] Poisson echoue (%s), essai Ball Pivoting..." % poisson_exc)
            distances = pcd.compute_nearest_neighbor_distance()
            avg_dist = sum(distances) / len(distances) if distances else voxel
            radii = [avg_dist, avg_dist * 2, avg_dist * 4]
            mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_ball_pivoting(
                pcd, o3d.utility.DoubleVector(radii)
            )
            log("[mesh] Ball Pivoting OK, triangles=%d" % len(mesh.triangles))

        if mesh is None or len(mesh.triangles) == 0:
            result["message"] = "Reconstruction mesh vide."
            log("[mesh] %s" % result["message"])
            return result

        mesh.paint_uniform_color([0.55, 0.62, 0.72])
        mesh_ply = output_dir / "debug_mesh.ply"
        mesh_obj = output_dir / "debug_mesh.obj"
        o3d.io.write_triangle_mesh(str(mesh_ply), mesh)
        o3d.io.write_triangle_mesh(str(mesh_obj), mesh)
        result["debug_mesh_ply"] = mesh_ply
        result["debug_mesh_obj"] = mesh_obj
        result["mesh_generated"] = True
        result["message"] = (
            "Mesh experimental genere (peut avoir des trous ou artefacts, non texturé)."
        )
        log("[mesh] debug_mesh.ply et debug_mesh.obj crees")
        log("[mesh] %s" % result["message"])
    except Exception as exc:
        result["message"] = "Erreur mesh experimental : %s" % exc
        log("[mesh] %s" % result["message"])

    return result


SITE_READY_DIRNAME = "site-ready"
SITE_MODEL_GLB = "site_model.glb"
SITE_MODEL_OBJ = "site_model.obj"


def _site_ready_dir(output_dir: Path) -> Path:
    path = Path(output_dir) / SITE_READY_DIRNAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def _write_site_readme(site_dir: Path, upload_file: str, format_name: str, textured: bool) -> Path:
    readme = site_dir / "README_UPLOAD_SITE.txt"
    texture_note = (
        "Le modele contient des textures photo."
        if textured
        else (
            "ATTENTION : modele geometrique NON TEXTURE.\n"
            "Test technique uniquement — pas un rendu immobilier final.\n"
            "Le viewer affichera un mesh gris/beige sans photos des murs."
        )
    )
    readme.write_text(
        "\n".join(
            [
                "Fichier pret pour upload sur le site Visitevirtuel",
                "=" * 50,
                "",
                "Fichier a uploader dans l'admin :",
                "  %s" % upload_file,
                "",
                "Format : %s" % format_name.upper(),
                "Compatible site (code actuel) : oui",
                "",
                texture_note,
                "",
                "Etapes :",
                "  1. Admin > Nouvelle propriete (ou modifier)",
                "  2. Section modele 3D : choisir ce fichier",
                "  3. Pour GLB : un seul fichier suffit",
                "  4. Pour OBJ : uploader aussi .mtl et textures du dossier",
                "  5. Publier la visite",
                "",
                "Ne pas uploader :",
                "  - debug_pointcloud.ply (debug uniquement)",
                "  - preview.html",
                "  - web_pointcloud.ply",
                "",
                "Voir metadata.json pour le detail technique.",
            ]
        ),
        encoding="utf-8",
    )
    return readme


def build_site_ready_folder(
    output_dir: Path,
    site_glb: Optional[Path],
    site_obj: Optional[Path],
    point_count: int = 0,
    triangle_count: int = 0,
    log: LogCallback = _noop_log,
) -> Dict[str, Any]:
    """Assemble le dossier site-ready/ avec uniquement les fichiers utiles au site."""
    output_dir = Path(output_dir)
    site_dir = _site_ready_dir(output_dir)

    result: Dict[str, Any] = {
        "site_ready_dir": site_dir,
        "site_ready_model": None,
        "site_ready_format": None,
        "site_compatible": False,
        "textured": False,
        "metadata_path": None,
        "readme_path": None,
        "thumbnail_path": None,
        "message": "",
    }

    upload_name = ""
    format_name = ""

    if site_glb and site_glb.is_file():
        dest = site_dir / SITE_MODEL_GLB
        shutil.copy2(site_glb, dest)
        result["site_ready_model"] = dest
        result["site_ready_format"] = "glb"
        upload_name = SITE_MODEL_GLB
        format_name = "glb"
    elif site_obj and site_obj.is_file():
        dest = site_dir / SITE_MODEL_OBJ
        shutil.copy2(site_obj, dest)
        result["site_ready_model"] = dest
        result["site_ready_format"] = "obj"
        upload_name = SITE_MODEL_OBJ
        format_name = "obj"
    else:
        result["message"] = "Aucun mesh exporte : dossier site-ready vide."
        log("[site-ready] %s" % result["message"])
        return result

    result["site_compatible"] = format_name in ("glb", "obj", "gltf")
    result["textured"] = False

    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "format": format_name,
        "upload_file": upload_name,
        "site_compatible": result["site_compatible"],
        "textured": False,
        "recommended_site_format": "glb",
        "point_cloud_points": point_count,
        "mesh_triangles": triangle_count,
        "warnings": [
            "Modele geometrique non texturé — test technique, pas rendu immobilier final.",
        ],
    }
    meta_path = site_dir / "metadata.json"
    meta_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    result["metadata_path"] = meta_path

    readme_path = _write_site_readme(site_dir, upload_name, format_name, textured=False)
    result["readme_path"] = readme_path
    result["message"] = "Dossier site-ready pret : %s" % upload_name
    log("[site-ready] %s" % site_dir)
    log("[site-ready] Fichier upload : %s" % (site_dir / upload_name).name)
    log("[site-ready] Compatible site : oui | Texturé : non")

    return result


def export_site_model(
    mesh_obj_path: Path,
    output_dir: Path,
    point_count: int = 0,
    log: LogCallback = _noop_log,
) -> Dict[str, Optional[Path]]:
    """Export site_model.glb (ou .obj) depuis le mesh experimental vers site-ready/."""
    output_dir = Path(output_dir)
    mesh_obj_path = Path(mesh_obj_path)
    site_dir = _site_ready_dir(output_dir)
    result: Dict[str, Optional[Path]] = {
        "site_model_glb": None,
        "site_model_obj": None,
        "site_ready_dir": site_dir,
        "site_ready_model": None,
        "site_export_ok": False,
        "site_compatible": False,
        "textured": False,
        "message": "",
    }

    if not mesh_obj_path.is_file():
        result["message"] = "Pas de mesh : export site impossible (Open3D requis)."
        log("[site] %s" % result["message"])
        return result

    triangle_count = 0
    try:
        with mesh_obj_path.open("r", encoding="utf-8", errors="replace") as handle:
            triangle_count = sum(1 for line in handle if line.startswith("f "))
    except OSError:
        pass

    temp_glb: Optional[Path] = None
    temp_obj = output_dir / ".tmp_site_export.obj"
    shutil.copy2(mesh_obj_path, temp_obj)

    try:
        import trimesh  # type: ignore

        loaded = trimesh.load(str(mesh_obj_path), force="mesh")
        temp_glb = output_dir / ".tmp_site_export.glb"
        if isinstance(loaded, trimesh.Scene):
            loaded.export(str(temp_glb), file_type="glb")
        else:
            loaded.export(str(temp_glb), file_type="glb")
        result["site_export_ok"] = True
        result["site_compatible"] = True
        result["message"] = (
            "Export site-ready genere (GLB, non texturé, test technique)."
        )
        log("[site] GLB genere — assemblage site-ready/")
        log("[site] %s" % result["message"])
    except ImportError:
        result["site_compatible"] = True
        result["message"] = (
            "trimesh non installe : seul OBJ possible dans site-ready/. "
            "Installez : py -3 -m pip install trimesh (puis relancez pour obtenir le .glb)."
        )
        log("[site] %s" % result["message"])
    except Exception as exc:
        result["site_compatible"] = True
        result["message"] = "GLB non cree : %s (fallback OBJ dans site-ready/)" % exc
        log("[site] %s" % result["message"])

    ready = build_site_ready_folder(
        output_dir,
        temp_glb,
        temp_obj if not temp_glb else None,
        point_count=point_count,
        triangle_count=triangle_count,
        log=log,
    )

    for temp in (temp_glb, temp_obj):
        if temp and temp.is_file():
            try:
                temp.unlink()
            except OSError:
                pass

    if ready.get("site_ready_model"):
        model_path = Path(ready["site_ready_model"])
        result["site_ready_model"] = model_path
        if model_path.suffix.lower() == ".glb":
            result["site_model_glb"] = model_path
        else:
            result["site_model_obj"] = model_path
    result["site_ready_dir"] = ready.get("site_ready_dir")
    result["site_ready_model"] = ready.get("site_ready_model")
    result["metadata_path"] = ready.get("metadata_path")
    result["readme_path"] = ready.get("readme_path")

    return result


def run_post_pointcloud_pipeline(
    output_dir: Path,
    ply_path: Path,
    point_count: int,
    generate_mesh: bool = False,
    generate_site_glb: bool = False,
    include_debug_preview: bool = True,
    log: LogCallback = _noop_log,
) -> Dict[str, object]:
    """Etapes apres generation du PLY debug : preview, web, mesh optionnel, site optionnel."""
    output_dir = Path(output_dir)
    summary: Dict[str, object] = {
        "preview_html": None,
        "open_preview_bat": None,
        "web_pointcloud_ply": None,
        "web_pointcloud_glb": None,
        "debug_mesh_ply": None,
        "debug_mesh_obj": None,
        "site_model_glb": None,
        "site_model_obj": None,
        "site_ready_dir": None,
        "site_ready_model": None,
        "site_compatible": False,
        "textured": False,
        "status": {
            "point_cloud": "ok",
            "preview": "pending",
            "web_export": "pending",
            "mesh": "skipped",
            "site_export": "skipped",
        },
        "messages": [],
    }

    if include_debug_preview:
        log("")
        log("Etape 3 : preview debug et export web...")
        preview_html, preview_bat = generate_preview_html(output_dir, point_count, log=log)
        summary["preview_html"] = str(preview_html)
        summary["open_preview_bat"] = str(preview_bat)
        summary["status"]["preview"] = "ok"

        web = export_web_pointcloud(ply_path, output_dir, log=log)
        summary["web_pointcloud_ply"] = (
            str(web["web_pointcloud_ply"]) if web["web_pointcloud_ply"] else None
        )
        summary["web_pointcloud_glb"] = (
            str(web["web_pointcloud_glb"]) if web["web_pointcloud_glb"] else None
        )
        summary["status"]["web_export"] = "ok" if web["web_pointcloud_ply"] else "failed"
    else:
        log("")
        log("Etape 3 : preview debug ignoree (option desactivee).")
        summary["status"]["preview"] = "skipped"
        summary["status"]["web_export"] = "skipped"

    if generate_mesh:
        log("")
        log("Etape 4 : mesh experimental (Open3D)...")
        mesh_result = build_experimental_mesh(ply_path, output_dir, log=log)
        summary["debug_mesh_ply"] = (
            str(mesh_result["debug_mesh_ply"]) if mesh_result["debug_mesh_ply"] else None
        )
        summary["debug_mesh_obj"] = (
            str(mesh_result["debug_mesh_obj"]) if mesh_result["debug_mesh_obj"] else None
        )
        if mesh_result["mesh_generated"]:
            summary["status"]["mesh"] = "ok"
            summary["messages"].append(mesh_result.get("message", ""))
        else:
            summary["status"]["mesh"] = "unavailable"
            summary["messages"].append(mesh_result.get("message", "Mesh non genere."))

        if generate_site_glb and mesh_result.get("debug_mesh_obj"):
            log("")
            log("Etape 5 : export site (GLB experimental)...")
            site = export_site_model(
                mesh_result["debug_mesh_obj"],
                output_dir,
                point_count=point_count,
                log=log,
            )
            summary["site_model_glb"] = (
                str(site["site_model_glb"]) if site["site_model_glb"] else None
            )
            summary["site_model_obj"] = (
                str(site["site_model_obj"]) if site["site_model_obj"] else None
            )
            summary["site_ready_dir"] = (
                str(site["site_ready_dir"]) if site.get("site_ready_dir") else None
            )
            summary["site_ready_model"] = (
                str(site["site_ready_model"]) if site.get("site_ready_model") else None
            )
            summary["site_compatible"] = bool(site.get("site_compatible"))
            summary["textured"] = bool(site.get("textured"))
            if site["site_export_ok"]:
                summary["status"]["site_export"] = "ok"
            elif site.get("site_ready_model"):
                summary["status"]["site_export"] = "partial"
            else:
                summary["status"]["site_export"] = "failed"
            summary["messages"].append(site.get("message", ""))
        elif generate_site_glb:
            summary["status"]["site_export"] = "skipped"
            summary["messages"].append(
                "Export site GLB demande mais mesh absent — activez le mesh experimental."
            )
            log("[site] Export site ignore : mesh non disponible.")

    return summary
