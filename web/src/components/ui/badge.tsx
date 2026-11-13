import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex min-h-8 items-center rounded-full bg-tide/10 px-3 py-1 text-base font-semibold text-tide", className)}
      {...props}
    />
  );
}
