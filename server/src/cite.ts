export interface CiteSource {
  id: string;
  title: string;
  zoneId: string;
  snippet: string;
  section: string;
  url: string;
}

export function metaFromTags(tags: string[]): { section: string; url: string } {
  const section = tags.find((tag) => tag.startsWith("section:"))?.slice("section:".length) ?? "";
  const url = tags.find((tag) => tag.startsWith("url:"))?.slice("url:".length) ?? "";
  return { section, url };
}

export function snippetOf(body: string, size = 80): string {
  return body.replace(/\s+/g, " ").trim().slice(0, size);
}

/** Inline markers [1] [2] that match the source list order. */
export function withCitationMarkers(parts: string[]): string {
  return parts
    .map((part, index) => {
      const text = part.trim();
      if (!text) return "";
      return `${text}[${index + 1}]`;
    })
    .filter(Boolean)
    .join("");
}

export function toCiteSource(item: { id: string; title: string; zoneId: string; body: string; tags?: string[] }): CiteSource {
  const meta = metaFromTags(item.tags ?? []);
  return {
    id: item.id,
    title: item.title,
    zoneId: item.zoneId,
    snippet: snippetOf(item.body),
    section: meta.section,
    url: meta.url,
  };
}
