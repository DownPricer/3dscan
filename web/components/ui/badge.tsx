import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "draft" | "published" | "overlay";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold tracking-wide",
        variant === "default" && "bg-[#0f2f3f]/10 text-[#0f2f3f]",
        variant === "draft" && "bg-amber-100 text-amber-900",
        variant === "published" && "bg-emerald-100 text-emerald-900",
        variant === "overlay" && "bg-[#0f2f3f]/90 text-white shadow-sm backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}
