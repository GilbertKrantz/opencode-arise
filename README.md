# OpenCode ARISE v2

A native-subagent port of [moinulmoin/opencode-arise](https://github.com/moinulmoin/opencode-arise), plus live-catalog model routing. Targets **OpenCode v2 SDK 2.0.24** (`@opencode/plugin`, not v1's `@opencode-ai/plugin`). This is an independent MIT-licensed port, not an upstream release.

## Install directly from this fork

On the `opencode-v2` branch, compiled JavaScript is committed so OpenCode can install the Git package with lifecycle scripts disabled. Add this entry to the existing `plugins` array in your native OpenCode v2 config:

```json
{
  "plugins": ["git+https://github.com/GilbertKrantz/opencode-arise.git#opencode-v2"]
}
```

Keep your existing plugins and provider configuration. Restart OpenCode, then ask Monarch to call `arise_models`. If your config retains v1 schema keys, its migration-compatible field is `plugin`; use a consistent schema rather than mixing the two fields.

## Install the downloaded package

Requires Node.js 22+ and OpenCode v2. These commands install a downloaded tarball; this package has **not** been published to npm.

```sh
mkdir -p ~/tools/arise-v2
cd ~/tools/arise-v2
npm init -y
npm install /path/to/opencode-arise-v2-0.2.0.tgz
./node_modules/.bin/opencode-arise-v2 install
./node_modules/.bin/opencode-arise-v2 doctor
```

Restart OpenCode. The v2 binary may be named `opencode` or `opencode2` depending on your installation. Verify the plugin with `opencode api get /api/plugin`, then ask Monarch: **“Call arise_models for beru and igris and explain the selections.”** Providers must already be connected in OpenCode. This plugin reuses those connections, including enterprise integrations; it does not capture credentials, sign in, or create a separate provider connection.

For only one project:

```sh
./node_modules/.bin/opencode-arise-v2 install --project /path/to/project
```

The installer preserves JSONC comments and unrelated settings, adds to v2's **`plugins`** array (or the migration-compatible `plugin` array when the document uses v1 schema keys), and backs up changed config. Keep the installed directory in place. `uninstall` unregisters the package and leaves your routing configuration/results intact. `--config FILE` selects an explicit OpenCode config file; `--project DIRECTORY` controls the project-level ARISE config location.

To develop from the source archive:

```sh
cd opencode-arise-v2
npm ci
npm test
node dist/cli.js install
```

## Shadow army

| Agent | Role | Default routing |
| --- | --- | --- |
| monarch | Primary orchestrator | Current session model; opt-in auto routing |
| beru | Codebase scout | Cheapest eligible model |
| igris | Implementation | Balanced |
| bellion | Planning | Global strategy; configure quality if desired |
| tusk | Frontend and UI | Balanced |
| tank | Documentation research | Cheapest eligible model |
| shadow-sovereign | Difficult debugging and architecture | Global strategy; configure quality if desired |

All seven profiles are registered as native OpenCode agents. Monarch delegates through OpenCode's **`subagent`** tool, using `background: true` for independent work. OpenCode owns child sessions, permission checks, foreground waits, background jobs, recovery and completion notifications. Continue a child with its returned `sessionID`; do not poll or duplicate background work.

ARISE adds a pre-execution hook that selects a model from the live catalog for each new shadow delegation. It passes the selection to the native tool's `model` parameter. There is no custom scheduler, polling loop, task store or completion notification system. Resume keeps the child's selected model unless the call explicitly supplies a model override. Other plugins' agents and native general/explore delegations remain untouched.

Read-only shadows deny built-in edits and shell commands. All shadows deny nested delegation. Native child permissions follow OpenCode's normal agent/global policy; ARISE does not automatically approve requests. Custom tools that perform undeclared writes still need their own safeguards. Writing agents share a checkout: delegate non-overlapping files or sequence their work.

## Dynamic model selection

Each delegation reads the catalog for the parent's actual project location. Only available, enabled, tool-capable, non-deprecated models meeting your context/modality/budget filters qualify. Connect or enable another model and the next delegation sees it without restarting ARISE. This means **dynamic selection among OpenCode's catalog**, not discovery of models absent from that catalog.

Policies:

- `cheap`: first match the ordered preference list, then minimize the worst catalog tier's input + output price. Unknown prices rank after known prices.
- `balanced`: ordered preferences, user-provided quality scores, then the current session model if eligible, then context window and release date.
- `quality`: ordered preferences, user-provided quality scores, then context window and release date. Context/release date are tie-breakers, **not measured intelligence**.
- `inherit`: retain the parent's eligible model and variant; otherwise use ranked candidates.

Price uses catalog USD per million tokens, not your effective subscription/SSO cost. Configure preferences for subscriptions or negotiated pricing. There is no extra LLM classifier call. You can assign your own quality scores; the plugin does not invent benchmarks.

Create `~/.config/opencode/opencode-arise-v2.json` (or `$XDG_CONFIG_HOME/opencode/opencode-arise-v2.json`):

```json
{
  "routing": {
    "strategy": "balanced",
    "route_primary": false,
    "min_context": 32000,
    "deny": ["*/deprecated-*"],
    "quality": {}
  },
  "agents": {
    "beru": {"strategy": "cheap"},
    "tank": {"strategy": "cheap"},
    "igris": {"preferred": ["YOUR_PROVIDER/YOUR_CODING_MODEL", "YOUR_PROVIDER/YOUR_BACKUP_MODEL"]},
    "bellion": {"strategy": "quality", "preferred": ["YOUR_PROVIDER/YOUR_REASONING_MODEL"]},
    "shadow-sovereign": {"model": "YOUR_PROVIDER/YOUR_REASONING_MODEL#YOUR_VARIANT"}
  }
}
```

Replace placeholders with exact selectors returned by `arise_models`; model IDs may contain additional `/` characters. `#variant` must exist in that model's catalog. Preferences support `*` globs; exact `model` entries are pins. `model: "auto"` removes the pin; `model: "inherit"` inherits the parent. `fallback_on_unavailable` defaults to true for configured pins; an explicit per-task model override always fails clearly if unavailable or blocked. Model pins do not bypass allow/deny/context/modality/price policy on shadow delegations.

`route_primary: true` chooses a Monarch model during prompt admission using the same policy and updates the session through `switchModel`. It can overwrite a manual `/models` selection on your next prompt. Leave it false to control Monarch through the normal picker. This port does not change the model halfway through a dispatched call.

Additional options:

- `routing.allow` / `routing.deny`: selectors or `*` globs. Deny wins.
- `routing.max_output_price` / `agents.NAME.max_output_price`: maximum output price across every catalog tier. Unknown-priced models are excluded when a ceiling is set.
- `routing.allow_unknown_prices`: false excludes models lacking prices, even without a ceiling.
- `agents.NAME.min_context`, `required_inputs`, `disabled`, `preferred`, `strategy`, `model`.
- `disabled_shadows`: list of the seven names. Disabling Monarch leaves OpenCode's default agent alone.
- `show_banner`, `banner_every_session`: show a transcript startup notice.
- `compaction.preserve_todos`: include TODO preservation instructions.
- `disabled_hooks`: `arise-banner`, `compaction-preserver`, `todo-enforcer`.

Precedence: global ARISE JSON → `.opencode/opencode-arise-v2.json` in the project → plugin `options`. Objects merge; arrays replace. Config is validated at startup and loaded once: **restart OpenCode after editing routing policy**. Model catalog reads remain live without a restart.

## Tools

| Tool | Owner | Purpose |
| --- | --- | --- |
| `subagent` | OpenCode | Delegate using `agent`, `description`, `prompt`; optional `background`, `sessionID`, `model` |
| `arise_models` | ARISE | Inspect the live catalog and explain selection; optional `shadow`, `required_inputs` |

Example prompts:

> Use Beru and Tank in the background to investigate independently. Wait for their native completion notifications, then have Bellion plan the fix and Igris implement it.

> Continue Igris's child session with the follow-up checks.

> Show which models you would use for Beru, Igris and Shadow Sovereign, with reasons.

The model should omit the native `model` argument unless you request an explicit override. The routing hook fills it automatically. Per-agent `required_inputs` filters model capabilities; `arise_models.required_inputs` previews additional requirements. Native delegation receives a scoped text prompt; reference accessible project paths when the child needs files.

## Behavior and migration

- The previous `arise_summon` and `arise_background*` tools are removed. Use native `subagent`, `background: true` and `sessionID` instead.
- Remove `background`, `output_shaping` and `output-shaper` from old ARISE configuration. Strict validation reports obsolete keys instead of silently ignoring them.
- Native lifecycle and cancellation behavior follow your installed OpenCode version. ARISE provides no additional timeout, concurrency limit, serialized-writer guarantee, cancellation endpoint or durable result ledger. Scope writes carefully.
- Native tool output, failures and background completion notifications remain intact. Read the child transcript through OpenCode for full context; ARISE does not truncate native results.
- Resume without a model override retains the child's model, even when catalog rankings change. A new child uses the refreshed catalog. Unavailable explicit selectors fail before execution; no automatic retry occurs after work starts.
- TODO and compaction preservation are model instructions. Compaction retains native child session IDs and outcomes; actual summarization belongs to OpenCode.
- The banner is a transcript notice. No separate TUI plugin is included.
- This port omits v1 build/plan model overrides and automatic hiding of native agents.

## Validation and compatibility

`npm test` builds against the pinned 2.0.24 SDK. Ten focused tests cover live catalog policy, variants, unavailable selectors, modality/budget filtering, native foreground/background routing input, preserved resume semantics, unrelated-agent isolation, primary routing, permission restrictions and installation.

The native OpenCode v2.0.24 server is tested against a local OpenAI-compatible mock provider. See `VALIDATION.md` for runtime results. No paid provider calls or enterprise credentials are used. `doctor` checks local configuration and SDK imports; verify `/api/plugin` and `arise_models` in your running installation.

## License and sources

MIT; original agent prompts credited in `NOTICE` and the original copyright retained in `LICENSE`.

- Upstream: https://github.com/moinulmoin/opencode-arise
- V2 plugins: https://opencode.ai/v2/docs/build/plugins
- V2 models: https://opencode.ai/v2/docs/models
