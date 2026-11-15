# Releasing

**Pull request → merge to `main` → publish to npm.** Merging is the approval. A release is just a pull request that changes the package version. When it merges, `.github/workflows/release.yml` publishes that version to npm with trusted publishing (OIDC, no npm token, provenance attached automatically). Then it creates the `v<version>` tag and a GitHub Release.

The published package is the repository root (`react-xlsx-viewer`). Only the files listed in `package.json` `files` are published (`index.js`, `README.md`, `LICENSE`).

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
npm run version-packages     # changeset version + lockfile sync
git diff                     # review the version bump and CHANGELOG.md
```

`npm run version-packages` runs `changeset version`, which:
- consumes the pending changesets,
- bumps `package.json`,
- writes `CHANGELOG.md`.

It then runs `npm install --package-lock-only`. Without that step, `package-lock.json` would still list the old version, and `npm ci` (in CI and in the release job) would fail.

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
1. runs `npm ci`, then `npm run typecheck`, `npm test` and `npm run build` when those scripts exist (none do yet),
2. runs `npm publish . --tag next|latest`,
3. runs `gh release create v<version>`, which creates the tag on the merge commit. The notes are that version's section of `CHANGELOG.md`.

The job also checks that npm is at least 11.5.1, which trusted publishing requires. Node 24 ships a newer npm.

Re-running the job is safe:
- After a failed publish, the version is still unpublished, so the re-run publishes.
- After a successful publish but a failed tag/Release step, the re-run skips publishing and creates the missing tag and Release.
- If everything already succeeded, the re-run does nothing.

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
