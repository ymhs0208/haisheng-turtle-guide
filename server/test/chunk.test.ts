import assert from "node:assert/strict";
import test from "node:test";
import { chunkPassage, extractPdfText } from "../src/chunk.js";

test("短文保持一整段", () => {
  const chunks = chunkPassage("這是樣本。珊瑚會白化。", { title: "樣本", section: "白化" });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.section, "白化");
  assert.match(chunks[0]?.text ?? "", /白化/);
});

test("長文切成 300 到 500 字，而且相鄰段有重疊", () => {
  const sentence = "水溫升高時，珊瑚會失去蟲黃藻，顏色變白，身體也變弱。";
  const text = Array.from({ length: 40 }, () => sentence).join("");
  const chunks = chunkPassage(text, { title: "白化", url: "content/docs/sample.md" });
  assert.ok(chunks.length >= 3);
  for (const chunk of chunks) {
    assert.ok(chunk.text.length <= 500, `過長 ${chunk.text.length}`);
    if (chunk.index < chunks.length - 1) assert.ok(chunk.text.length >= 300, `過短 ${chunk.text.length}`);
  }
  const first = chunks[0]?.text ?? "";
  const second = chunks[1]?.text ?? "";
  const tail = first.slice(-40);
  assert.ok(second.includes(tail.slice(0, 20)));
});

test("PDF 能讀出 UTF-16 的中文樣本", () => {
  const phrase = "這是樣本文件。深海熱泉靠化學合成。";
  const le = Buffer.from(phrase, "utf16le");
  const be = Buffer.alloc(le.length);
  for (let i = 0; i < le.length; i += 2) {
    be[i] = le[i + 1] ?? 0;
    be[i + 1] = le[i] ?? 0;
  }
  const encoded = Buffer.concat([Buffer.from([0xfe, 0xff]), be]);
  const hex = encoded.toString("hex");
  const pdf = `%PDF-1.4\nBT <${hex}> Tj ET\n%%EOF`;
  const text = extractPdfText(pdf);
  assert.match(text, /樣本文件/);
  assert.match(text, /化學合成/);
});
