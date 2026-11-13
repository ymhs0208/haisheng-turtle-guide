import { useGuide } from "@/state";

export function ZoneSelect() {
  const { zones, session, selectZone } = useGuide();
  const current = session?.currentZoneId;
  if (zones.length === 0) return null;
  return (
    <div role="radiogroup" aria-label="展區" className="grid grid-cols-3 gap-2">
      {zones.map((zone) => {
        const selected = zone.id === current;
        return (
          <button
            key={zone.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`soft-press min-h-12 rounded-full px-2 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tide ${selected ? "bg-tide text-white" : "bg-white text-ink"}`}
            onClick={() => void selectZone(zone.id)}
          >
            {zone.name}
          </button>
        );
      })}
    </div>
  );
}
