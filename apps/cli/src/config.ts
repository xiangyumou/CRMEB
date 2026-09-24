import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Where `shop login` keeps the shop's address and the token:
 * `$XDG_CONFIG_HOME/shop/config.json` (default `~/.config/shop/`), readable by
 * the owner only. `SHOP_ORIGIN` / `SHOP_TOKEN` override it, for a CI job or a
 * one-off against another shop.
 */
export interface ShopConfig {
  origin: string;
  token: string;
}

export function configPath(): string {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'shop', 'config.json');
}

export async function loadConfig(): Promise<ShopConfig | null> {
  let saved: Partial<ShopConfig> = {};
  try {
    saved = JSON.parse(await readFile(configPath(), 'utf8')) as Partial<ShopConfig>;
  } catch {
    // no file yet — the environment may still carry both
  }
  const origin = process.env.SHOP_ORIGIN || saved.origin;
  const token = process.env.SHOP_TOKEN || saved.token;
  return origin && token ? { origin, token } : null;
}

export async function saveConfig(config: ShopConfig): Promise<string> {
  const file = configPath();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  // `mode` only applies when the file is created; tighten an older one too.
  await chmod(file, 0o600);
  return file;
}

export async function clearConfig(): Promise<void> {
  await rm(configPath(), { force: true });
}
