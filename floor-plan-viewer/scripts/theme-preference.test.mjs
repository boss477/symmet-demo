import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getInitialTheme, nextTheme, THEME_KEY } from "../src/lib/themePreference.js";

describe("theme preference", function () {
  it("uses a stored theme before the system preference", function () {
    assert.equal(getInitialTheme({ stored: "dark", systemDark: false }), "dark");
    assert.equal(getInitialTheme({ stored: "light", systemDark: true }), "light");
  });

  it("falls back to light when no theme is stored", function () {
    assert.equal(getInitialTheme({ stored: "", systemDark: true }), "light");
    assert.equal(getInitialTheme({ stored: "", systemDark: false }), "light");
  });

  it("toggles between light and dark", function () {
    assert.equal(nextTheme("light"), "dark");
    assert.equal(nextTheme("dark"), "light");
    assert.equal(THEME_KEY, "symmet-theme");
  });
});
