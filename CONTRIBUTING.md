# Contributing

## Workflow

1. Create a branch from `main`: `git checkout -b fix/<short-description>`
2. Read `proje.md` and `AGENTS.md` first
3. Use the **Skill Seçimi** section in `AGENTS.md` to load relevant skills before any work
4. Make focused commits (`git commit -m "F3-1: vitest setup for server"`)
5. Open a PR targeting `main` — GitHub Actions will run typecheck, tests, and build for server, client, and agent
6. A code review by the owner is required for security-sensitive files (see CODEOWNERS)
7. After merge, the implementation is auto-deployed to Coolify

## Commit Convention

Use `Conventional Commits`:
- `feat(scope): short description` — new feature
- `fix(scope): short description` — bug fix
- `perf(scope): short description` — performance
- `test(scope): short description` — tests only
- `chore(scope): short description` — tooling, deps, docs
- `ci(scope): short description` — CI changes

Scopes we use: `server`, `client`, `agent`, `proto`, `db`, `ci`, `docs`.

## Coding Rules

- TypeScript strict mode for both server and client
- Server validates ALL input with Zod
- Never log secrets (use `pino` structured logging)
- Never commit `.env` (use `.example.env` as template)
- Never commit agent binary artifacts
- Do NOT install packages without justification (read existing deps first)

## Testing

- Server: Vitest (`cd server && npm test`)
- Client: Vitest + RTL (`cd client && npm test`)
- Agent: Go test (`cd agent && go test ./...`)
- All new business logic MUST have at least one unit test
- Security-sensitive routes (auth, alerts, admin) MUST have integration tests

## Audits & Security

This repo was audited on 2026-06-14 by 20 parallel agents. See `proje.md` §10 for findings. Critical issues were fixed in commits 829e400 onwards. Run a fresh audit every quarter.

## Destructive Operations

These MUST require explicit user confirmation and a recovery plan:
- Database migrations that drop columns or rename tables
- Deleting `agent/config.json` or any file with a real `apiKey`
- `git filter-repo` for secret history rewrite
- `npm uninstall` for a package that other code imports
- Force-push to `main`
