import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-2xl border border-white/15 bg-[#071f29] px-4 py-3 text-base text-foam outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-teal",
        className,
      )}
      {...props}
    />
  );
}
