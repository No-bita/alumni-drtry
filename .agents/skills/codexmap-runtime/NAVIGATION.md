# CodexMap Navigation

## Quick Start

1. Use `/skills` or mention `$codexmap-runtime`, then run `setup-claudemap`
2. Ask the assistant to explain a system, file, or flow
3. Run `refresh` after edits

## Public Commands

Codex supports built-in slash commands, but CodexMap is exposed through the skills system rather than custom slash-command files.
Use `/skills` or mention `$codexmap-runtime` to invoke it explicitly.
(See the "Available Commands" section of SKILL.md for supported operations):

- `setup-claudemap`: build a detailed architecture map for the current project
- `open-claudemap`: reopen the existing map UI without rebuilding the graph
- `create-map`: create or refresh a scoped subsystem map from the current root graph
- `refresh`: refresh the current graph after code changes
- `explain`: run a guided walkthrough against the live graph
- `show`: direct the live map for focus, highlights, presentation, health, and flow

## Mental Model

CodexMap works in three stages:

1. Snapshot the repository
2. Ask `claudemap-architect` for a detailed, human-intuitive graph
3. Render and control that graph in the bundled UI

## Internal Runtime Layout

- `.agents/skills/codexmap-runtime/SKILL.md`: internal runtime skill definition
- `.agents/skills/codexmap-runtime/skill/commands/`: Node command entrypoints
- `.agents/skills/codexmap-runtime/skill/lib/`: shared runtime libraries
- `.agents/skills/codexmap-runtime/skill/prompts/`: enrichment prompt assets
- `.agents/skills/codexmap-runtime/app/`: bundled map app
- `.codex/agents/claudemap-architect.toml`: bundled architecture-mapping subagent
