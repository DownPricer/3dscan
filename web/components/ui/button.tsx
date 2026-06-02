import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f2f3f] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default:
          "bg-slate-950 !text-white shadow-md shadow-slate-950/20 hover:bg-slate-800 active:bg-slate-900",
        secondary:
          "bg-[#f4f1ea] !text-slate-950 ring-2 ring-slate-950/20 hover:bg-[#ebe5da] active:bg-[#e2dbd0]",
        outline:
          "border-2 border-slate-950 bg-white !text-slate-950 hover:bg-slate-50 active:bg-[#ebe5da]",
        ghost: "text-[#0f2f3f] hover:bg-[#0f2f3f]/8",
        destructive: "bg-red-700 text-white hover:bg-red-800 active:bg-red-900",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-7 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
