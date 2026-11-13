import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-2xl border border-tide/20 bg-white px-4 py-3 text-base text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-tide",
        className,
      )}
      {...props}
    />
  );
}
