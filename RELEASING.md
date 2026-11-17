# Releasing

**Pull request → merge to `main` → publish to npm.** Merging is the approval. A release is just a pull request that changes the package version. When it merges, `.github/workflows/release.yml` publishes that version to npm with trusted publishing (OIDC, no npm token, provenance attached automatically). Then it creates the `v<version>` tag and a GitHub Release.

The published package is `packages/react-xlsx-viewer` (`react-xlsx-viewer`). The repository root is a private npm workspace with the package and `apps/playground`. Only the package's `dist/`, `README.md`, `LICENSE` and `package.json` are published.

## 1. Add a changeset to your pull request

Every pull request that changes the published package adds a changeset:

```sh
npx changeset
```

Pick `react-xlsx-viewer`, choose the bump (patch, minor, major) and write one line for the changelog. This creates a small Markdown file in `.changeset/`; commit it with your change. Pull requests that only touch docs or CI need no changeset.

Merging a pull request with only a changeset publishes nothing. The version doesn't change until a release pull request.

## 2. Cut a release pull request

When a release makes sense (Afzal or the team lead decides):

```sh
git switch -c release-<version> origin/main
npm run version-packages     # changeset version + version constant + lockfile sync
git diff                     # review the version bump and CHANGELOG.md
```

`npm run version-packages` runs `changeset version`, which:
- consumes the pending changesets,
- bumps `packages/react-xlsx-viewer/package.json`,
- writes `packages/react-xlsx-viewer/CHANGELOG.md`.

It then runs `scripts/sync-version.mjs`, which sets the `version` constant in `packages/react-xlsx-viewer/src/index.ts` to the new version (`changeset version` never edits source files). It fails if it can't find exactly one such constant, so renaming the constant can't silently break the sync. Last, it runs `npm install --package-lock-only`. Without that step, `package-lock.json` would still list the old version, and `npm ci` (in CI and in the release job) would fail.

Open the pull request. Its **Release dry run** CI job shows what merging would do. The "Release preview" step says which version would be published, or "no release". The job also runs `npm publish --dry-run` with the dist-tag that would be used.

## 3. Prereleases (pre mode)

The first real versions can go out as prereleases on the `next` dist-tag, so `npm install react-xlsx-viewer` keeps getting 0.0.1 (`latest`, the name reservation) until a final version is published.

```sh
npx changeset pre enter alpha     # or beta / rc; commit .changeset/pre.json
npm run version-packages          # e.g. 0.1.0-alpha.0, 0.1.0-alpha.1, ...
npx changeset pre exit            # when the final version is next
npm run version-packages          # e.g. 0.1.0
```

Any version with a prerelease part (`-alpha.1`, `-beta.0`, ...) is published with `--tag next` and marked as a prerelease on GitHub. A plain version (`0.1.0`) goes to `latest`.

## 4. What happens on merge

On every push to `main`, the `Release` job (environment `npm`, `main` only) runs `scripts/release-check.mjs`. It publishes only if **both** hold:

1. the package version differs from the previous commit (`HEAD~1`), and
2. `react-xlsx-viewer@<version>` is not on npm yet.

Otherwise it stops with "no release" in the job summary. That covers docs and feature merges, re-runs after a successful publish, and the current `0.0.1` (already on npm, and the version hasn't changed).

For a release, the job then:
1. runs `npm ci`, sets up openpyxl (part of the shared `release.yml`; this package's tests don't need it, but the step is kept so the file stays identical across the four repositories), then `npm run typecheck`, `npm test` and `npm run build` when those scripts exist (none do yet),
2. runs `npm publish . --tag next|latest`,
3. runs `gh release create v<version>`, which creates the tag on the merge commit. The notes are that version's section of `CHANGELOG.md`.

The job also checks that npm is at least 11.5.1, which trusted publishing requires. Node 26 ships a newer npm (11.x).

Re-running the job is safe:
- After a failed publish, the version is still unpublished, so the re-run publishes.
- After a successful publish but a failed tag/Release step, the re-run skips publishing and creates the missing tag and Release.
- Moving the package is not a release. When its `package.json` is new at its path (for example, moved from the repository root to `packages/<name>`) and that version is already on npm, nothing is published and no tag or GitHub Release is created.
- If everything already succeeded, the re-run does nothing.

### Recovery: run the release by hand

A re-run repeats the original push, so it can't help when the version is no longer "new" relative to `HEAD~1`. For example, the release job failed before publishing, and a fix for the job itself was merged afterwards. For that case, `release.yml` can also be started manually:

```sh
gh workflow run release.yml --ref main
```

(or Actions → Release → Run workflow, branch `main`.)

A manual run publishes the current version of `main` **if it is not on npm yet**, even when it did not change in the last commit. It also requires that version to have a `## <version>` section in the package `CHANGELOG.md`, that is, a version cut by `npm run version-packages`. Without one, the run fails with "manual run refused: CHANGELOG.md has no \"## <version>\" section …" and publishes and tags nothing, so a scaffold or hand-edited version can't be published by hand. If it is already on npm, nothing is published, and the run only creates the `v<version>` tag and GitHub Release if they are missing. npm errors other than "not found" still fail the job, as on a push. The run is limited to `main`, both by the job's `if` and by the `npm` environment's branch policy.

Trusted publishing checks the **workflow file name** (`release.yml`) and the environment (`npm`), not the event that started it. A manual run is the same file in the same environment, so it publishes exactly like a push. The tag and Release point at the commit that was built: the tip of `main` when the run started.

## 5. First release: one-time setup (Afzal)

Trusted publishing is configured on npmjs.com, not in this repository. **Do it on the same day as the first release merge**, because npm expires a trusted publisher config that goes unused for 2 days, and it doesn't validate the fields when you save.

1. npmjs.com → `react-xlsx-viewer` → Settings → **Trusted publishing** → GitHub Actions:
   - Organization or user: `securedeveloper`
   - Repository: `react-xlsx-viewer`
   - Workflow filename: `release.yml`
   - Environment: `npm`
2. Merge the release pull request and check that the `Release` job published.
3. Then, under package Settings → Publishing access, choose **Require two-factor authentication and disallow tokens**. Trusted publishing keeps working; tokens stop working.

The `npm` GitHub environment already exists and is limited to `main`. Error `ENEEDAUTH` or `E403` on publish usually means one of the four fields doesn't match exactly (it's case-sensitive).
