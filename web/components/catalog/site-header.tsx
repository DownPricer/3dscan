import Link from "next/link";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-[#0f2f3f]/10 bg-[#fbfaf7]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="text-lg font-black tracking-tight text-[#0f2f3f] sm:text-xl">
          Site Ready SHD
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/login">Admin</Link>
        </Button>
      </div>
    </header>
  );
}
