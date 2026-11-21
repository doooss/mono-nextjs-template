# Codex project instructions

The shared agent instructions live in [CLAUDE.md](CLAUDE.md) and the Markdown files it indexes under [`.claude/`](.claude/).

Before working in this repository:

1. Read `CLAUDE.md` completely and treat its rules, paths and session-start checks as your instructions.
2. Load only the `.claude/rules/*.md` files whose trigger matches the task.
3. The ship gate in `.claude/rules/agent-work.md` applies to you too. For step 2 (adversarial review), run the reviewer instructions in `.claude/agents/adversarial-reviewer.md` in a fresh context (a separate session or sub-agent that has not seen your implementation reasoning).
4. Follow `.claude/skills/ship-task/SKILL.md` when finishing a task.

Do not copy the `.claude` rule bodies into `.codex`; one canonical source prevents the Claude and Codex instructions from drifting.
