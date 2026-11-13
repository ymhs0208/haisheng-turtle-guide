import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export function Progress({ className, value = 0 }: { className?: string; value?: number }) {
  return (
    <ProgressPrimitive.Root className={cn("relative h-2 overflow-hidden rounded-full bg-white/10", className)}>
      <ProgressPrimitive.Indicator
        className="h-full w-full bg-teal transition-transform"
        style={{ transform: `translateX(-${100 - Math.max(0, Math.min(100, value))}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
