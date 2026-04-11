import { loadSeedEnvFromRepoRoot } from "./load-env";

loadSeedEnvFromRepoRoot();

process.env.SEED_SCENARIO = "demo";

void import("./seed");
