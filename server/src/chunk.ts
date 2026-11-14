export interface PassageMeta {
  title: string;
  section?: string;
  url?: string;
}

export interface TextChunk extends PassageMeta {
  text: string;
  index: number;
}

const MIN = 300;
const MAX = 500;
const TARGET = 420;
const OVERLAP = 80;

function lastBreak(text: string): number {
  const marks = ["。", "！", "？", "\n", "；"];
  let at = -1;
  for (const mark of marks) {
    const found = text.lastIndexOf(mark);
    if (found > at) at = found;
  }
  return at;
}

/** Split Traditional Chinese prose into overlapping 300–500 character chunks. Short texts stay whole. */
export function chunkPassage(text: string, meta: PassageMeta): TextChunk[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= MAX) {
    return [{ ...meta, text: clean, index: 0 }];
  }
  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < clean.length && chunks.length < 80) {
    let end = Math.min(clean.length, start + TARGET);
    if (clean.length - start <= MAX) {
      end = clean.length;
    } else {
      const window = clean.slice(start + MIN, Math.min(clean.length, start + MAX));
      const rel = lastBreak(window);
      end = rel >= 0 ? start + MIN + rel + 1 : Math.min(clean.length, start + MAX);
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push({ ...meta, text: piece, index: chunks.length });
    if (end >= clean.length) break;
    const next = Math.max(start + 1, end - OVERLAP);
    start = next;
  }
  return chunks;
}

/** Pull visible text out of a simple PDF, including UTF-16 hex strings. */
export function extractPdfText(data: Buffer | string): string {
  const raw = typeof data === "string" ? data : data.toString("latin1");
  const parts: string[] = [];
  const hex = /<([0-9A-Fa-f\s]{4,})>/g;
  for (const match of raw.matchAll(hex)) {
    const digits = match[1].replace(/\s+/g, "");
    if (digits.length < 4 || digits.length % 2 !== 0) continue;
    const bytes = Buffer.from(digits, "hex");
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      parts.push(decodeUtf16(bytes.subarray(2), "be"));
      continue;
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      parts.push(decodeUtf16(bytes.subarray(2), "le"));
      continue;
    }
    const ascii = bytes.toString("latin1");
    if (/[\x20-\x7e]{4,}/.test(ascii)) parts.push(ascii);
  }
  const literal = /\(((?:\\\)|\\.|[^\\)]){2,})\)/g;
  for (const match of raw.matchAll(literal)) {
    const text = match[1].replace(/\\n/g, "\n").replace(/\\(.)/g, "$1");
    if (/[\u4e00-\u9fff]/.test(text) || /[A-Za-z]{4,}/.test(text)) parts.push(text);
  }
  return parts.join("\n").replace(/\u0000/g, "").trim();
}

function decodeUtf16(data: Buffer, endian: "be" | "le"): string {
  const even = data.subarray(0, data.length - (data.length % 2));
  if (endian === "le") return even.toString("utf16le");
  const swapped = Buffer.alloc(even.length);
  for (let i = 0; i < even.length; i += 2) {
    swapped[i] = even[i + 1] ?? 0;
    swapped[i + 1] = even[i] ?? 0;
  }
  return swapped.toString("utf16le");
}
