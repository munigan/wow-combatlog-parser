---
description: Release a new version (patch, minor, or major)
---

Release a new version of @munigan/wow-combatlog-parser.

The bump type is: $ARGUMENTS (default to "patch" if empty).

## Steps

1. **Verify the working tree is clean** — run `git status` and abort if there are uncommitted changes.

2. **Run the full verification suite** before releasing:
   - `pnpm run typecheck`
   - `pnpm run build`
   - `pnpm run test`
   If any step fails, stop and report the error. Do NOT proceed with a release.

3. **Bump the version** in `package.json` using `npm version $ARGUMENTS --no-git-tag-version` (patch, minor, or major). Read back the new version from package.json after bumping.

4. **Commit and tag**:
   ```
   git add package.json
   git commit -m "chore: release vX.Y.Z"
   git tag vX.Y.Z
   ```

5. **Push to origin with tags**:
   ```
   git push origin main --tags
   ```

6. **Report the result**: show the new version, the tag, and remind that the Publish workflow on GitHub Actions will handle npm publish + GitHub Release automatically via OIDC trusted publishing.
