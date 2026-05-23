import Link from "next/link";
import { LogoutButton } from "@/components/admin/logout-button";
import { requireAdmin } from "@/lib/auth";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen bg-[#f7f5f0]">
      <header className="border-b border-[#ddd6c8] bg-white/75 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <Link href="/admin" className="text-lg font-black text-[#0f2f3f]">
              Site Ready SHD Admin
            </Link>
            <p className="text-xs text-[#667085]">{admin.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold text-[#475467]">
              Site public
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}
