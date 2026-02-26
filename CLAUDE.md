# Agent Instructions

## Project Overview

monitoring is the observability infrastructure stack (SigNoz on GCP). Built with TypeScript and Pulumi.

- **Tier:** internal
- **Package:** `monitoring`

## Quick Reference

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Deploy | Push to `main` (CI runs Pulumi automatically) |

**Do not run Pulumi locally** — always deploy via CI by pushing to main.

## Architecture

```
infra/
  pulumi/      # Pulumi IaC (GCP resources, SigNoz, secrets)
docs/
  runbook.md   # Infrastructure runbook (secrets, sizing, destroy procedures)
```

## Standards & Guidelines

This project uses [@standards-kit/conform](https://github.com/progression-labs-development/standards-kit) for coding standards.

- **Config:** `standards.toml` (extends `typescript-internal` from the standards registry)
- **Guidelines:** https://progression-labs-development.github.io/standards/

Use the MCP tools to query standards at any time:

| Tool | Purpose |
|------|---------|
| `get_standards` | Get guidelines matching a context (e.g., `typescript pulumi`) |
| `list_guidelines` | List all available guidelines |
| `get_guideline` | Get a specific guideline by ID |
| `get_ruleset` | Get a tool configuration ruleset (e.g., `typescript-internal`) |

## Workflow

- **Branch:** Create feature branches from `main`
- **CI:** GitHub Actions runs Pulumi on push to `main`
- **Deploy:** Pulumi via CI (push to main triggers `pulumi up`)
- **Commits:** Use conventional commits (`feat:`, `fix:`, `chore:`, etc.)

## Project-Specific Notes

- See `docs/runbook.md` for detailed infrastructure operations (secrets, sizing, destroy procedures, SigNoz login)
- GCP project: `christopher-little-dev`, single environment
- Workload Identity Federation configured for GitHub Actions
- Secrets follow the pattern: `{project}-{name}-secret-{env}`
- Never run Pulumi locally — always use CI
