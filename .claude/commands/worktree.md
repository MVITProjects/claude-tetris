---
description: Create an isolated git worktree in .trees/ and execute the given instructions there
argument-hint: <instructions to execute in the new worktree>
allowed-tools: Bash(git worktree:*), Bash(git status:*), Bash(git branch:*), Bash(mkdir:*), Read, Edit, Write, Agent
---

# /worktree

Instructions to execute in an isolated worktree:

$ARGUMENTS

## Steps

1. **Pick a name.** Derive a short, descriptive kebab-case name (2–4 words, lowercase, `[a-z0-9-]` only) from the instructions above, e.g. `add-hold-piece` or `fix-wall-kick`. If `.trees/<name>` or a branch with that name already exists (`git worktree list`, `git branch --list <name>`), append a suffix like `-2`.

2. **Create the worktree** from the repository root:

   ```
   git worktree add .trees/<name>
   ```

   This creates branch `<name>` from the current HEAD. If the command fails, report the error and stop.

3. **Ensure `.trees/` is not tracked.** If `.trees/` is not in `.gitignore`, append it so the worktree contents never show up in the main checkout's `git status`.

4. **Execute the instructions inside the worktree only.** Launch a general-purpose subagent (Agent tool) whose prompt includes:
   - the full instructions above, verbatim,
   - the absolute path of the worktree (`<repo root>/.trees/<name>`),
   - a rule that ALL file reads, edits and shell commands must use that absolute path (run `git` with `-C <path>` or `cd` into it), and that it must never touch files in the main checkout,
   - the project's CLAUDE.md conventions (vanilla JS, no build step, no dependencies).

   The subagent should commit its work on the worktree's branch when done, unless the instructions say otherwise. Do not push or open a PR unless asked.

5. **Report back**: the worktree path, branch name, a short summary of what changed, and how to review or clean up:
   - review: `git -C .trees/<name> log --oneline main..HEAD`
   - merge: `git merge <name>`
   - remove: `git worktree remove .trees/<name>` then `git branch -d <name>`
