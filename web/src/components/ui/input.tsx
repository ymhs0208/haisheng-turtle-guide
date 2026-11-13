import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex min-h-12 w-full rounded-2xl border border-tide/20 bg-white px-4 text-base text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-tide",
        className,
      )}
      {...props}
    />
  );
}
