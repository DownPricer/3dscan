"use client";

import { CheckCircle2, ImageIcon, RefreshCw, Trash2 } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PanoramaSceneInput } from "@/lib/hybrid-types";

type PanoramaSceneCardProps = {
  scene: PanoramaSceneInput;
  index: number;
  onNameChange: (name: string) => void;
  onUpload: (file: File) => void;
  onRemove: () => void;
  uploading?: boolean;
};

export function PanoramaSceneCard({
  scene,
  index,
  onNameChange,
  onUpload,
  onRemove,
  uploading = false,
}: PanoramaSceneCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const hasImage = Boolean(scene.imageUrl?.trim());

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-[#e4e7ec] bg-white p-4 shadow-sm sm:flex-row">
      <div
        className={`relative flex h-28 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl sm:h-32 sm:w-40 ${
          hasImage ? "bg-[#111827]" : "bg-[#f4f1ea]"
        }`}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={scene.imageUrl}
            alt={`Aperçu ${scene.name}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-[#667085]">
            <ImageIcon size={28} strokeWidth={1.5} />
            <span className="text-xs">Photo 360</span>
          </div>
        )}
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white">
            Envoi…
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <Label htmlFor={`scene-name-${index}`}>Nom de la pièce</Label>
            <Input
              id={`scene-name-${index}`}
              value={scene.name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Salon, Cuisine, Chambre…"
            />
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={onRemove}>
            <Trash2 size={14} />
            <span className="sr-only sm:not-sr-only">Supprimer</span>
          </Button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {hasImage ? (
              <>
                <RefreshCw size={14} /> Remplacer
              </>
            ) : (
              <>
                <ImageIcon size={14} /> Ajouter photo 360
              </>
            )}
          </Button>
          {hasImage ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={14} />
              Image 360 ajoutée
            </span>
          ) : (
            <span className="text-xs text-amber-700">JPG ou PNG équirectangulaire (ratio 2:1)</span>
          )}
        </div>
      </div>
    </article>
  );
}
