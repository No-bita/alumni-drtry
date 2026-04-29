---
name: codexmap-runtime
description: Internal CodexMap runtime for turning a repository into a live architecture map and driving that map during walkthroughs. Prefer the embedded Available Commands section for normal use.
---


CodexMap is a repo-to-architecture-map workflow.

High-level model:

- snapshot the repository
- ask `claudemap-architect` to turn that snapshot into a detailed, human-legible graph
- render the graph in the bundled CodexMap UI
- keep the graph and presentation state updated as the user explores the codebase

Available operations:

- `setup-claudemap`: build or rebuild the map for the current repository
- `open-claudemap`: reopen the existing UI without rebuilding
- `create-map`: create or refresh a scoped subsystem map from the current root graph
- `refresh`: update the graph after code changes
- `explain`: run a guided walkthrough through the live map
- `show`: direct the live map for highlights, focus, presentation, and flows


If this skill is invoked directly, default to the setup workflow.

Target repository:

- If the user passed an argument to the invoked skill command, use `$ARGUMENTS` as the project root.
- If no argument was passed, use the current working directory.

Execution rules:

1. Resolve the bundled CodexMap workspace from `${SKILL_DIR}`.
2. Generate a raw repo snapshot by running `${SKILL_DIR}/skill/commands/snapshot.js` for the target project root.
3. Read `${SKILL_DIR}/skill/prompts/enrichment.txt`.
4. Use the `claudemap-architect` subagent explicitly. Give it:
   - the raw snapshot JSON
   - the graph schema contract from the enrichment prompt
   - instructions to return only valid graph JSON
   - instructions to optimize for a detailed graph with intuitive human grouping
5. **Wait for the subagent Task call to fully return**, then save the returned JSON to `${SKILL_DIR}/tmp/claudemap-enrichment.json`. Do not run the setup JS command until after this file has been written with non-empty valid graph JSON. Do not run setup in parallel with the subagent call.
6. Run `${SKILL_DIR}/skill/commands/setup-claudemap.js` for the target project root with `--enrichment-file ${SKILL_DIR}/tmp/claudemap-enrichment.json`. The setup command is strict: if the file is missing, empty, or unparseable it will exit non-zero and refuse to render a heuristic graph. Do not retry setup without fixing the enrichment file first.
7. Add `--force-refresh` only when the user explicitly asks for a fresh rebuild.
8. If the subagent fails to return valid JSON after two attempts, tell the user the architect pass failed and stop. Do not silently rerun setup without `--enrichment-file` — that would render a heuristic graph and pollute the cache. The user should rerun `setup-claudemap` once the architect issue is resolved.
9. Let the bundled launcher start the app unless the user explicitly asks not to.
10. Summarize the analyzed file count, system count, graph source, render transport, and app readiness. Runtime graph outputs land in `${SKILL_DIR}/app/public/graph/` (served by the bundled Vite app as `/graph/*`).
11. End the graph-generation flow with a short feedback prompt such as: `Does this map look right, or should I refine it?`
12. If the user says the map is good, stop there.
13. If the user asks for refinement, reuse the current target project's `claudemap-cache.json` graph and file snapshot as context when available instead of starting from a blank prompt again.
14. For refinement passes, send the existing graph plus the user's requested changes back through `claudemap-architect`, save the refined JSON to `${SKILL_DIR}/tmp/claudemap-enrichment.json`, and run `${SKILL_DIR}/skill/commands/refresh.js` with `--enrichment-file` so the graph iterates in place.
15. After the refined graph renders, ask the same short feedback prompt again.

`create-map` runs an architect-first scoped pipeline:

1. Resolve the target scope from the user's request (either a scope JSON payload copied from the UI, or a natural language description of a subsystem the architect should locate in the root graph).
2. Read `${SKILL_DIR}/skill/prompts/scoped-enrichment.txt`. This is a dedicated scoped prompt — do not reuse the root enrichment prompt.
3. Build a scoped snapshot by filtering the root graph's file list to the files inside the target subsystem. Include any prior scoped graph from the target map's `cachePath` when one exists so the architect can refine rather than rebuild.
4. Call the `claudemap-architect` subagent with the scoped snapshot, the scoped prompt, and any user instructions. Instruct it to emit a richer internal breakdown (2-6 internal subsystems, tighter edges, function nodes welcome) and to decide between edit-in-place and rebuild based on the intent of the request.
5. Save the returned JSON to `${SKILL_DIR}/tmp/claudemap-enrichment.json` and run `${SKILL_DIR}/skill/commands/create-map.js` with `--enrichment-file` (plus `--scope-json` and optional `--instructions`). The command deletes the tmp file after it reads it.
6. If the architect pass fails, the command can still fall back to `buildScopedGraphFromRoot` by running without `--enrichment-file`, but warn the user the scoped map will be a plain filter view and suggest rerunning with architect enrichment for richer grouping.
7. After the scoped map renders, ask the same short feedback prompt (`Does this map look right, or should I refine it?`).
8. If the user asks for refinement, reuse the scoped map's own cache as prior graph context (via `buildScopedSnapshot`'s `priorGraph` option) and rerun the architect. Save the refined JSON to the tmp file and rerun `create-map.js` with the same `--scope-json` payload plus `--enrichment-file`.
9. After the refined scoped graph renders, ask the same short feedback prompt again.

`refresh` is change-aware for scoped maps:

- The root graph is always diffed against the cached snapshot.
- For each scoped map, if none of its files were in the diff and its cached graph was produced by the architect (`meta.source === 'codex-scoped'`), the scoped map is preserved untouched — no rebuild, no filter fallback.
- If the scoped map's files were touched, it is rebuilt from the updated root graph filter and marked `needsRebuild: true` so the next `create-map` pass knows to rerun the architect for that scope.
- If a scope can no longer be resolved in the new root graph, it is marked `stale: true` and `needsRebuild: true` and left for the user to confirm.

Important details:

- The bundled runtime lives inside this skill directory, so keep all paths anchored to `${SKILL_DIR}`.
- `setup-claudemap` should treat the `claudemap-architect` path as the primary path, not an optional extra.
- The packaged project includes a `claudemap-architect` subagent in `.codex/agents/` for system identification, graph refinement, and human-first graph restructuring.
- If a cached Codex-authored graph already exists, do not replace it with a heuristic regeneration unless the user explicitly asks for `--force-refresh`.
- If the user only wants to reopen the existing map UI, use `open-claudemap` instead of rerunning setup.
- Follow-up refreshes should use the embedded `refresh` command docs in this skill.
- Graph refinements should prefer `${SKILL_DIR}/skill/commands/refresh.js --enrichment-file ...` over rerunning setup so the current graph context is reused.
- `show` should be treated as a presentation-direction command, not just a low-level transport wrapper.


## Codex Workflow

- Explicitly invoke this skill with `/skills` or by mentioning `$codexmap-runtime` when you need to force its use.
- Use `setup-claudemap` to build the root map.
- Use `refresh` after edits and `create-map` for scoped subsystem maps.
- Use `open-claudemap` only to reopen the UI without rebuilding the graph.
- For any graph-building step, produce architect JSON first, write it to `${SKILL_DIR}/tmp/claudemap-enrichment.json`, then run the matching command with `--enrichment-file`.
- Use `show` and `explain` against the currently active live graph. They are presentation tools, not rebuild paths.


## Subagent Invocation (Codex)

Any step in this skill that references `claudemap-architect` is a hard requirement to produce architect-quality enrichment JSON. Do NOT fall back to a heuristic graph built from the snapshot's folder structure - that pollutes the cache and gives the user a flat map.

There are two valid ways to produce that JSON in Codex. Pick one per step, based on the **snapshot size gate** defined below.

### Snapshot size gate

Read `totalFiles` and `totalLines` from the snapshot JSON before deciding.

- **Small repo fast path** - snapshot has `totalFiles <= 50` AND `totalLines <= 6000`:
  You MAY generate the graph inline yourself, acting as the architect. Follow the enrichment prompt and the JSON schema contract strictly. This avoids a full subagent round-trip, which in Codex often dominates wall time on tiny repos.
- **Larger repo** - snapshot exceeds either threshold:
  You MUST invoke the `claudemap-architect` custom agent by name. Do NOT generate the graph inline. The larger the repo, the more architect reasoning buys you over an inline pass, and inline passes are much more likely to omit files or flatten groupings at that size.
- **Scoped `create-map` passes**: always invoke the architect, regardless of size. The scoped prompt expects richer internal breakdowns that the inline path typically underfills.

Whichever path you pick, the output must be a single JSON object that conforms to the enrichment schema - no prose, no markdown fences, no commentary.

### Inline path (small repos)

1. Load the snapshot JSON, the enrichment prompt, and the graph schema contract from the paths the step specifies.
2. Produce the JSON directly. Hold yourself to the same rules the architect follows: cover every file node, prefer nested systems over sibling sprawl, keep summaries within the char budgets, only emit function nodes for navigation anchors.
3. Write the JSON to the tmp path the step specifies, then invoke the matching command with `--enrichment-file`.

### Subagent path (larger repos, scoped passes)

1. Invoke the `claudemap-architect` custom agent by name.
2. Pass it the full repository snapshot JSON and any prompt text or schema text the step specifies. For refinement or scoped passes, include the prior graph and the user's instructions.
3. Treat the final message as graph JSON only. If the architect emitted prose, markdown fences, or commentary, strip them; if the JSON is unparseable, re-run the architect rather than hand-editing.
4. Write the JSON to the tmp path the step specifies, then invoke the matching command with `--enrichment-file`.

Heuristic command-level fallbacks (e.g. `buildScopedGraphFromRoot`) only run when the architect pass fails AND the step explicitly documents a fallback. They are never the first choice, and you must warn the user the result will be a plain filter view.

## Scratch and Temporary Files

All scratch files this skill writes - snapshots, enrichment payloads, intermediate graphs - must live under the skill's own `tmp/` directory, which for Codex resolves to `.agents/skills/codexmap-runtime/tmp/` inside the target repo. The commands already build paths that way; do not redirect them elsewhere.

Codex's default sandbox treats `.agents/`, `.codex/`, and `.claude/` as configuration-owned and blocks writes on the first pass. When that happens, approve the elevated write for the skill's `tmp/` subdirectory and continue. Do NOT:

- redirect scratch output to the target repo's top-level directory (pollutes the project),
- write inside `.codex/` or `.claude/` themselves (never the right location for this skill),
- assume the block is permanent and fall back to an inline-only path that skips writing `claudemap-enrichment.json` (setup-claudemap needs that file to exist and pass `--enrichment-file`).

## Self-Location

The skill installs with a sibling `.claudemap-config.json` file inside its own directory (e.g. `.agents/skills/codexmap-runtime/.claudemap-config.json`). The runtime walks upward from each command entrypoint to find that config and resolves the skill root from it - you do not need to set an environment variable, and the config file is NOT at the repo root.

When a step references a path like `<skill-dir>/skill/commands/...`, resolve it through this config rather than guessing. If a command fails to locate the skill directory, that is the config to check, not `$CLAUDE_SKILL_DIR`.

## Available Commands

Codex has built-in slash commands, but this skill exposes the following operations through the skills system:

### setup-claudemap

Build a detailed architecture map for the current repository and open it in CodexMap.

**Usage:** `setup-claudemap [project-root]`

**Flags:**
- `--force-refresh` (boolean): Ignore the cached graph and rebuild from a fresh snapshot.
- `--no-render` (boolean): Update files without pushing the graph into the live app.
- `--start-app` (boolean): Start the bundled app server if it is not already running.
- `--open-browser` (boolean): Open the bundled app in a browser after the command finishes.
- `--stdio-mcp` (boolean): Force stdio MCP transport for this command.
- `--enrichment-file` (string): Read architect-generated graph JSON from this file.

### refresh

Refresh the bundled CodexMap graph for the current project after local code changes.

**Usage:** `refresh [project-root]`

**Flags:**
- `--force-refresh` (boolean): Ignore the cached graph and rebuild from a fresh snapshot.
- `--no-render` (boolean): Update files without pushing the graph into the live app.
- `--stdio-mcp` (boolean): Force stdio MCP transport for this command.
- `--enrichment-file` (string): Read architect-generated graph JSON from this file.

### open-claudemap

Open the bundled CodexMap app for the current project without rebuilding the graph.

**Usage:** `open-claudemap [projectRoot]`

**Flags:**
- `--open-browser` (boolean): Open the bundled app in a browser after the command finishes.
- `--start-app` (boolean): Start the bundled app server if it is not already running.

### create-map

Create or refresh a scoped CodexMap for a major subsystem and switch to it.

**Usage:** `create-map {"scope":{"rootSystemId":"...","rootSystemLabel":"...","ancestorPath":["..."]},"label":"...","summary":"..."} | <natural language scope description>`

**Flags:**
- `--scope-json` (string): Pass the scoped-map payload copied from the UI.
- `--map-id` (string): Override the scoped map id.
- `--no-activate` (boolean): Create or refresh the map without switching the active map.
- `--stdio-mcp` (boolean): Force stdio MCP transport for this command.
- `--enrichment-file` (string): Read architect-generated graph JSON from this file.
- `--instructions` (string): Pass user refinement instructions into the scoped architect prompt.

### show

Direct the live CodexMap session. Use it to focus the map, highlight architecture, present a step, compare regions, or show flow.

**Usage:** `show [intent]`

**Actions:**
- `show highlight <query>...`: Highlight one or more nodes and navigate to the primary node.
- `show clear-highlight`: Clear all node highlights.
- `show present <query>...`: Present one or more nodes with a caption and guidance.
- `show navigate <query>...`: Navigate to a node without highlighting.
- `show health <value>`: Toggle health overlay.
- `show mode <mode>`: Set presentation mode.
- `show caption <body>...`: Show a caption on the graph.
- `show clear-caption`: Clear the presentation caption.
- `show flow <queries>...`: Show a guided flow across multiple nodes.
- `show ask <query>...`: Ask an intent-driven question about the graph.

**Flags:**
- `--stdio-mcp` (boolean): Force stdio MCP transport for this command.

### explain

Explain part of the codebase by turning the live map into a guided walkthrough.

**Usage:** `explain [topic-or-click-context]`
