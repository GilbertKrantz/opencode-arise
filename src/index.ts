import { Agent, Plugin } from "@opencode/plugin";
import { z } from "zod";
import { enabled, hookEnabled, loadConfig, names, type Shadow } from "./config.js";
import { SHADOW_AGENTS } from "./shadows.js";
import { selectModel, selector } from "./router.js";

export default Plugin.define({
  id: "opencode-arise-v2",
  async setup(ctx) {
    const config = await loadConfig(ctx.location.directory, ctx.options);
    let bannerShown = false;
    await ctx.agent.transform(editor => {
      for (const shadow of names) {
        if (!enabled(config, shadow)) continue;
        const source = SHADOW_AGENTS[shadow]!;
        editor.update(shadow, agent => {
          agent.name = Agent.Name.make(shadow); agent.description = source.description;
          agent.mode = source.mode; agent.hidden = false; agent.steps = source.steps;
          agent.system = source.prompt + (shadow === "monarch" ? "\nUse the native subagent tool for all delegation. Set background=true only for independent work. OpenCode notifies you when background children finish: do not poll, sleep, or duplicate their work. Use the returned sessionID to continue a child. Use arise_models to explain live model routing; omit model unless the user explicitly requests one. Never summarize failures as success. Writers share a checkout: scope files and avoid conflicting edits." : "\nReturn changed files, verification, findings, and unresolved errors. Do not summon other shadows. Ask before using tools that need approval.");
          if (shadow !== "monarch") agent.permissions.push({action:"subagent",resource:"*",effect:"deny"});
          if (["beru", "tank", "bellion", "shadow-sovereign"].includes(shadow)) {
            agent.permissions.push(...["edit", "write", "apply_patch", "bash", "shell"].map(action => ({action, resource: "*", effect: "deny" as const})));
          }
        });
      }
      if (enabled(config,"monarch")) editor.default("monarch");
    });
    await ctx.tool.transform(editor => {
      editor.add({name:"arise_models",description:"Inspect the live connected model catalog and explain the routing decision for a shadow; no model call is made.",input:z.object({shadow:z.enum(names).default("igris"),required_inputs:z.array(z.string()).default([])}),
        execute:async (input,context) => {
          const session = await ctx.session.get({sessionID:context.sessionID});
          const models = (await ctx.model.list({location:{directory:session.location.directory}})).data;
          const decision = selectModel(models,config,input.shadow,session.model,undefined,input.required_inputs);
          return {content:JSON.stringify({selection:selector(decision.model),reason:decision.reason,candidates:decision.candidates,models:models.filter(m=>m.enabled).map(m=>({selector:`${m.providerID}/${m.id}`,tools:m.capabilities.tools,inputs:m.capabilities.input,context:m.limit.context,cost:m.cost,variants:m.variants.map(v=>v.id)}))})};
        }});
    });
    // Native execution owns permissions, child sessions, jobs and notifications.
    // Route new shadow calls without modifying the shared agent registry.
    await ctx.tool.hook("execute.before", async event => {
      if (event.tool !== "subagent" || !event.input || typeof event.input !== "object") return;
      const input = event.input as Record<string, unknown>;
      const shadow = input.agent;
      if (typeof shadow !== "string" || shadow === "monarch" || !names.includes(shadow as Shadow) || !enabled(config, shadow as Shadow)) return;
      const explicit = typeof input.model === "string" && input.model !== "" ? input.model : undefined;
      // Resume keeps the native child's selected model unless explicitly overridden.
      if (input.sessionID && !explicit) return;
      const parent = await ctx.session.get({sessionID:event.sessionID});
      const models = (await ctx.model.list({location:{directory:parent.location.directory}})).data;
      const decision = selectModel(models,config,shadow as Shadow,parent.model,explicit);
      event.input = {...input,model:selector(decision.model)};
    });
    await ctx.session.hook("context",event=> {
      if (!names.includes(event.agent as Shadow)) return;
      if (event.agent !== "monarch") {
        for(const name of Object.keys(event.tools)) if(name.startsWith("arise_") || name === "task" || name === "subagent") delete event.tools[name];
      } else {
        if (hookEnabled(config,"todo-enforcer")) event.system.push({type:"text",text:"[ARISE] Keep structured TODOs current. Before stopping, resolve pending items or explain the blocker; check verification and delegated errors."});
      }
    });
    if (hookEnabled(config,"compaction-preserver")) await ctx.session.hook("compaction",event=> {
      if (!names.includes(event.agent as Shadow)) return;
      event.system.push({type:"text",text:`[ARISE] Preserve decisions, assumptions, changed paths, verification commands, failures, native child session IDs and delegation outcomes.${config.compaction.preserve_todos ? " Preserve every TODO and its status." : ""}`});
    });
    if (config.routing.route_primary || config.show_banner) await ctx.session.hook("prompt",async event=> {
      const session = await ctx.session.get({sessionID:event.sessionID});
      if (session.parentID || (session.agent && session.agent !== "monarch")) return;
      if (config.routing.route_primary && enabled(config,"monarch")) {
        const inputs = event.prompt.files?.some(file => /\.(png|jpe?g|gif|webp)(?:[?#]|$)/i.test(file.uri)) ? ["image"] : [];
        const route = selectModel((await ctx.model.list({location:{directory:session.location.directory}})).data,config,"monarch",session.model,undefined,inputs);
        await ctx.session.switchModel({sessionID:event.sessionID,model:route.model});
      }
      if(config.show_banner && hookEnabled(config,"arise-banner") && (!bannerShown || config.banner_every_session)) {
        bannerShown = true;
        await ctx.session.synthetic({sessionID:event.sessionID,text:"ARISE! Shadow army ready. Use arise_models to inspect available models."});
      }
    });
  },
});
