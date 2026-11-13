import assert from "node:assert/strict";
import test from "node:test";
import { metaFromTags, snippetOf, toCiteSource, withCitationMarkers } from "../src/cite.js";

test("引用編號跟來源順序一致", () => {
  const text = withCitationMarkers(["珊瑚會失去蟲黃藻。", "白化不一定立刻死亡。"]);
  assert.equal(text, "珊瑚會失去蟲黃藻。[1]白化不一定立刻死亡。[2]");
  assert.match(text, /\[1\].*\[2\]/);
});

test("來源晶片帶標題、片段、段落和網址", () => {
  const source = toCiteSource({
    id: "a",
    title: "樣本：珊瑚白化",
    zoneId: "coral",
    body: "這是樣本文件。水溫過高時珊瑚會變白。",
    tags: ["珊瑚", "section:珊瑚白化", "url:content/docs/sample-bleach.md"],
  });
  assert.equal(source.section, "珊瑚白化");
  assert.equal(source.url, "content/docs/sample-bleach.md");
  assert.match(source.snippet, /樣本文件/);
  assert.equal(snippetOf("甲\n乙"), "甲 乙");
  assert.deepEqual(metaFromTags(["section:食物", "url:content/seed.json#a"]), {
    section: "食物",
    url: "content/seed.json#a",
  });
});
