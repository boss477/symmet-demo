import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_DISPLAY_STATE, toggleDisplayState } from "../src/lib/displayState.js";

describe("display state", function () {
  it("toggles furniture visibility", function () {
    var next = toggleDisplayState(DEFAULT_DISPLAY_STATE, "furniture");

    assert.equal(next.furniture, false);
    assert.equal(DEFAULT_DISPLAY_STATE.furniture, true);
  });
});