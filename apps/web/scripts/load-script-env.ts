const { loadEnvConfig } = require("@next/env") as {
  loadEnvConfig: (dir: string) => void;
};

let loaded = false;

export function loadScriptEnv() {
  if (loaded) {
    return;
  }

  loadEnvConfig(process.cwd());
  loaded = true;
}
