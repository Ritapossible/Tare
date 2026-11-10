// The one definition of a settlement hash in Node code. web/assets/render.js keeps its own copy
// (the static site cannot import from src/); test/audit2.test.js asserts the two stay identical.
export const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
export const isTxHash = (v) => typeof v === "string" && TX_HASH.test(v);
