import { z } from "zod";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const names = ["monarch", "beru", "igris", "bellion", "tusk", "tank", "shadow-sovereign"] as const;
export type Shadow = typeof names[number];
const route = z.object({
  model: z.string().optional(), disabled: z.boolean().optional(),
  strategy: z.enum(["balanced", "cheap", "quality", "inherit"]).optional(),
  preferred: z.array(z.string()).optional(), min_context: z.number().int().positive().optional(),
  max_output_price: z.number().nonnegative().optional(),
  required_inputs: z.array(z.string()).optional(),
}).strict();
export const schema = z.object({
  show_banner: z.boolean().default(true), banner_every_session: z.boolean().default(false),
  disabled_shadows: z.array(z.enum(names)).default([]),
  disabled_hooks: z.array(z.enum(["arise-banner", "compaction-preserver", "todo-enforcer"])).default([]),
  agents: z.partialRecord(z.enum(names), route.partial()).default({}),
  routing: z.object({
    strategy: z.enum(["balanced", "cheap", "quality", "inherit"]).default("balanced"),
    route_primary: z.boolean().default(false),
    preferred: z.array(z.string()).default([]),
    allow: z.array(z.string()).default([]), deny: z.array(z.string()).default([]),
    min_context: z.number().int().positive().default(16000),
    max_output_price: z.number().nonnegative().optional(),
    allow_unknown_prices: z.boolean().default(true),
    quality: z.record(z.string(), z.number().min(0).max(100)).default({}),
    fallback_on_unavailable: z.boolean().default(true),
  }).default(() => ({ strategy: "balanced" as const, route_primary: false, preferred: [], allow: [], deny: [], min_context: 16000, allow_unknown_prices: true, quality: {}, fallback_on_unavailable: true })),
  compaction: z.object({preserve_todos: z.boolean().default(true)}).default(() => ({preserve_todos: true})),
}).strict();
export type Config = z.infer<typeof schema>;
export type Route = z.infer<typeof route>;

export function merge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])
      ? merge(out[k] as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out;
}
export function globalDirectory() { return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode"); }
export async function loadConfig(directory: string, options: Record<string, unknown>): Promise<Config> {
  let value: Record<string, unknown> = {};
  for (const file of [join(globalDirectory(), "opencode-arise-v2.json"), join(directory, ".opencode", "opencode-arise-v2.json")]) {
    try { value = merge(value, JSON.parse(await readFile(file, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`Invalid ARISE config ${file}`, { cause: error }); }
  }
  return schema.parse(merge(value, options));
}
export function enabled(config: Config, shadow: Shadow) { return !config.disabled_shadows.includes(shadow) && !config.agents[shadow]?.disabled; }
export function hookEnabled(config: Config, name: Config["disabled_hooks"][number]) { return !config.disabled_hooks.includes(name); }
