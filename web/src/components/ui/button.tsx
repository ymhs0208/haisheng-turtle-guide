import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "soft-press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-sea disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-tide text-white hover:bg-tide-deep",
        sand: "bg-sand text-ink hover:bg-[#efe2c8]",
        ghost: "border border-tide/20 bg-white text-ink hover:bg-deep",
        danger: "bg-coral text-white hover:bg-[#8f1c14]",
      },
      size: {
        default: "min-h-12 px-5",
        lg: "min-h-14 px-5 text-lg",
        sm: "min-h-11 px-3 text-base",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
