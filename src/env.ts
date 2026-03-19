import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import type { Env } from './types.js';

const DEFAULT_PORT = 3000;

export interface RuntimeConfig {
  env: Env;
  port: number;
  enableDailyNotification: boolean;
}

let dotenvLoaded = false;

function loadDotenvIfPresent(): void {
  if (dotenvLoaded) {
    return;
  }

  const candidates = [
    process.env.ENV_FILE,
    '.env',
    '.dev.vars',
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const filePath = path.resolve(candidate);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    dotenv.config({ path: filePath });
    dotenvLoaded = true;
    return;
  }

  dotenvLoaded = true;
}

function requireEnv(name: keyof Env): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT;
  }

  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

export function loadRuntimeConfig(): RuntimeConfig {
  loadDotenvIfPresent();

  return {
    env: {
      SLACK_BOT_TOKEN: requireEnv('SLACK_BOT_TOKEN'),
      SLACK_SIGNING_SECRET: requireEnv('SLACK_SIGNING_SECRET'),
      SLACK_NOTIFICATION_CHANNEL_ID: requireEnv('SLACK_NOTIFICATION_CHANNEL_ID'),
      OPENROUTER_API_KEY: requireEnv('OPENROUTER_API_KEY'),
      GOOGLE_CALENDAR_ID: requireEnv('GOOGLE_CALENDAR_ID'),
      GOOGLE_SERVICE_ACCOUNT_JSON: requireEnv('GOOGLE_SERVICE_ACCOUNT_JSON'),
    },
    port: parsePort(process.env.PORT),
    enableDailyNotification: parseBoolean(process.env.ENABLE_DAILY_NOTIFICATION, true),
  };
}
