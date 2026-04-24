# Letrum

Letrum is a quiet desktop editor for writers who keep their manuscript as plain Markdown or text files.

Instead of forcing a single monolithic document, Letrum lets you keep scenes as separate files while editing them as one continuous manuscript.

## Why It Exists

Scrivener-style writing tools are comfortable for drafting, but they tend to fight with file-based workflows.

Letrum takes the opposite approach:

- scenes stay as regular `.md` and `.txt` files on disk
- the left sidebar acts like a lightweight binder
- selected scenes open together as one manuscript canvas
- scene order is stored directly in filenames with numeric prefixes

No project database is required.

## Current Features

- continuous manuscript view across multiple files
- multi-selection in the scene list
- `Select All` for opening the full draft
- auto-save on blur plus manual save
- create and delete scene files
- drag-and-drop reordering in the sidebar
- reorder persisted via filename prefixes like `001_`, `002_`, `003_`
- remembered last-opened folder
- word and character counts for the current selection or whole project

## How Scene Order Works

Letrum stores order in filenames instead of hidden metadata.

Example:

```text
001_opening.md
002_arrival.md
003_argument.md
```

When you reorder scenes, Letrum renames files to match the new order.

That keeps the structure visible in Finder, Git, and any other editor.

## Development

Requirements:

- Node.js
- Rust
- Tauri prerequisites for your platform

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run tauri dev
```

Build the frontend bundle:

```bash
npm run build
```

## Repository Layout

```text
src/         React UI
src-tauri/   Tauri + Rust shell and filesystem commands
testbook/    sample manuscript files for local testing
```

## Status

Letrum is early-stage and intentionally narrow in scope.

The current goal is simple:

- keep scenes as files
- edit them as one manuscript
- stay out of the writer's way
