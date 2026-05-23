import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "draft" | "published";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        variant === "default" && "bg-[#0f2f3f]/10 text-[#0f2f3f]",
        variant === "draft" && "bg-amber-100 text-amber-800",
        variant === "published" && "bg-emerald-100 text-emerald-800",
        className,
      )}
      {...props}
    />
  );
}
