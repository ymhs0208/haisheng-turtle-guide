import assert from "node:assert/strict";
import test from "node:test";
import { localEmbed } from "../src/embed.js";
import { rankChunks } from "../src/rank.js";

function chunk(id: string, zoneId: string, title: string, body: string) {
  const text = `${title}\n${body}`;
  return { id, zoneId, title, body, tags: [zoneId], embedding: localEmbed(text) };
}

test("白化問題會排在海龜飲食前面", () => {
  const chunks = [
    chunk("diet", "turtle", "綠蠵龜的食物", "長大的綠蠵龜主要吃海草和藻類。"),
    chunk("bleach", "coral", "珊瑚白化", "水溫過高會讓珊瑚失去蟲黃藻，看起來變白，這叫白化。"),
    chunk("vent", "deep", "深海熱泉", "熱泉生物靠化學合成得到能量，不靠陽光。"),
  ];
  const query = "珊瑚為什麼會白化？";
  const ranked = rankChunks(query, localEmbed(query), chunks, "coral", 3);
  assert.equal(ranked[0]?.id, "bleach");
  assert.ok(ranked.every((item) => item.zoneId === "coral"));
});

test("目前展區對不上時，仍會找回別區較高的段落", () => {
  const chunks = [
    chunk("diet", "turtle", "綠蠵龜的食物", "長大的綠蠵龜主要吃海草和藻類。"),
    chunk("vent", "deep", "深海熱泉", "熱泉的食物從化學合成來，不靠陽光做食物。"),
  ];
  const query = "熱泉的食物從哪裡來？";
  const ranked = rankChunks(query, localEmbed(query), chunks, "turtle", 3);
  assert.equal(ranked[0]?.id, "vent");
});
