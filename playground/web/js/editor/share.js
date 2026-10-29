// Share links: the script and the knobs as one URL hash, deflate-compressed when the browser can.

export const SHARE_LIMIT = 8000;
export const SHARE_TOO_LONG = "This script is too long for a link.";

// True when a hash from encodeShare is too long to use as a link.
export const shareTooLong = (hash) => hash.length > SHARE_LIMIT;

function toBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s) {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const body = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

// Returns the hash, "#s=<deflate, base64url>" or "#u=<base64url>" without compression support.
export async function encodeShare(state) {
  const json = JSON.stringify({ v: 1, script: String(state.script ?? ""), knobs: state.knobs ?? {} });
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream !== "undefined") {
    try { return "#s=" + toBase64Url(await pipe(bytes, new CompressionStream("deflate-raw"))); } catch (e) { /* fall through */ }
  }
  return "#u=" + toBase64Url(bytes);
}

// The reverse. Accepts the hash with or without "#". Returns null for anything it cannot read.
export async function decodeShare(hash) {
  try {
    const m = /^#?([su])=([A-Za-z0-9_-]+)$/.exec(String(hash).trim());
    if (!m) return null;
    let bytes = fromBase64Url(m[2]);
    if (m[1] === "s") {
      if (typeof DecompressionStream === "undefined") return null;
      bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || data.v !== 1 || typeof data.script !== "string") return null;
    const knobs = data.knobs && typeof data.knobs === "object" && !Array.isArray(data.knobs) ? data.knobs : {};
    return { script: data.script, knobs };
  } catch (e) {
    return null;
  }
}
