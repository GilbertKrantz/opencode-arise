# Validation — OpenCode ARISE v2 0.2.0

Validated 2026-10-11 UTC against @opencode/plugin 2.0.24 and the native @opencode/cli 2.0.24 Linux executable.

- Strict TypeScript build passed; 10 focused Node tests passed.
- Routing tests cover live catalog changes, policies, prices, context, modalities, variants and unavailable explicit overrides.
- Native hook tests preserve background input, resume selections, unrelated agents and permission restrictions. Routing creates no sessions, jobs or plugin task records.
- Actual v2 server reported the plugin active and all seven shadow profiles registered.
- A mock model invoked the native subagent tool through the real execution pipeline. The ARISE execute.before hook supplied smoke/mock-model. Foreground Beru returned completed with smoke-success.
- Native background Beru returned running immediately and its child session subsequently succeeded and OpenCode delivered the native completion notification to the parent.

ARISE no longer includes a task manager, scheduler, output truncator or completion notification emitter. Native result metadata and child transcripts are retained by OpenCode. No paid model calls were made; enterprise SSO and actual model quality were not evaluated. The opencode-v2 branch includes compiled output for Git installation with lifecycle scripts disabled.
