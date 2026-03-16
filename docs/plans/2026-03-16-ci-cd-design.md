# CI/CD with GitHub Actions + npm Publish — Design

## Summary

Set up GitHub repository, CI pipeline, and automated npm publishing for the `wow-combatlog-parser` library. Two GitHub Actions workflows: CI on push/PR, publish on git tag push.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Repository | Public, `diego3g/wow-combatlog-parser` | MIT-licensed, free npm publish for public packages |
| Package scope | Unscoped (`wow-combatlog-parser`) | Simpler imports, no collision risk |
| Version trigger | Git tag push (`v*`) | Explicit control, simple workflow |
| CI trigger | Push + PR to `main` | Catches regressions early |
| Workflow structure | Two separate files | Clear separation, easy to maintain |
| GitHub Release | Yes, auto-generated notes | Good visibility for consumers |
| Node version | 22 (single) | es2022 target, zero-dep library, no matrix needed |
| Package manager | pnpm | Already in use |

## Components

### 1. GitHub Repository

Create via `gh repo create diego3g/wow-combatlog-parser --public --source=. --push`.

### 2. package.json Metadata

Add missing fields:
- `author`: `"diego3g"`
- `repository`: `{ "type": "git", "url": "https://github.com/diego3g/wow-combatlog-parser" }`
- `homepage`: `"https://github.com/diego3g/wow-combatlog-parser#readme"`
- `bugs`: `{ "url": "https://github.com/diego3g/wow-combatlog-parser/issues" }`

### 3. CI Workflow (`.github/workflows/ci.yml`)

**Trigger:** Push to `main`, PR targeting `main`.

**Job:** Single job on `ubuntu-latest`:
1. Checkout
2. Setup pnpm via `pnpm/action-setup`
3. Setup Node 22 via `actions/setup-node` (with pnpm cache)
4. `pnpm install --frozen-lockfile`
5. `pnpm run typecheck`
6. `pnpm run test`
7. `pnpm run build`

### 4. Publish Workflow (`.github/workflows/publish.yml`)

**Trigger:** Tag push matching `v*`.

**Job:** Single job on `ubuntu-latest`:
1. Checkout
2. Setup pnpm + Node 22 (with `registry-url: https://registry.npmjs.org`)
3. `pnpm install --frozen-lockfile`
4. `pnpm run typecheck`
5. `pnpm run test`
6. `pnpm run build`
7. **Version check** — extract version from tag, compare with `package.json`. Fail on mismatch.
8. `npm publish` with `NODE_AUTH_TOKEN` from secrets
9. `gh release create` with `--generate-notes`

**Secrets:** `NPM_TOKEN` (npm automation token, stored in GitHub repo secrets). `GITHUB_TOKEN` is automatic.

### 5. Release Flow

```
1. Bump version in package.json
2. git commit -m "chore: bump to vX.Y.Z"
3. git tag vX.Y.Z
4. git push origin main --tags
5. CI runs on push → typecheck + test + build
6. Publish runs on tag → typecheck + test + build + npm publish + GitHub Release
```

Version-match check prevents "forgot to bump" mistakes.
