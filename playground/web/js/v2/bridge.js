// The wasm wrapper of the v2 page: v1 wasm.js plus copies mask, answers, rows and events.
// M is the module returned by createMultiview(); node tests pass their own.

const OP_DOUBLES = 16;
const OP_BYTES = OP_DOUBLES * 8;

export function makeBridge(M) {
  const pgReset = M.cwrap("pg_reset", null, ["number", "number", "number", "number", "number", "number", "number", "number"]);
  const pgExec = M.cwrap("pg_exec", null, ["number", "number", "number"]);
  const pgExecJson = M.cwrap("pg_exec_json", "string", []);
  const pgJson = M.cwrap("pg_json", "string", []);
  const pgExplain = M.cwrap("pg_explain", "string", ["number"]);
  const pgSetCopies = M.cwrap("pg_set_copies", null, ["number"]);
  const pgResults = M.cwrap("pg_results", "number", ["number"]);
  const pgRow = M.cwrap("pg_row", "number", ["number"]);
  let buf = 0;
  let bufDoubles = 0;

  const bridge = {
    // Fresh table. Every copy is rebuilt; the mask of copies is set after the reset.
    reset({ rows, seed = 1, eagerness = 1, maxIndexKb = 0, rent = 1e-5 }) {
      pgReset(rows | 0, seed | 0, eagerness, maxIndexKb | 0, rent, 0, 0, 0);
    },
    // Bit k of mask = copy k runs in pg_exec (0 adaptive, 1 scan only, 2 grouped only, 3 sorted only, 4 grouped and sorted).
    setCopies(mask) {
      pgSetCopies(mask | 0);
    },
    // Copies the op records into wasm memory (one buffer, reused when it is big enough).
    loadOps(ops) {
      const need = Math.max(ops.length, 1) * OP_DOUBLES;
      if (!buf || need > bufDoubles) {
        if (buf) M._free(buf);
        buf = M._malloc(need * 8);
        bufDoubles = need;
      }
      const flat = new Float64Array(need);
      for (let i = 0; i < ops.length; i++) {
        const r = ops[i];
        for (let j = 0; j < OP_DOUBLES; j++) flat[i * OP_DOUBLES + j] = r[j] || 0;
      }
      M.HEAPF64.set(flat, buf >> 3);
      return { ptr: buf, count: ops.length };
    },
    // Runs ops [start, start + count) of the loaded buffer. Returns the parsed pg_exec_json.
    exec(ptr, start, count, nLabels) {
      pgExec(ptr + start * OP_BYTES, count, nLabels);
      return JSON.parse(pgExecJson());
    },
    // The answers of the last exec for one copy, as a Float64Array of `n` numbers (a copy of the memory).
    results(copy, n) {
      const p = pgResults(copy);
      if (!p || n <= 0) return new Float64Array(0);
      return Float64Array.from(M.HEAPF64.subarray(p >> 3, (p >> 3) + n));
    },
    // [customer, amount, day] of a row of the adaptive copy.
    row(id) {
      const p = pgRow(id);
      if (!p) return null;
      const a = M.HEAPF64.subarray(p >> 3, (p >> 3) + 3);
      return [a[0], a[1], a[2]];
    },
    state() {
      return JSON.parse(pgJson());
    },
    // The plan of op `index` of the loaded buffer.
    explain(ptr, index) {
      return pgExplain(ptr + index * OP_BYTES);
    },
    // True when the module has every function of spec 7.4.
    get ready() {
      return typeof M._pg_set_copies === "function" && typeof M._pg_row === "function" && typeof M._pg_results === "function";
    },
  };
  return bridge;
}

export async function loadBridge() {
  if (typeof globalThis.createMultiview !== "function") throw new Error("multiview.js did not load");
  const M = await globalThis.createMultiview();
  return makeBridge(M);
}
