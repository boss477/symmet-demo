/** Share link helpers. Run: node --test scripts/share-link.test.mjs */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateShareToken, buildShareUrl, parseViewToken } from "../src/lib/shareLink.js";

describe("generateShareToken", function () {
  it("returns a URL-safe token of stable length", function () {
    var t = generateShareToken();
    assert.match(t, /^[A-Za-z0-9_-]{22}$/);
  });
  it("is unique across calls", function () {
    var seen = new Set();
    for (var i = 0; i < 500; i++) seen.add(generateShareToken());
    assert.equal(seen.size, 500);
  });
});

describe("buildShareUrl", function () {
  it("joins origin and token as a /view path", function () {
    assert.equal(buildShareUrl("abc", "https://app.example.com"), "https://app.example.com/view/abc");
  });
  it("trims a trailing slash on origin", function () {
    assert.equal(buildShareUrl("abc", "https://app.example.com/"), "https://app.example.com/view/abc");
  });
});

describe("parseViewToken", function () {
  it("extracts the token from a /view/<token> path", function () {
    assert.equal(parseViewToken("/view/abc123"), "abc123");
  });
  it("returns null for non-view paths", function () {
    assert.equal(parseViewToken("/manufacturer"), null);
    assert.equal(parseViewToken("/view/"), null);
    assert.equal(parseViewToken("/"), null);
  });
});
