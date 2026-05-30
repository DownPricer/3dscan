"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type CatalogDebugProperty = {
  id: string;
  slug: string;
  name: string;
  status: string;
  catalogEnabled: boolean;
  catalogStatus: string;
  externalListingUrl: string | null;
  externalListingStatus: string;
  visibleInCatalog: boolean;
  reasons: string[];
};

export function CatalogDebugButton() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CatalogDebugProperty[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDiagnostic() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/catalog/debug");
      const data = (await response.json()) as {
        error?: string;
        properties?: CatalogDebugProperty[];
      };
      if (!response.ok) {
        setError(data.error ?? "Diagnostic impossible.");
        setResults(null);
        return;
      }
      setResults(data.properties ?? []);
    } catch {
      setError("Connexion interrompue pendant le diagnostic.");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button type="button" variant="secondary" disabled={loading} onClick={() => void runDiagnostic()}>
        {loading ? "Diagnostic…" : "Diagnostiquer le catalogue"}
      </Button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {results ? (
        <div className="overflow-x-auto rounded-2xl border border-[#eee7dc] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[#eee7dc] bg-[#f7f5f0] text-xs uppercase tracking-wide text-[#667085]">
              <tr>
                <th className="px-4 py-3">Bien</th>
                <th className="px-4 py-3">Publié</th>
                <th className="px-4 py-3">Catalogue</th>
                <th className="px-4 py-3">Statut cat.</th>
                <th className="px-4 py-3">Lien ext.</th>
                <th className="px-4 py-3">Visible</th>
                <th className="px-4 py-3">Raisons</th>
              </tr>
            </thead>
            <tbody>
              {results.map((property) => (
                <tr key={property.id} className="border-b border-[#eee7dc] align-top">
                  <td className="px-4 py-3 font-semibold text-[#0f2f3f]">{property.name}</td>
                  <td className="px-4 py-3">{property.status === "PUBLISHED" ? "oui" : "non"}</td>
                  <td className="px-4 py-3">{property.catalogEnabled ? "oui" : "non"}</td>
                  <td className="px-4 py-3">{property.catalogStatus}</td>
                  <td className="px-4 py-3">
                    {property.externalListingUrl?.trim()
                      ? property.externalListingStatus
                      : "vide"}
                  </td>
                  <td className="px-4 py-3">{property.visibleInCatalog ? "oui" : "non"}</td>
                  <td className="px-4 py-3 text-[#667085]">{property.reasons.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
