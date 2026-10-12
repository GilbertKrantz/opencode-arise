import { Model } from "@opencode/plugin";
import type { Config, Route, Shadow } from "./config.js";

export function matches(pattern: string, value: string) {
  return new RegExp("^" + pattern.split("*").map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(value);
}
export type Ref = {providerID: string; id: string; variant?: string};
export interface CatalogModel {providerID: string; id: string; enabled: boolean; status: string; capabilities: {tools: boolean; input: readonly string[]}; limit: {context: number}; variants: readonly {id: string}[]; cost: readonly {input: number; output: number}[]; time: {released: number};}
export function selector(model: Ref) { return `${model.providerID}/${model.id}${model.variant ? `#${model.variant}` : ""}`; }
export interface Selection { model: Model.Ref; reason: string; candidates: number; }
export function selectModel(models: readonly CatalogModel[], config: Config, shadow: Shadow, inherited?: Ref, override?: string, requirements: string[] = []): Selection {
  const policy: Route = config.agents[shadow] ?? {};
  const strategy = policy.strategy ?? (["beru", "tank"].includes(shadow) ? "cheap" : config.routing.strategy);
  const minContext = policy.min_context ?? config.routing.min_context;
  const ceiling = policy.max_output_price ?? config.routing.max_output_price;
  const required = [...new Set(["text", ...policy.required_inputs ?? [], ...requirements])];
  const candidates = models.filter(m => {
    const key = `${m.providerID}/${m.id}`;
    if (!m.enabled || m.status === "deprecated" || !m.capabilities.tools || !required.every(i => m.capabilities.input.includes(i)) || m.limit.context < minContext) return false;
    if (config.routing.allow.length && !config.routing.allow.some(p => matches(p, key))) return false;
    if (config.routing.deny.some(p => matches(p, key))) return false;
    if (!m.cost.length && (!config.routing.allow_unknown_prices || ceiling !== undefined)) return false;
    return ceiling === undefined || m.cost.every(t => t.output <= ceiling);
  });
  const find = (ref: Ref) => candidates.find(m => m.providerID === ref.providerID && m.id === ref.id && (!ref.variant || m.variants.some(v => v.id === ref.variant)));
  const exact = override ?? policy.model;
  if (exact && exact !== "auto" && exact !== "inherit") {
    const ref = Model.Ref.parse(exact);
    if (find(ref)) return {model: ref, reason: "explicit model", candidates: candidates.length};
    if (override || !config.routing.fallback_on_unavailable) throw new Error(`Model ${exact} is unavailable or violates routing policy`);
  }
  if ((exact === "inherit" || strategy === "inherit") && inherited && find(inherited)) return {model: Model.Ref.parse(selector(inherited)), reason: "inherited session model", candidates: candidates.length};
  if (!candidates.length) throw new Error(`No enabled tool-capable model satisfies routing policy for ${shadow}. Connect a provider or adjust filters.`);
  const preferred = policy.preferred ?? config.routing.preferred;
  const priority = (m: CatalogModel) => { const i = preferred.findIndex(p => matches(p, `${m.providerID}/${m.id}`)); return i < 0 ? preferred.length : i; };
  const price = (m: CatalogModel) => m.cost.length ? Math.max(...m.cost.map(t => t.input + t.output)) : Infinity;
  const quality = (m: CatalogModel) => config.routing.quality[`${m.providerID}/${m.id}`] ?? 0;
  candidates.sort((a, b) => {
    const preference = priority(a) - priority(b);
    if (preference) return preference;
    if (strategy === "cheap") { const p = price(a) - price(b); if (!Number.isNaN(p) && p) return p; }
    const q = quality(b) - quality(a);
    if (q) return q;
    if (strategy !== "quality" && inherited) {
      const ai = a.id === inherited.id && a.providerID === inherited.providerID;
      const bi = b.id === inherited.id && b.providerID === inherited.providerID;
      if (ai !== bi) return ai ? -1 : 1;
    }
    return b.limit.context - a.limit.context || b.time.released - a.time.released || `${a.providerID}/${a.id}`.localeCompare(`${b.providerID}/${b.id}`);
  });
  const chosen = candidates[0]!;
  const reason = `${strategy}; preference rank ${priority(chosen)}; configured quality ${quality(chosen)}; context ${chosen.limit.context}; ` + (chosen.cost.length ? `catalog input+output price ${price(chosen)}` : "price unknown");
  return {model: Model.Ref.parse(`${chosen.providerID}/${chosen.id}`), reason, candidates: candidates.length};
}
