import Link from "next/link";
import { PropertyForm } from "@/components/admin/property-form";

export default function NewPropertyPage() {
  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm font-semibold text-[#2f6f5e]">
          ← Retour au dashboard
        </Link>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-[#0f2f3f]">
          Ajouter une propriété
        </h1>
        <p className="mt-2 text-[#667085]">
          Remplissez le nom, uploadez le scan 3D, puis créez la visite à partager.
        </p>
      </div>
      <PropertyForm />
    </div>
  );
}
