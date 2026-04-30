// Stub for server-only package when running scripts outside the Next.js runtime.
// Loaded via tsx --require to intercept the real server-only module before it throws.

const Module = require("module");
const path = require("path");

// Resolve the real server-only package path and register a no-op in the module cache.
let serverOnlyPath;
try {
  serverOnlyPath = require.resolve("server-only");
} catch (e) {
  // Not installed — nothing to stub
}

if (serverOnlyPath && !require.cache[serverOnlyPath]) {
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
    require,
    parent: null,
    children: [],
    path: path.dirname(serverOnlyPath),
    paths: [],
  };
}
