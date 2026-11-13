import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full bg-teal/15 px-3 py-1 text-xs font-semibold text-teal", className)}
      {...props}
    />
  );
}
