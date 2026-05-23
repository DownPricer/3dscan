"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DeletePropertyButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function remove() {
    if (!window.confirm("Supprimer définitivement cette propriété ?")) return;

    setLoading(true);
    await fetch(`/api/admin/properties/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={loading}
      onClick={remove}
    >
      Supprimer
    </Button>
  );
}
