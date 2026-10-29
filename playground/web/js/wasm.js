// Typed wrapper around the Emscripten module: reset, op buffers, exec, state, explain.

const OP_DOUBLES = 16;
const OP_BYTES = OP_DOUBLES * 8;

// M is the module returned by createMultiview(). Separate from loadWasm so node tests can pass their own.
export function makeWasm(M) {
  const num8 = ["number", "number", "number", "number", "number", "number", "number", "number"];
  const pgReset = M.cwrap("pg_reset", null, num8);
  const pgExec = M.cwrap("pg_exec", null, ["number", "number", "number"]);
  const pgExecJson = M.cwrap("pg_exec_json", "string", []);
  const pgJson = M.cwrap("pg_json", "string", []);
  const pgExplain = M.cwrap("pg_explain", "string", ["number"]);
  let buf = 0;

  return {
    reset({ rows, seed, eagerness, maxIndexKb, rent, yoursMask }) {
      pgReset(rows | 0, seed | 0, eagerness, maxIndexKb | 0, rent, yoursMask[0] | 0, yoursMask[1] | 0, yoursMask[2] | 0);
    },
    // Copies the op records into wasm memory and frees the previous buffer.
    loadOps(ops) {
      if (buf) M._free(buf);
      const flat = new Float64Array(Math.max(ops.length, 1) * OP_DOUBLES);
      ops.forEach((op, i) => flat.set(op.slice(0, OP_DOUBLES), i * OP_DOUBLES));
      buf = M._malloc(flat.length * 8);
      M.HEAPF64.set(flat, buf >> 3);
      return { ptr: buf, count: ops.length };
    },
    exec(ptr, start, count, nLabels) {
      pgExec(ptr + start * OP_BYTES, count, nLabels);
      return JSON.parse(pgExecJson());
    },
    state() {
      return JSON.parse(pgJson());
    },
    explain(ptr, opIndex) {
      return pgExplain(ptr + opIndex * OP_BYTES);
    },
  };
}

export async function loadWasm() {
  if (typeof globalThis.createMultiview !== "function") throw new Error("multiview.js did not load");
  const M = await globalThis.createMultiview();
  return makeWasm(M);
}
