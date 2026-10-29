// Share links: write and read the URL hash through the editor kit's encodeShare/decodeShare,
// with an uncompressed base64url stand-in (#u=) when share.js is missing.

const MAX_HASH = 8000;

function b64urlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(data) {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export const hasShareHash = (hash) => /^#[su]=/.test(hash || "");

// Keep the leading "#" and a "s=" or "u=" prefix whatever form encodeShare returned.
export function normalizeHash(h) {
  let out = String(h);
  if (!out.startsWith("#")) out = `#${out}`;
  if (!/^#[su]=/.test(out)) out = `#s=${out.slice(1)}`;
  return out;
}

export async function encodeState(kit, state) {
  if (kit.encodeShare) return normalizeHash(await kit.encodeShare(state));
  return `#u=${b64urlEncode(JSON.stringify({ v: 1, ...state }))}`;
}

export async function decodeState(kit, hash) {
  try {
    if (kit.decodeShare) {
      const r = (await kit.decodeShare(hash)) || (await kit.decodeShare(hash.slice(1)));
      if (r) return r;
    }
    if (hash.startsWith("#u=")) return JSON.parse(b64urlDecode(hash.slice(3)));
  } catch (e) { /* fall through */ }
  return null;
}

export function mountShare({ store, kit, button, status }) {
  let timer = 0;
  const say = (text) => {
    status.textContent = text;
    clearTimeout(timer);
    timer = setTimeout(() => { status.textContent = ""; }, 5000);
  };
  button.addEventListener("click", async () => {
    const s = store.get();
    const state = { script: s.script, knobs: { ...s.knobs, shownCopies: s.shownCopies } };
    let hash;
    try {
      hash = await encodeState(kit, state);
    } catch (e) {
      say("Could not encode the link.");
      return;
    }
    if (hash.length > MAX_HASH) { say("This script is too long for a link."); return; }
    try { history.replaceState(null, "", hash); } catch (e) { /* ignore */ }
    try {
      await navigator.clipboard.writeText(location.href);
      say("Link copied. It restores the script and knobs in free play.");
    } catch (e) {
      say("The address bar now holds the link. Copy it from there.");
    }
  });
}
