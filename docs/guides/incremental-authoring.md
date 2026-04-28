# Incremental Authoring

Use these checks when a change touches one workflow, component, test area, or document set and the atlas should move with it.

## One-seam update loop

1. Resolve the file or workflow you are changing:

   ```sh
   node packages/cli/dist/index.js resolve-path packages/cli/src/index.ts --path .
   ```

2. If no useful card owns the file, ask for a starter card:

   ```sh
   node packages/cli/dist/index.js suggest-card --path packages/cli/src/index.ts --root .
   ```

   Treat the output as a draft. Edit the title, summary, relations, and verification commands before committing it under `.agent-atlas/`.

3. Validate the atlas and generated docs:

   ```sh
   node packages/cli/dist/index.js validate .
   node packages/cli/dist/index.js generate markdown --path . --profile public --check
   ```

4. Check for stale maintenance signals:

   ```sh
   node packages/cli/dist/index.js diff --path .
   ```

5. Regenerate committed docs only after source atlas metadata is correct:

   ```sh
   node packages/cli/dist/index.js generate markdown --path . --profile public
   ```

## What `diff` is for

`atlas diff` is an authoring maintenance check. It reports changed atlas cards, changed generated docs, missing `code.entrypoints`, `code.paths` that no longer match files, missing package scripts referenced by verification commands, and generated docs that should be refreshed.

It does not replace `validate`, `boundary-check`, or project tests. Use it as the quick "did my atlas drift from the repo?" check before review.
