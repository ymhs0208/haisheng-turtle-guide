import assert from "node:assert/strict";
import test from "node:test";
import { loadPublicSlides, loadSeed } from "../src/content.js";

test("樣本題庫完整，而且離線幻燈片沒有脫離種子稿", () => {
  const seed = loadSeed();
  assert.equal(seed.sample, true);
  assert.ok(seed.disclaimer.includes("樣本"));
  assert.ok(seed.zones.length >= 2 && seed.zones.length <= 3);
  const blob = JSON.stringify(seed);
  for (const slide of loadPublicSlides()) {
    assert.ok(blob.includes(slide.text.slice(0, 24)), slide.title);
  }
  for (const zone of seed.zones) {
    assert.ok(zone.concepts.length >= 3 && zone.concepts.length <= 5);
    for (const concept of zone.concepts) {
      assert.ok(concept.questions.length >= 2 && concept.questions.length <= 4);
    }
  }
});
