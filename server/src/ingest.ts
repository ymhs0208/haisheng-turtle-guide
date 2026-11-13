import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chunkPassage, extractPdfText } from "./chunk.js";
import { embedText } from "./llm.js";
import { createStoreFromEnv } from "./store.js";
import type { Chunk, Seed, StoredChunk } from "./types.js";

export interface SourceDoc {
  id: string;
  zoneId: string;
  title: string;
  section: string;
  url: string;
  text: string;
  tags: string[];
}

export function contentRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "content"),
    path.resolve(process.cwd(), "../content"),
    path.resolve(here, "../../content"),
  ];
  return candidates.find((dir) => existsSync(dir)) ?? candidates[0];
}

function frontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const text = raw.replace(/^\uFEFF/, "");
  if (!text.startsWith("---\n")) return { meta: {}, body: text };
  const end = text.indexOf("\n---", 4);
  if (end < 0) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const split = line.indexOf(":");
    if (split <= 0) continue;
    meta[line.slice(0, split).trim()] = line.slice(split + 1).trim();
  }
  return { meta, body: text.slice(end + 4).trim() };
}

function plainHeader(raw: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  const body: string[] = [];
  let header = true;
  for (const line of raw.split("\n")) {
    const title = line.match(/^標題：\s*(.+)$/);
    const zone = line.match(/^展區：\s*(.+)$/);
    const section = line.match(/^段落：\s*(.+)$/);
    const url = line.match(/^網址：\s*(.+)$/);
    if (header && (title || zone || section || url)) {
      if (title) meta.title = title[1].trim();
      if (zone) meta.zone = zone[1].trim();
      if (section) meta.section = section[1].trim();
      if (url) meta.url = url[1].trim();
      continue;
    }
    header = false;
    body.push(line);
  }
  return { meta, body: body.join("\n").trim() };
}

function zoneFromHint(hint: string): string {
  if (/turtle|海龜/.test(hint)) return "turtle";
  if (/deep|vent|深海|熱泉/.test(hint)) return "deep";
  if (/coral|珊瑚/.test(hint)) return "coral";
  return "coral";
}

export function loadDocFile(file: string, root: string): SourceDoc | null {
  const ext = path.extname(file).toLowerCase();
  const rel = path.relative(root, file).replaceAll(path.sep, "/");
  const raw = ext === ".pdf" ? extractPdfText(readFileSync(file)) : readFileSync(file, "utf8");
  if (!raw.trim()) return null;
  const parsed = ext === ".md" ? frontMatter(raw) : plainHeader(raw);
  const hint = `${path.basename(file)}\n${parsed.body.slice(0, 240)}`;
  const title = parsed.meta.title || path.basename(file, ext);
  const zoneId = parsed.meta.zone || zoneFromHint(hint);
  const section = parsed.meta.section || title;
  return {
    id: rel.replace(/[^\w.-]+/g, "-"),
    zoneId,
    title,
    section,
    url: parsed.meta.url || rel,
    text: parsed.body,
    tags: [zoneId, section, "樣本"],
  };
}

export function loadDocs(root = contentRoot()): SourceDoc[] {
  const dir = path.join(root, "docs");
  if (!existsSync(dir)) return [];
  const docs: SourceDoc[] = [];
  for (const name of readdirSync(dir)) {
    if (!/\.(md|txt|pdf)$/i.test(name)) continue;
    const doc = loadDocFile(path.join(dir, name), root);
    if (doc) docs.push(doc);
  }
  return docs;
}

export function passagesFromSeed(seed: Seed): SourceDoc[] {
  return (seed.chunks ?? []).map((chunk: Chunk) => ({
    id: chunk.id,
    zoneId: chunk.zoneId,
    title: chunk.title,
    section: chunk.tags[1] || chunk.tags[0] || chunk.title,
    url: `content/seed.json#${chunk.id}`,
    text: chunk.body,
    tags: chunk.tags,
  }));
}

export function toStoredPieces(docs: SourceDoc[]): Omit<StoredChunk, "embedding">[] {
  const pieces: Omit<StoredChunk, "embedding">[] = [];
  for (const doc of docs) {
    const parts = chunkPassage(doc.text, { title: doc.title, section: doc.section, url: doc.url });
    parts.forEach((part, index) => {
      pieces.push({
        id: parts.length > 1 ? `${doc.id}#${index + 1}` : doc.id,
        zoneId: doc.zoneId,
        title: doc.title,
        body: part.text,
        tags: [...doc.tags, `section:${part.section ?? ""}`, `url:${part.url ?? ""}`],
      });
    });
  }
  return pieces;
}

export async function buildIndexChunks(seed: Seed, root = contentRoot()): Promise<StoredChunk[]> {
  const pieces = toStoredPieces([...passagesFromSeed(seed), ...loadDocs(root)]);
  const stored: StoredChunk[] = [];
  for (const piece of pieces) {
    const embedding = await embedText(`${piece.title}\n${piece.body}\n${piece.tags.join(" ")}`);
    stored.push({ ...piece, embedding });
  }
  return stored;
}

async function main(): Promise<void> {
  const { loadSeed } = await import("./content.js");
  const seed = loadSeed();
  const chunks = await buildIndexChunks(seed);
  const store = await createStoreFromEnv();
  await store.replaceChunks(chunks);
  console.log(`已寫入 ${chunks.length} 段。資料庫 ${store.kind}／向量 ${store.vectorMode}。`);
  await store.close();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
