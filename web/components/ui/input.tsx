import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 text-sm shadow-sm outline-none transition placeholder:text-[#98a2b3] focus:border-[#2f6f5e] focus:ring-2 focus:ring-[#2f6f5e]/15",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
