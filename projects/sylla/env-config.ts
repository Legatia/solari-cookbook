import * as nextEnv from "@next/env";

const nextEnvCompat = nextEnv as typeof nextEnv & { default?: typeof nextEnv };
const loadEnvConfig =
  nextEnvCompat.loadEnvConfig ?? nextEnvCompat.default?.loadEnvConfig;

if (!loadEnvConfig) throw new Error("Unable to load Next.js environment files.");
loadEnvConfig(process.cwd());
