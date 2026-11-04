# Write and maintain documentation

[Documentation](../README.md) / Developers / Documentation

Documentation should help a reader complete a task or understand a boundary. Describe behavior that exists in the code, distinguish preview coverage from real-client testing, and keep version history separate from current instructions.

## Folder conventions

| Folder | Put here |
| --- | --- |
| `getting-started/` | Installation and the first successful use |
| `guides/` | Everyday tasks and decisions |
| `community/` | Connector setup, user downloads, uploads and website integration |
| `developers/` | Building, contributing, testing and releasing |
| `architecture/` | Component boundaries and end-to-end flows |
| `troubleshooting/` | Concrete symptoms, diagnosis and recovery |
| `reference/` | Precise paths, commands, protocol fields and vocabulary |
| `releases/` | Version-specific notes and historical context |

Use lowercase `kebab-case.md` filenames and descriptive titles. A README is an entry page, not a second copy of every guide. Add each page to the appropriate table in [the documentation home](../README.md).

## Page structure

Use one level-one title, a short breadcrumb back to documentation, a direct explanation of the task, then meaningful sections. Use numbered steps for sequences and tables for choices. Finish with related guides and source links when implementation details matter.

Keep commands copyable. Identify example domains, placeholder IDs, the working directory and actions that stop or modify a client. Prefer instructions that build and verify before offering installation/publication actions.

## Verify the facts

Check defaults in the bundle policy, accepted upload formats in the shared validator, paths in the runtime/setup code and release behavior in the actual release workflow. A UI label or old guide can be stale; do not copy it as proof.

Use stable relative links to repository files as **Source of truth**. For release-specific behavior, check the corresponding Git tag. Do not promise that a generic plugin works on every Discord build merely because it compiles.

## Keep links working

When moving a public document, keep a short guide at its old path that links to its replacement. Existing releases and external setup links can still reference uppercase legacy filenames. Update internal links and the release workflow's notes path at the same time.

Run:

```sh
pnpm docs:check
```

The local checker validates repository link targets, Markdown heading anchors, single page titles, reachability from the root README and release notes for the current package version. The documentation workflow runs it for relevant changes without installing dependencies or building Discord.

External websites are not fetched by this check. Verify newly added external resources separately; a local link check does not certify that a remote service exists or behaves as described. For nonstandard Markdown/HTML link syntax, inspect the rendered GitHub page as well.

## Scope a docs change

A guide update should not reset user settings, inject a build or republish installer binaries. If documentation uncovers a runtime bug, report it and keep the implementation change reviewable on its own.

[Contributing](../../.github/CONTRIBUTING.md) · [Project layout](project-layout.md)
