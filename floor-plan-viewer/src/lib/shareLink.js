/** 16 random bytes → 22-char base64url token. Uses Web Crypto (browser + Node 18+). */
export function generateShareToken() {
  var bytes = new Uint8Array(16);
  (globalThis.crypto || {}).getRandomValues(bytes);
  var bin = "";
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  var b64 = (typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64"));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** origin + "/view/" + token, with any trailing slash on origin removed. */
export function buildShareUrl(token, origin) {
  return String(origin || "").replace(/\/$/, "") + "/view/" + token;
}

/** Extract a non-empty token from "/view/<token>", else null. */
export function parseViewToken(pathname) {
  var m = /^\/view\/([^/]+)$/.exec(String(pathname || ""));
  return m ? m[1] : null;
}
