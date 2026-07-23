import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

test("processes images with the security-patched sharp override", async () => {
  const png = await sharp({
    create: {
      width: 2,
      height: 3,
      channels: 4,
      background: { r: 12, g: 34, b: 56, alpha: 1 },
    },
  }).png().toBuffer();

  const metadata = await sharp(png).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 2);
  assert.equal(metadata.height, 3);
  assert.equal(metadata.channels, 4);
});
