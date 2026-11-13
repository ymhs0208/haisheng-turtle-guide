import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 focus-visible:ring-offset-abyss disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-teal text-abyss hover:bg-[#7af3e0]",
        sand: "bg-sand text-abyss hover:bg-[#ffe7c0]",
        ghost: "border border-white/15 bg-white/5 text-foam hover:bg-white/10",
        danger: "bg-coral text-abyss hover:bg-[#ffb0a6]",
      },
      size: {
        default: "min-h-12 px-5",
        sm: "min-h-10 px-3 text-sm",
        icon: "h-11 w-11",
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
