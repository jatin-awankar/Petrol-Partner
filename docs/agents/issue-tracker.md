# Issue tracker: Local Markdown

Issues and specs for this repository live as Markdown files under `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The specification is `.scratch/<feature-slug>/spec.md`
- Implementation issues are separate files at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- Ticket numbers begin at `01`
- Triage state is recorded as a `Status:` line
- Comments are appended under a `## Comments` heading

## Publishing and reading

When a skill says “publish to the issue tracker,” write under the applicable `.scratch/<feature-slug>/` directory.

When a skill says “fetch the relevant ticket,” read the referenced Markdown file.

## Dependencies

Record dependencies as `Blocked by: NN, NN`. A ticket is unblocked when every referenced ticket has `Status: resolved`.

Claim work by setting `Status: claimed`. Resolve it by adding an `## Answer` section and setting `Status: resolved`.
