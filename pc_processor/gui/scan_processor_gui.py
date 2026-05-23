#!/usr/bin/env python3
"""Interface Windows locale pour pc_processor (Tkinter)."""
from __future__ import annotations

import json
import os
import sys
import threading
import tkinter as tk
from datetime import datetime, timezone
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk


GUI_DIR = Path(__file__).resolve().parent
PC_PROCESSOR_DIR = GUI_DIR.parent
SRC_DIR = PC_PROCESSOR_DIR / "src"
if str(GUI_DIR) not in sys.path:
    sys.path.insert(0, str(GUI_DIR))
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from processing_runner import ProcessingResult, default_output_dir, run_processing  # noqa: E402
from meshroom_monitor import MeshroomRunMonitor, format_elapsed  # noqa: E402
from meshroom_pipeline import (  # noqa: E402
    MeshroomResult,
    finalize_from_texturing_cache,
    find_meshroom_batch,
    load_meshroom_config,
    run_meshroom_pipeline,
    save_meshroom_config,
)
from run_isolation import allocate_run_for_input, is_isolated_run_dir, read_run_manifest  # noqa: E402


APP_TITLE = "Site Ready Scan Processor"
WINDOW_SIZE = "960x920"

PROCESSING_MODES = (
    ("fast", "Rapide test"),
    ("normal", "Qualite normale"),
    ("high", "Haute qualite"),
)

# Dossiers proposes en premier dans le selecteur de ZIP
DEFAULT_ZIP_SEARCH_DIRS = (
    Path(r"C:\Users\ironi\Outils\Buisnesss\test"),
    Path.home() / "Downloads",
    PC_PROCESSOR_DIR / "test_datasets",
)


class ScanProcessorApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title(APP_TITLE)
        self.root.minsize(860, 680)
        self.root.geometry(WINDOW_SIZE)

        self.input_path: Path | None = None
        self.output_path: Path | None = None
        self.meshroom_dir: Path | None = None
        self.last_result: ProcessingResult | None = None
        self.last_meshroom: MeshroomResult | None = None
        self.worker: threading.Thread | None = None
        self.meshroom_cancel_event: threading.Event | None = None
        self._status_poll_job: str | None = None
        self._current_run_dir: Path | None = None
        self._current_run_logs_dir: Path | None = None
        self._current_run_id: str | None = None

        config = load_meshroom_config()
        if config.get("meshroom_dir"):
            self.meshroom_dir = Path(config["meshroom_dir"])

        self._build_ui()
        self._refresh_meshroom_status()

    def _build_ui(self) -> None:
        main = ttk.Frame(self.root, padding=12)
        main.pack(fill=tk.BOTH, expand=True)

        ttk.Label(main, text=APP_TITLE, font=("Segoe UI", 16, "bold")).pack(anchor=tk.W, pady=(0, 8))

        easy_frame = ttk.LabelFrame(main, text="Lancement facile (recommande)", padding=12)
        easy_frame.pack(fill=tk.X, pady=(0, 10))

        self.easy_hint_var = tk.StringVar(
            value="Un seul bouton : choisir votre ZIP, puis creer site_model.glb pour le site."
        )
        ttk.Label(easy_frame, textvariable=self.easy_hint_var, wraplength=860).pack(anchor=tk.W, pady=(0, 8))

        self.easy_start_button = tk.Button(
            easy_frame,
            text="  TRAITER MON ZIP  →  modele 3D pour le site  ",
            font=("Segoe UI", 13, "bold"),
            bg="#1b6b3a",
            fg="white",
            activebackground="#145a30",
            activeforeground="white",
            relief=tk.RAISED,
            bd=3,
            padx=12,
            pady=10,
            cursor="hand2",
            command=self.easy_start_meshroom,
        )
        self.easy_start_button.pack(anchor=tk.W, pady=(0, 8))

        ttk.Label(
            easy_frame,
            text=(
                "NE PAS cliquer sur « Valider le dataset » pour le modele final — "
                "ce bouton ne fait que verifier le ZIP (pas de Meshroom, pas de GLB)."
            ),
            foreground="#a33",
            wraplength=860,
            font=("Segoe UI", 9, "bold"),
        ).pack(anchor=tk.W)

        input_frame = ttk.LabelFrame(main, text="ZIP selectionne (optionnel si lancement facile)", padding=10)
        input_frame.pack(fill=tk.X, pady=(0, 8))
        self.input_var = tk.StringVar(value="Aucun fichier selectionne")
        ttk.Label(input_frame, textvariable=self.input_var, wraplength=820).pack(anchor=tk.W, pady=(0, 8))
        ttk.Button(input_frame, text="Choisir un ZIP ou dossier dataset", command=self.choose_input).pack(
            anchor=tk.W
        )

        output_frame = ttk.LabelFrame(main, text="Dossier de sortie", padding=10)
        output_frame.pack(fill=tk.X, pady=(0, 8))
        self.output_var = tk.StringVar(value=str(default_output_dir()))
        ttk.Label(output_frame, textvariable=self.output_var, wraplength=820).pack(anchor=tk.W, pady=(0, 8))
        ttk.Button(output_frame, text="Choisir dossier de sortie", command=self.choose_output).pack(anchor=tk.W)

        meshroom_frame = ttk.LabelFrame(main, text="Traitement PC texturé (Meshroom)", padding=10)
        meshroom_frame.pack(fill=tk.X, pady=(0, 8))

        self.meshroom_status_var = tk.StringVar(value="Meshroom : non configure")
        ttk.Label(meshroom_frame, textvariable=self.meshroom_status_var, wraplength=820).pack(anchor=tk.W)

        mesh_btns = ttk.Frame(meshroom_frame)
        mesh_btns.pack(fill=tk.X, pady=(8, 0))
        ttk.Button(mesh_btns, text="Choisir dossier Meshroom", command=self.choose_meshroom_dir).pack(
            side=tk.LEFT
        )
        self.meshroom_run_button = ttk.Button(
            mesh_btns,
            text="Lancer traitement texturé Meshroom",
            command=self.start_meshroom,
        )
        self.meshroom_run_button.pack(side=tk.LEFT, padx=(8, 0))
        self.site_ready_button = ttk.Button(
            mesh_btns,
            text="Ouvrir dossier site-ready",
            command=self.open_site_ready,
            state=tk.DISABLED,
        )
        self.site_ready_button.pack(side=tk.LEFT, padx=(8, 0))
        self.preview_button = ttk.Button(
            mesh_btns,
            text="Ouvrir preview (run courant)",
            command=self.open_run_preview,
            state=tk.DISABLED,
        )
        self.preview_button.pack(side=tk.LEFT, padx=(8, 0))
        self.meshroom_cancel_button = ttk.Button(
            mesh_btns,
            text="Annuler le traitement",
            command=self.cancel_meshroom,
            state=tk.DISABLED,
        )
        self.meshroom_cancel_button.pack(side=tk.LEFT, padx=(8, 0))

        mode_row = ttk.Frame(meshroom_frame)
        mode_row.pack(fill=tk.X, pady=(8, 0))
        ttk.Label(mode_row, text="Mode traitement :").pack(side=tk.LEFT)
        self.processing_mode_var = tk.StringVar(value="normal")
        self.processing_mode_combo = ttk.Combobox(
            mode_row,
            textvariable=self.processing_mode_var,
            values=[label for _key, label in PROCESSING_MODES],
            state="readonly",
            width=22,
        )
        self.processing_mode_combo.current(1)
        self.processing_mode_combo.pack(side=tk.LEFT, padx=(8, 0))
        self.force_recompute_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            mode_row,
            text="Nouveau calcul 3D pour ce ZIP (recommande)",
            variable=self.force_recompute_var,
        ).pack(side=tk.LEFT, padx=(12, 0))
        ttk.Label(
            meshroom_frame,
            text=(
                "Si decoche : Meshroom peut reutiliser un ancien modele (memes photos). "
                "Mode rapide = texture 2048 ; normal = defaut ; haute = 8192."
            ),
            foreground="#555",
            wraplength=820,
        ).pack(anchor=tk.W, pady=(4, 0))

        progress_frame = ttk.LabelFrame(main, text="Suivi Meshroom (temps reel)", padding=10)
        progress_frame.pack(fill=tk.X, pady=(0, 8))
        self.mesh_elapsed_var = tk.StringVar(value="Temps ecoule : —")
        self.mesh_step_var = tk.StringVar(value="Etape : —")
        self.mesh_activity_var = tk.StringVar(value="Activite : —")
        self.mesh_run_dir_var = tk.StringVar(value="Dossier run : —")
        self.mesh_images_var = tk.StringVar(value="Images Meshroom : —")
        self.mesh_last_log_var = tk.StringVar(value="Dernier message : —")
        self.mesh_final_note_var = tk.StringVar(
            value=(
                "Le fichier final (site-ready/site_model.glb) sera cree seulement "
                "apres Publish + conversion EXR + GLB + validation texture."
            )
        )
        self.mesh_texturing_ready_var = tk.StringVar(value="Texturing output pret : —")
        self.mesh_publish_time_var = tk.StringVar(value="Publish : —")
        self.mesh_errors_var = tk.StringVar(value="")
        for var in (
            self.mesh_elapsed_var,
            self.mesh_step_var,
            self.mesh_activity_var,
            self.mesh_run_dir_var,
            self.mesh_images_var,
            self.mesh_texturing_ready_var,
            self.mesh_publish_time_var,
            self.mesh_last_log_var,
            self.mesh_final_note_var,
        ):
            ttk.Label(progress_frame, textvariable=var, wraplength=880).pack(anchor=tk.W)
        self.mesh_errors_label = ttk.Label(
            progress_frame, textvariable=self.mesh_errors_var, wraplength=880, foreground="#a00"
        )
        self.mesh_errors_label.pack(anchor=tk.W)
        finalize_row = ttk.Frame(progress_frame)
        finalize_row.pack(fill=tk.X, pady=(6, 0))
        self.finalize_texturing_button = ttk.Button(
            finalize_row,
            text="Finaliser depuis Texturing",
            command=self.finalize_from_texturing_gui,
            state=tk.DISABLED,
        )
        self.finalize_texturing_button.pack(side=tk.LEFT)
        ttk.Label(
            finalize_row,
            text="(si Publish bloque mais Texturing OK)",
            foreground="#555",
        ).pack(side=tk.LEFT, padx=(8, 0))

        ttk.Label(
            meshroom_frame,
            text=(
                "Utilise les JPG du dataset (pas les poses ARCore). GPU recommande. "
                "Voir pc_processor/meshroom/README.md"
            ),
            foreground="#555",
            wraplength=820,
        ).pack(anchor=tk.W, pady=(8, 0))

        validate_frame = ttk.LabelFrame(
            main, text="Validation dataset seule (optionnel — pas le modele 3D)", padding=10
        )
        validate_frame.pack(fill=tk.X, pady=(0, 8))
        ttk.Button(validate_frame, text="Valider le dataset", command=self.start_validation).pack(side=tk.LEFT)
        self.open_button = ttk.Button(
            validate_frame,
            text="Ouvrir dossier resultat",
            command=self.open_output_folder,
            state=tk.DISABLED,
        )
        self.open_button.pack(side=tk.LEFT, padx=(8, 0))

        self.status_var = tk.StringVar(value="Pret.")
        ttk.Label(validate_frame, textvariable=self.status_var).pack(side=tk.LEFT, padx=(16, 0))

        self.progress = ttk.Progressbar(main, mode="indeterminate")
        self.progress.pack(fill=tk.X, pady=(0, 8))

        status_frame = ttk.LabelFrame(main, text="Statuts export", padding=10)
        status_frame.pack(fill=tk.X, pady=(0, 8))
        self.status_pointcloud_var = tk.StringVar(
            value="Point cloud debug : — (pas pour le site)"
        )
        self.status_gray_mesh_var = tk.StringVar(
            value="Mesh gris : — (test technique seulement, pas pour le site)"
        )
        self.status_textured_var = tk.StringVar(
            value="Modele texturé : — (pas encore genere)"
        )
        ttk.Label(status_frame, textvariable=self.status_pointcloud_var, wraplength=820).pack(anchor=tk.W)
        ttk.Label(status_frame, textvariable=self.status_gray_mesh_var, wraplength=820).pack(anchor=tk.W)
        ttk.Label(status_frame, textvariable=self.status_textured_var, wraplength=820).pack(anchor=tk.W)

        self.outputs_var = tk.StringVar(value="—")
        ttk.Label(main, textvariable=self.outputs_var, wraplength=820, justify=tk.LEFT).pack(anchor=tk.W, pady=(0, 8))

        log_frame = ttk.LabelFrame(main, text="Journal", padding=10)
        log_frame.pack(fill=tk.BOTH, expand=True)
        self.log_text = scrolledtext.ScrolledText(log_frame, height=14, wrap=tk.WORD, font=("Consolas", 10))
        self.log_text.pack(fill=tk.BOTH, expand=True)
        self.log_text.configure(state=tk.DISABLED)

    def _refresh_meshroom_status(self) -> None:
        batch = find_meshroom_batch(self.meshroom_dir)
        if batch:
            self.meshroom_status_var.set("Meshroom detecte : %s" % batch)
        elif self.meshroom_dir:
            self.meshroom_status_var.set(
                "Dossier configure mais meshroom_batch.exe introuvable :\n%s" % self.meshroom_dir
            )
        else:
            self.meshroom_status_var.set(
                "Meshroom non detecte. Installez Meshroom puis selectionnez son dossier."
            )

    def append_log(self, message: str) -> None:
        def write() -> None:
            self.log_text.configure(state=tk.NORMAL)
            self.log_text.insert(tk.END, message + "\n")
            self.log_text.see(tk.END)
            self.log_text.configure(state=tk.DISABLED)

        self.root.after(0, write)

    def _zip_picker_initial_dir(self) -> str:
        for folder in DEFAULT_ZIP_SEARCH_DIRS:
            if folder.is_dir():
                return str(folder)
        return str(Path.home() / "Downloads")

    def choose_input(self) -> None:
        selected = filedialog.askopenfilename(
            title="Choisir un ZIP dataset",
            initialdir=self._zip_picker_initial_dir(),
            filetypes=[("ZIP scan", "*.zip"), ("Tous", "*.*")],
        )
        if selected:
            self.input_path = Path(selected)
            self.input_var.set(str(self.input_path))
            return
        selected_dir = filedialog.askdirectory(title="Ou dossier .dataset")
        if selected_dir:
            self.input_path = Path(selected_dir)
            self.input_var.set(str(self.input_path))

    def choose_output(self) -> None:
        selected = filedialog.askdirectory(
            title="Dossier de sortie",
            initialdir=str(PC_PROCESSOR_DIR / "output_gui"),
        )
        if selected:
            self.output_path = Path(selected)
            self.output_var.set(str(self.output_path))

    def choose_meshroom_dir(self) -> None:
        selected = filedialog.askdirectory(title="Dossier Meshroom (meshroom_batch.exe)")
        if not selected:
            return
        self.meshroom_dir = Path(selected)
        save_meshroom_config(self.meshroom_dir)
        self._refresh_meshroom_status()

        batch = find_meshroom_batch(self.meshroom_dir)
        if batch:
            messagebox.showinfo(APP_TITLE, "Meshroom OK :\n%s" % batch)
        else:
            messagebox.showwarning(
                APP_TITLE,
                "meshroom_batch.exe introuvable dans ce dossier.\n"
                "Selectionnez le dossier d'installation Meshroom complet.",
            )

    def set_busy(self, busy: bool, meshroom: bool = False) -> None:
        state = tk.DISABLED if busy else tk.NORMAL
        if meshroom:
            self.meshroom_run_button.configure(state=state)
            self.easy_start_button.configure(state=state)
            self.meshroom_cancel_button.configure(state=tk.NORMAL if busy else tk.DISABLED)
            self.processing_mode_combo.configure(state="disabled" if busy else "readonly")
        else:
            self.meshroom_run_button.configure(state=state)
            self.easy_start_button.configure(state=state)
        self.open_button.configure(state=tk.DISABLED if busy else tk.NORMAL)
        if busy:
            self.site_ready_button.configure(state=tk.DISABLED)
            self.preview_button.configure(state=tk.DISABLED)
            self.progress.start(12)
        else:
            self.progress.stop()
            self.meshroom_cancel_button.configure(state=tk.DISABLED)

    def _processing_mode_key(self) -> str:
        label = self.processing_mode_var.get()
        for key, mode_label in PROCESSING_MODES:
            if mode_label == label:
                return key
        return "normal"

    def _reset_meshroom_progress_ui(self) -> None:
        self.mesh_elapsed_var.set("Temps ecoule : —")
        self.mesh_step_var.set("Etape : —")
        self.mesh_activity_var.set("Activite : —")
        self.mesh_run_dir_var.set("Dossier run : —")
        self.mesh_images_var.set("Images Meshroom : —")
        self.mesh_texturing_ready_var.set("Texturing output pret : —")
        self.mesh_publish_time_var.set("Publish : —")
        self.mesh_last_log_var.set("Dernier message : —")
        self.mesh_errors_var.set("")
        self.finalize_texturing_button.configure(state=tk.DISABLED)

    def _stop_status_poll(self) -> None:
        if self._status_poll_job:
            try:
                self.root.after_cancel(self._status_poll_job)
            except tk.TclError:
                pass
            self._status_poll_job = None

    def _poll_run_status(self) -> None:
        if not self._current_run_logs_dir or not self._current_run_dir:
            return
        status_path = self._current_run_logs_dir / "run_status.json"
        if not status_path.is_file():
            self._status_poll_job = self.root.after(800, self._poll_run_status)
            return
        status = MeshroomRunMonitor.read_status(self._current_run_logs_dir)
        if status:
            if status.get("run_id") and self._current_run_id:
                if status.get("run_id") != self._current_run_id:
                    return
            self._apply_run_status(status)
        self._status_poll_job = self.root.after(1500, self._poll_run_status)

    def _apply_run_status(self, status: dict) -> None:
        elapsed = status.get("elapsed_seconds", 0)
        run_state = status.get("status", "running")
        final_audit = status.get("final_audit_allowed", False)
        self.mesh_elapsed_var.set("Temps ecoule : %s" % format_elapsed(elapsed))
        self.mesh_step_var.set("Etape : %s" % status.get("current_step", "—"))
        activity = status.get("activity_message", "—")
        if run_state in ("running", "meshroom_finishing") or not final_audit:
            if status.get("meshroom_process_alive", True):
                activity = status.get("activity_message") or (
                    "Meshroom en cours — le fichier final sera cree apres Publish."
                )
        self.mesh_activity_var.set("Activite : %s" % activity)
        tex_ready = status.get("texturing_output_ready", False)
        self.mesh_texturing_ready_var.set(
            "Texturing output pret : %s" % ("oui" if tex_ready else "non")
        )
        current_step = status.get("current_step", "")
        publish_elapsed = float(status.get("publish_elapsed_seconds") or 0)
        if current_step == "Publish":
            pub_txt = "Publish en cours : %s" % format_elapsed(publish_elapsed)
            if status.get("publish_slow_warning"):
                pub_txt += " (lent — finalisation Texturing possible)"
            self.mesh_publish_time_var.set(pub_txt)
        elif status.get("publish_success"):
            self.mesh_publish_time_var.set("Publish : termine")
        else:
            self.mesh_publish_time_var.set("Publish : —")

        can_finalize = bool(
            tex_ready
            and not status.get("publish_success")
            and run_state in ("running", "meshroom_finishing", "stalled")
        )
        self.finalize_texturing_button.configure(
            state=tk.NORMAL if can_finalize else tk.DISABLED
        )
        self.mesh_run_dir_var.set("Dossier run : %s" % status.get("output_folder", "—"))
        fb = status.get("fallback_root") or ""
        if fb:
            self.mesh_run_dir_var.set(
                "Dossier run : %s (fallback : %s)" % (status.get("output_folder", ""), fb)
            )
        self.mesh_images_var.set("Images Meshroom : %s" % status.get("image_count", "—"))
        last = status.get("last_log_line") or ""
        if last:
            self.mesh_last_log_var.set("Dernier message : %s" % (last[:200] + ("..." if len(last) > 200 else "")))
        errors = status.get("detected_errors") or []
        if errors:
            self.mesh_errors_var.set("Erreurs detectees : " + " | ".join(errors[:3]))
        elif status.get("stall_warning_15min"):
            self.mesh_errors_var.set(
                "Le traitement semble bloque. Vous pouvez annuler ou continuer a attendre."
            )
        elif status.get("stall_warning_5min"):
            self.mesh_errors_var.set(
                "Attention : aucune activite Meshroom detectee depuis 5 minutes."
            )
        else:
            self.mesh_errors_var.set("")

    def cancel_meshroom(self) -> None:
        if self.meshroom_cancel_event:
            self.meshroom_cancel_event.set()
            self.append_log("[GUI] Annulation demandee...")
            self.mesh_activity_var.set("Activite : annulation en cours...")

    def finalize_from_texturing_gui(self) -> None:
        if self.worker and self.worker.is_alive():
            messagebox.showinfo(
                APP_TITLE,
                "Un traitement Meshroom est encore en cours.\n"
                "Vous pouvez finaliser depuis Texturing pendant Publish.",
            )
        if not self._current_run_dir or not self._current_run_dir.is_dir():
            messagebox.showerror(APP_TITLE, "Aucun dossier run actif.")
            return

        run_dir = self._current_run_dir
        work_dir = run_dir / "work"
        status = (
            MeshroomRunMonitor.read_status(run_dir / "logs") if (run_dir / "logs").is_dir() else {}
        ) or {}
        if not status.get("texturing_output_ready"):
            messagebox.showwarning(
                APP_TITLE,
                "La sortie Texturing n'est pas encore prete.\n"
                "Attendez texturedMesh.obj + MTL + texture (map_Kd).",
            )
            return

        if not messagebox.askyesno(
            APP_TITLE,
            "Finaliser site-ready depuis le cache Texturing ?\n\n"
            "Meshroom peut continuer Publish en arriere-plan.\n"
            "Aucun faux GLB gris ne sera cree sans texture valide.",
        ):
            return

        self.finalize_texturing_button.configure(state=tk.DISABLED)
        self.mesh_activity_var.set("Activite : finalisation depuis Texturing...")
        self.append_log("[GUI] Finalisation depuis Texturing pour %s" % run_dir.name)

        fallback_raw = status.get("fallback_root") or ""
        fallback_root = Path(fallback_raw) if fallback_raw else None
        manifest = read_run_manifest(run_dir)
        image_count = int(status.get("image_count") or 0)

        def worker() -> None:
            published = finalize_from_texturing_cache(
                run_dir,
                work_dir,
                image_count=image_count,
                log=self.append_log,
                manifest=manifest,
                fallback_root=fallback_root,
            )
            self.root.after(0, lambda: self._on_finalize_texturing_done(published))

        threading.Thread(target=worker, daemon=True).start()

    def _on_finalize_texturing_done(self, published: dict) -> None:
        if published.get("success"):
            glb = published.get("site_ready_model")
            self.mesh_step_var.set("Etape : termine (Texturing)")
            self.mesh_activity_var.set("Activite : site-ready genere depuis Texturing")
            self.mesh_texturing_ready_var.set("Texturing output pret : oui")
            self.status_textured_var.set(
                "Modele texturé : PRET pour le site — %s" % Path(glb).name if glb else "OK"
            )
            self.site_ready_button.configure(state=tk.NORMAL)
            self.preview_button.configure(state=tk.NORMAL)
            self.outputs_var.set(
                "Modele cree depuis cache Texturing (Publish non requis).\nChemin : %s" % glb
            )
            messagebox.showinfo(
                APP_TITLE,
                "Site-ready genere depuis Texturing.\n\n%s" % glb,
            )
        else:
            self.finalize_texturing_button.configure(state=tk.NORMAL)
            detail = published.get("message") or "Echec"
            errors = published.get("errors") or []
            if errors:
                detail += "\n\n" + "\n".join("- " + e for e in errors)
            self.mesh_errors_var.set("Finalisation Texturing : " + (errors[0] if errors else detail))
            messagebox.showerror(APP_TITLE, detail)

    def _output_dir(self) -> Path:
        text = self.output_var.get().strip()
        return Path(text) if text else default_output_dir()

    def _begin_meshroom_run(self) -> Optional[Path]:
        """Alloue un run vierge lie au ZIP et reinitialise l'UI de suivi."""
        if not self.input_path or not self.input_path.exists():
            messagebox.showerror(APP_TITLE, "Choisissez un ZIP ou dataset.")
            return None

        self._stop_status_poll()
        base_out = PC_PROCESSOR_DIR / "output_gui"
        base_out.mkdir(parents=True, exist_ok=True)

        try:
            run_dir, run_id, _manifest = allocate_run_for_input(base_out, self.input_path)
        except OSError as exc:
            messagebox.showerror(APP_TITLE, "Impossible de creer le dossier run :\n%s" % exc)
            return None

        self._current_run_dir = run_dir
        self._current_run_logs_dir = run_dir / "logs"
        self._current_run_id = run_id
        self.output_path = run_dir
        self.output_var.set(str(run_dir))
        self.last_meshroom = None

        self._reset_meshroom_progress_ui()
        self.mesh_elapsed_var.set("Temps ecoule : 0s")
        self.mesh_run_dir_var.set("Dossier run : %s" % run_dir)
        self.mesh_activity_var.set("Activite : preparation du run...")
        self.mesh_errors_var.set("")

        self.log_text.configure(state=tk.NORMAL)
        self.log_text.delete("1.0", tk.END)
        self.log_text.configure(state=tk.DISABLED)

        initial_status = {
            "started_at": datetime.now(timezone.utc).isoformat(),
            "run_id": run_id,
            "elapsed_seconds": 0,
            "status": "running",
            "activity_message": (
                "Meshroom en cours — le fichier final sera cree apres Publish."
            ),
            "meshroom_process_alive": True,
            "final_audit_allowed": False,
            "output_folder": str(run_dir),
        }
        try:
            (run_dir / "logs" / "run_status.json").write_text(
                json.dumps(initial_status, indent=2), encoding="utf-8"
            )
        except OSError:
            pass

        self._status_poll_job = self.root.after(500, self._poll_run_status)
        return run_dir

    def start_validation(self) -> None:
        if self.worker and self.worker.is_alive():
            return
        if not self.input_path or not self.input_path.exists():
            messagebox.showerror(APP_TITLE, "Choisissez un ZIP ou dataset.")
            return

        self.set_busy(True)
        out = self._output_dir()
        self.output_path = out

        def worker() -> None:
            result = run_processing(
                self.input_path,
                out,
                log=self.append_log,
                include_debug_preview=False,
                enable_gray_site_export=False,
            )
            self.root.after(0, lambda: self.on_validation_done(result))

        self.worker = threading.Thread(target=worker, daemon=True)
        self.worker.start()

    def _update_export_statuses(self, validation: ProcessingResult | None = None, meshroom: MeshroomResult | None = None) -> None:
        if validation and validation.ply_path and validation.ply_path.is_file():
            self.status_pointcloud_var.set(
                "Point cloud debug : genere (%s) — pas pour le site"
                % validation.ply_path.name
            )
        elif validation:
            self.status_pointcloud_var.set("Point cloud debug : non genere")

        if validation and validation.debug_mesh_obj_path and validation.debug_mesh_obj_path.is_file():
            self.status_gray_mesh_var.set(
                "Mesh gris : genere (%s) — test technique seulement, pas pour le site"
                % validation.debug_mesh_obj_path.name
            )
        else:
            self.status_gray_mesh_var.set(
                "Mesh gris : non exporte (desactive par defaut — pas pour le site)"
            )

        visually_ok = meshroom and getattr(
            meshroom, "visually_validated", meshroom.site_ready_validated
        )
        if visually_ok and meshroom.site_ready_model:
            self.status_textured_var.set(
                "Modele texturé : PRET pour le site — %s" % meshroom.site_ready_model.name
            )
        elif meshroom and meshroom.exit_code != 0:
            self.status_textured_var.set(
                "Modele texturé : ECHEC — %s"
                % (meshroom.error_message or "voir journal")
            )
        else:
            self.status_textured_var.set("Modele texturé : pas encore genere / non valide")

    def on_validation_done(self, result: ProcessingResult) -> None:
        self.last_result = result
        self.set_busy(False)
        self.open_button.configure(state=tk.NORMAL)
        self.output_var.set(str(result.output_dir))
        self._update_export_statuses(validation=result)
        if result.report and result.report.get("dataset_valid"):
            self.status_var.set("Dataset valide.")
            self.outputs_var.set("Rapports : dataset_report.json / .txt")
            messagebox.showinfo(APP_TITLE, "Dataset valide.\nLancez Meshroom pour le modele texturé.")
        else:
            self.status_var.set("Dataset invalide.")
            messagebox.showerror(APP_TITLE, "\n".join(result.messages) or "Dataset invalide.")

    def easy_start_meshroom(self) -> None:
        """Un clic : ZIP (si besoin) + Meshroom (si besoin) + lancement traitement."""
        if self.worker and self.worker.is_alive():
            messagebox.showinfo(APP_TITLE, "Un traitement est deja en cours.\nSuivez la progression ci-dessous.")
            return

        if not self.input_path or not self.input_path.exists():
            selected = filedialog.askopenfilename(
                title="Choisissez votre ZIP de scan Android",
                initialdir=self._zip_picker_initial_dir(),
                filetypes=[("ZIP scan", "*.zip"), ("Tous", "*.*")],
            )
            if not selected:
                messagebox.showinfo(
                    APP_TITLE,
                    "Aucun fichier choisi.\n\n"
                    "Exemple : celiuo la exemple.zip dans le dossier test.",
                )
                return
            self.input_path = Path(selected)
            self.input_var.set(str(self.input_path))

        batch = find_meshroom_batch(self.meshroom_dir)
        if not batch:
            ok = messagebox.askokcancel(
                APP_TITLE,
                "Meshroom n'est pas encore configure.\n\n"
                "Cliquez OK puis selectionnez le dossier d'installation Meshroom\n"
                "(celui qui contient meshroom_batch.exe).\n\n"
                "Annuler = arreter.",
            )
            if not ok:
                return
            self.choose_meshroom_dir()
            batch = find_meshroom_batch(self.meshroom_dir)
            if not batch:
                return

        out = PC_PROCESSOR_DIR / "output_gui"
        out.mkdir(parents=True, exist_ok=True)
        self.output_path = out
        self.output_var.set(str(out))
        self.processing_mode_combo.current(1)
        self.easy_hint_var.set("Traitement en cours pour : %s" % self.input_path.name)
        self.start_meshroom()

    def start_meshroom(self) -> None:
        if self.worker and self.worker.is_alive():
            messagebox.showinfo(APP_TITLE, "Un traitement est deja en cours.")
            return

        batch = find_meshroom_batch(self.meshroom_dir)
        if not batch:
            messagebox.showwarning(
                APP_TITLE,
                "Meshroom non configure.\n\n"
                "Utilisez « Choisir dossier Meshroom » ou le bouton vert en haut.\n\n"
                "https://github.com/alicevision/Meshroom/releases",
            )
            return

        run_dir = self._begin_meshroom_run()
        if not run_dir:
            return

        self.set_busy(True, meshroom=True)
        self.meshroom_cancel_event = threading.Event()
        mode = self._processing_mode_key()
        force = self.force_recompute_var.get()
        self.append_log(
            "Demarrage Meshroom | run=%s | mode=%s | nouveau_calcul=%s | ZIP=%s"
            % (self._current_run_id, mode, force, self.input_path.name)
        )
        self.mesh_activity_var.set("Activite : demarrage (0s)...")

        def worker() -> None:
            try:
                result = run_meshroom_pipeline(
                    self.input_path,
                    run_dir,
                    meshroom_dir=self.meshroom_dir,
                    log=self.append_log,
                    processing_mode=mode,
                    cancel_event=self.meshroom_cancel_event,
                    force_recompute=force,
                )
            except Exception as exc:
                import traceback

                self.append_log("[GUI] ERREUR CRITIQUE : %s" % exc)
                self.append_log(traceback.format_exc())
                result = MeshroomResult(
                    success=False,
                    exit_code=1,
                    output_dir=run_dir,
                    error_message=str(exc),
                )
                result.messages.append("Crash interface / pipeline : %s" % exc)
            self.root.after(0, lambda: self.on_meshroom_done(result))

        self.worker = threading.Thread(target=worker, daemon=True)
        self.worker.start()

    def on_meshroom_done(self, result: MeshroomResult) -> None:
        self.last_meshroom = result
        live_status = None
        if result.run_status_path:
            live_status = MeshroomRunMonitor.read_status(result.run_status_path.parent)
        self._stop_status_poll()
        if live_status:
            self._apply_run_status(live_status)
        self.meshroom_cancel_event = None
        self.set_busy(False, meshroom=True)
        self.open_button.configure(state=tk.NORMAL)
        self.output_var.set(str(result.output_dir))
        self._update_export_statuses(meshroom=result)
        self.site_ready_button.configure(state=tk.DISABLED)
        self.easy_hint_var.set(
            "Pret. Cliquez sur TRAITER MON ZIP pour un nouveau scan."
        )

        if result.output_dir:
            self._current_run_dir = result.output_dir
            self._current_run_id = result.run_id or result.output_dir.name
        if result.run_status_path:
            self._current_run_logs_dir = result.run_status_path.parent

        if result.provenance_rejected:
            self.status_var.set("Provenance rejetee.")
            self.mesh_activity_var.set("Activite : rejet — ancien modele ?")
            messagebox.showerror(
                APP_TITLE,
                "%s\n\n%s\n\nZIP : %s\nRun : %s"
                % (
                    result.error_message,
                    result.provenance_reason or "",
                    result.input_source or "",
                    result.run_id or "",
                ),
            )
            self.outputs_var.set("AUCUN site-ready — provenance non prouvee.")
            return

        if result.cancelled_by_user:
            self.status_var.set("Traitement annule.")
            self.mesh_activity_var.set("Activite : annule par l'utilisateur")
            messagebox.showinfo(
                APP_TITLE,
                "Traitement annule.\n\nDossier run conserve avec logs :\n%s\n\n"
                "Aucun dossier site-ready cree."
                % result.output_dir,
            )
            self.outputs_var.set("Annule. Logs dans %s/logs/" % result.output_dir)
            return

        visually_ok = getattr(result, "visually_validated", result.site_ready_validated)
        if result.success and visually_ok and result.site_ready_model:
            self.status_var.set("Modele texturé pret pour le site.")
            self.mesh_step_var.set("Etape : termine — validation OK")
            self.mesh_activity_var.set("Activite : succes")
            self.site_ready_button.configure(state=tk.NORMAL)
            self.preview_button.configure(state=tk.NORMAL)
            glb_path = result.site_ready_model
            fp_line = ""
            if result.input_fingerprint:
                fp_line = "Empreinte ZIP : %s\n" % result.input_fingerprint
            self.outputs_var.set(
                "Modele texturé pret pour le site.\n"
                "Fichier traite : %s\n"
                "%s"
                "Chemin exact : %s\nTextures : %d | Format : %s\n"
                "Voir texture_preview.png dans site-ready/"
                % (
                    result.input_source or self.input_path,
                    fp_line,
                    glb_path,
                    len(result.texture_files),
                    result.site_ready_format,
                )
            )
            warn_cache = ""
            if result.mesh_source_path and "MeshroomCache" in result.mesh_source_path.replace("/", "\\"):
                warn_cache = (
                    "\n\nAttention : modele issu du cache global Meshroom.\n"
                    "Si ce n'est pas votre scan, recochez « Nouveau calcul 3D »."
                )
            messagebox.showinfo(
                APP_TITLE,
                "Modele texturé pret pour le site.\n\n"
                "ZIP/dataset :\n%s\n"
                "Empreinte : %s\n\n"
                "Chemin exact :\n%s\n\n"
                "Duree totale : %s\n"
                "Verifiez texture_preview.png avant upload.%s"
                % (
                    result.input_source or self.input_path,
                    result.input_fingerprint or "—",
                    glb_path,
                    format_elapsed(result.elapsed_seconds),
                    warn_cache,
                ),
            )
            return

        if not getattr(result, "final_audit_performed", True):
            self.status_var.set("Meshroom en cours ou audit non final.")
            messagebox.showinfo(
                APP_TITLE,
                "Meshroom en cours — le fichier final sera cree apres Publish.\n\n"
                "%s"
                % (result.error_message or "Consultez run_status.json."),
            )
            return

        self.status_var.set("Pas de fichier final site.")
        detail = result.error_message or "Echec"
        if result.exit_code == 5:
            detail = "Meshroom a echoue.\n" + detail
        elif result.exit_code == 6:
            detail = "Texturing non genere ou aucun output Meshroom.\n" + detail
        elif result.exit_code == 7:
            detail = "GLB non valide visuellement ou conversion texture echouee.\n" + detail
        if result.failure_reasons:
            detail += "\n\nCauses possibles :\n" + "\n".join("- " + r for r in result.failure_reasons)
        if result.validation_errors:
            detail += "\n\nValidation :\n" + "\n".join("- " + e for e in result.validation_errors)
        if result.audit_path:
            detail += "\n\nAudit : %s" % result.audit_path

        if result.exit_code == 3:
            messagebox.showwarning(APP_TITLE, detail)
        elif result.exit_code == 4:
            messagebox.showwarning(APP_TITLE, detail)
        else:
            messagebox.showerror(APP_TITLE, detail + "\n\n" + "\n".join(result.messages))

        self.outputs_var.set(
            "%d JPG extraits. AUCUN fichier site-ready valide. %s"
            % (result.image_count, result.error_message or "")
        )

    def open_site_ready(self) -> None:
        folder = None
        if self.last_meshroom and self.last_meshroom.site_ready_dir:
            if self._current_run_dir and self.last_meshroom.output_dir == self._current_run_dir:
                folder = self.last_meshroom.site_ready_dir
        if not folder and self._current_run_dir:
            candidate = self._current_run_dir / "site-ready"
            if candidate.is_dir():
                folder = candidate
        if folder and folder.is_dir():
            os.startfile(str(folder))  # type: ignore[attr-defined]
        else:
            messagebox.showinfo(APP_TITLE, "Dossier site-ready introuvable pour le run courant.")

    def open_run_preview(self) -> None:
        preview = None
        if self._current_run_dir:
            candidate = self._current_run_dir / "preview.html"
            if candidate.is_file():
                preview = candidate
        if preview:
            os.startfile(str(preview))  # type: ignore[attr-defined]
        else:
            messagebox.showinfo(
                APP_TITLE,
                "preview.html introuvable pour le run courant.\n"
                "Lancez d'abord un traitement Meshroom termine avec succes.",
            )

    def open_output_folder(self) -> None:
        folder = self._output_dir()
        if folder.exists():
            os.startfile(str(folder))  # type: ignore[attr-defined]


def main() -> int:
    root = tk.Tk()
    ScanProcessorApp(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
