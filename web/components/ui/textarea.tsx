import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "min-h-32 w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-sm shadow-sm outline-none transition placeholder:text-[#98a2b3] focus:border-[#2f6f5e] focus:ring-2 focus:ring-[#2f6f5e]/15",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
