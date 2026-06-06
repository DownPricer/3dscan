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
          "bg-[#0f2f3f] !text-white shadow-md shadow-[#0f2f3f]/20 hover:bg-[#1a4558] active:bg-[#0a2430] [&_a]:!text-white [&_svg]:!text-white",
        accent:
          "bg-[#2f6f5e] !text-white shadow-md shadow-[#2f6f5e]/20 hover:bg-[#3d8a74] active:bg-[#265a4c] [&_a]:!text-white [&_svg]:!text-white",
        secondary:
          "bg-[#f4f1ea] !text-[#0f2f3f] ring-2 ring-[#0f2f3f]/15 hover:bg-[#ebe5da] active:bg-[#e2dbd0] [&_a]:!text-[#0f2f3f]",
        outline:
          "border-2 border-[#0f2f3f] bg-white !text-[#0f2f3f] hover:bg-[#f7f5f0] active:bg-[#ebe5da] [&_a]:!text-[#0f2f3f]",
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
