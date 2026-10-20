import type { Env } from './env.js';
import { loadEnv } from './env.js';

let runtimeEnv: Env | null = null;

export function setRuntimeEnv(env: Env): void {
  runtimeEnv = env;
}

export function getRuntimeEnv(): Env {
  if (!runtimeEnv) {
    runtimeEnv = loadEnv();
  }
  return runtimeEnv;
}
