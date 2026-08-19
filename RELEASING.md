# Releasing Typography Stylist

How this plugin gets from a git commit to users' WordPress dashboards — and
why each piece exists. GitHub is the source of truth; WordPress.org is a
deploy target. This doc is GitHub-only (excluded from the distributed zip by
`.distignore`).

## 1. The mental model

```
main branch (git)
   │  you publish a GitHub Release with tag vX.Y.Z
   ▼
GitHub Actions (release-deploy.yml)
   │  npm ci → version guard → npm run build
   ▼
WordPress.org SVN  (https://plugins.svn.wordpress.org/typography-stylist)
   ├─ trunk/        ← rsync of the repo minus .distignore
   ├─ tags/X.Y.Z/   ← snapshot copied from trunk
   └─ assets/       ← synced from .wordpress-org/ (banners, icons, screenshots)
   ▼
wp.org serves the version named by readme.txt's `Stable tag`
```

Things that follow from this model:

- **`Stable tag` in readme.txt is the actual "go live" switch.** wp.org
  serves whatever version `Stable tag` names, from `tags/X.Y.Z/`. Committing
  to trunk does nothing user-visible until the Stable tag points at a tag
  that exists. This is also the #1 way releases go wrong (tag pushed, Stable
  tag forgotten, or vice versa) — which is why CI runs
  `scripts/check-versions.js` before every deploy.
- **SVN here is not version control — it's a delivery mechanism.** Never
  hand-edit SVN trunk anymore; the next CI deploy rsyncs over it (with
  deletion). History lives in git.
- **`.distignore` decides what ships.** Both the CI deploy and
  `npm run package` read it. Dev files (tests, configs, GitHub docs) never
  reach users; new production modules ship automatically.
- **The build happens in CI.** Minified JS/CSS and
  `blocks/typography-stylist/build/` are gitignored, so a plain checkout is
  not installable — `npm run build` in the workflow produces them before the
  rsync. (This is also why the GitHub repo zip download is NOT an installable
  plugin — point people at Releases instead.)

## 2. Why GitHub Releases, not GitHub Packages

GitHub **Packages** is a set of package registries — npm, Docker/OCI
containers, Maven, NuGet, RubyGems. A WordPress plugin zip is none of those;
it's a downloadable artifact tied to a version, which is exactly what a
GitHub **Release asset** is. So "Packages" on the repo page stays empty
forever, by design, and "Releases" fills up — one entry per version, with
human-written notes and an installable `typography-stylist.zip` attached.

## 3. One-time setup

### 3a. WordPress.org SVN credentials → GitHub secrets

The deploy workflows authenticate to wp.org SVN with two repository secrets.
Add them in the GitHub web UI (no CLI needed):

**Repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|---|---|
| `SVN_USERNAME` | `matthewneilcowan` |
| `SVN_PASSWORD` | your wp.org **SVN password** — see below |

**SVN password gotcha:** wordpress.org supports a separate SVN-specific
password so your main login never lives in CI (and it's *required* if the
account has 2FA enabled). Generate it at **profiles.wordpress.org → Edit
Profile → Account & Security → SVN password** *(verify the exact menu — this
UI has moved before)*. Use that value, not your login password.

> Timing note: add the secrets only **after** any in-flight manual SVN work
> is committed, so the first automated run starts from a clean SVN state.

### 3b. GitHub Actions settings

Repo → Settings → Actions → General: "Allow all actions and reusable
workflows" (or allowlist `10up/*` and `shivammathur/*`). The default
workflow permissions can stay **read-only** — `release-deploy.yml` requests
`contents: write` for itself to attach the zip.

## 4. Standard release checklist (stable)

1. **Bump the version in all four places** (check-versions.js enforces this):
   - `typography-stylist.php` — plugin header `Version:`
   - `typography-stylist.php` — `define('TYPOST_VERSION', ...)`
   - `readme.txt` — `Stable tag:`
   - `package.json` — `version`
2. **Rebuild the translation catalogues** if any user-facing string changed
   this cycle. The `.po`/`.pot` files are edited by hand; the compiled `.mo`
   and the JavaScript `.json` files are generated, and stale ones ship
   silently — nothing fails, translations just quietly stop updating.

   ```bash
   wp i18n make-mo languages languages
   wp i18n make-json languages languages --no-purge      --use-map='{"blocks/typography-stylist/edit.js":"blocks/typography-stylist/build/index.js"}'
   ```

   Notes that are easy to get wrong here:
   - **`--no-purge` is required.** Without it, make-json strips the JS strings
     out of the `.po` files it just read.
   - **Only `edit.js` needs mapping.** It is bundled into `build/index.js`.
     `assets/js/block-editor.js` needs no entry: WordPress always derives the
     translation filename from the *unminified* path, so one file serves both
     `block-editor.js` and `block-editor.min.js`.
   - **Check `X-Domain` is `typography-stylist`** in all three catalogues. It
     is what prefixes every generated `.json` filename, and a wrong value
     produces files WordPress will never look for. It has been wrong before.
   - Run the same commands in `glyphs-panel/`, `paragraph-styles/` and
     `variable-fonts/` if their strings changed — each module has its own
     domain and its own `languages/` directory.

   Confirm the result rather than assuming it: the new string should appear in
   the `.mo` (`wp i18n make-mo` reports the file count) and in the matching
   `languages/*.json`.

3. Add a changelog entry in `readme.txt` (recent releases) and move older
   entries to `changelog.txt` if the readme section is growing. Entries for
   not-yet-released fixes are parked in `changelog.txt` only (the wp.org
   listing renders readme.txt's whole Changelog section immediately via the
   assets sync, but changelog.txt never reaches the listing) — copy them
   into readme.txt now, under this release's heading.
4. Push to `main`; wait for **CI** to go green (it runs the version
   consistency check, both test suites, and a production build).
5. **GitHub → Releases → Draft a new release**: create tag `vX.Y.Z` on
   `main`, title it, write the release notes (users see these — the
   changelog entry is a good start). Leave "Set as a pre-release" UNCHECKED.
6. **Publish.** Watch the **Release Deploy** run in the Actions tab.
7. Verify: wp.org listing shows the new version; `typography-stylist.zip` is
   attached to the GitHub Release; install/update on a test site works.

Tag format is always `vX.Y.Z` (the workflow strips the `v` when comparing
against the plugin's version strings).

## 5. Beta releases

Betas live on GitHub only — wp.org has no beta channel and the deploy
workflow never touches SVN for a pre-release.

1. Bump plugin header, `TYPOST_VERSION`, and `package.json` to the **next**
   version (e.g. `2.2.0`). **Leave `Stable tag` at the current stable
   release** — the version guard fails the build if a beta tries to move it.
2. Draft a release with tag `vX.Y.Z-beta.N` (e.g. `v2.2.0-beta.1`) and
   **check "Set as a pre-release"**.
3. Publish. CI attaches an installable `typography-stylist.zip` to the
   pre-release; testers download and install it manually (Plugins → Add New
   → Upload Plugin). wp.org users are unaffected.

## 6. Hotfixes

If `main` has moved past the release you need to patch: branch from the
release tag (`git switch -c hotfix/2.1.2 v2.1.1`), cherry-pick or apply the
fix, bump to `X.Y.Z+1` in all four places, merge back to `main`, and release
as normal. If `main` hasn't diverged, a hotfix is just a small stable
release.

## 7. Readme / assets updates without a release

Every stable release already ships readme.txt and `.wordpress-org/` assets —
the release deploy rsyncs readme.txt into trunk + the tag and syncs
`.wordpress-org/` → `assets/`. This section is for updating those **between**
releases.

Edit `readme.txt` or files in `.wordpress-org/` (banners, icons,
screenshots), push to `main`, then run the workflow by hand: **Actions →
WP.org Readme/Assets Sync → Run workflow** (branch `main`). It updates
wp.org directly, no version bump needed. Use it for:

- Bumping `Tested up to:` after a new WordPress release (keeps the "Tested
  with your version of WordPress" badge accurate — do this at least each WP
  release; the directory derates listings that look stale).
- Readme typos or FAQ additions.
- Swapping screenshots. Files deleted from `.wordpress-org/` are deleted
  from wp.org `assets/` too (the sync is destructive by design — that's how
  stale junk gets cleaned out).

Screenshot conventions: `screenshot-N.png` (or .jpg) in `.wordpress-org/`,
captions come from the numbered list in readme.txt's `== Screenshots ==`
section (caption N ↔ screenshot-N). Banners: `banner-772x250.png` +
`banner-1544x500.png` (2x). Icons: `icon-128x128.png` + `icon-256x256.png`.

**Live Preview blueprint:** `.wordpress-org/blueprints/blueprint.json` powers
the "Live Preview" button on the wp.org plugin page. It boots the plugin in
WordPress Playground, downloads three OFL demo fonts from the google/fonts
GitHub repo (Style Script for swashes/stylistic sets, EB Garamond for swash
italic caps + a weight axis, Fraunces for custom SOFT/WONK variable axes),
installs them through the plugin's own font-kit pipeline via a `runPHP` step,
and lands in the editor on a demo post whose headline is pre-set in Style
Script with swashes enabled. It syncs to SVN `assets/blueprints/` like any
other asset. If the demo ever stops installing fonts, check that the
raw.githubusercontent.com font URLs inside the blueprint still resolve. To
test blueprint changes before pushing: paste the JSON after
`https://playground.wordpress.net/?storage=none#` (URL-encoded) in a browser
(`storage=none` forces a fresh boot instead of restoring your last
playground). After the first sync that includes it, a committer must flip
the "Live Preview" toggle on the plugin page once to enable the button for
visitors.

The workflow is manual-only on purpose. It used to auto-run whenever
readme.txt or `.wordpress-org/**` changed on `main`, but that trigger also
fired during release prep: §4 step 3 pushes the bumped readme (new `Stable
tag`, new changelog) to `main` *before* the GitHub Release is published, so
wp.org's trunk readme briefly advertised a version whose SVN tag didn't
exist yet. Since releases ship the readme and assets anyway, the only job
left for this workflow is deliberate out-of-band updates — and those are a
one-click manual run.

The workflow runs the 10up asset-update action with `IGNORE_OTHER_FILES:
true`, meaning it commits ONLY readme.txt and the assets — every other
difference between the repo and SVN trunk is deliberately ignored. This is
required, not optional: built files (`.min.js`, `blocks/*/build/`) are
gitignored, so from this workflow's plain checkout the trunk always looks
"modified", and without the flag the action refuses to deploy anything.
Trunk code is only ever updated by the release deploy workflow, which does
run the build.

## 8. Manual SVN fallback (emergency only)

If GitHub Actions is down or the pipeline is broken and a release can't
wait, deploy by hand. The old checkout lives at
`C:\wamp64\www\wordpress-plugins\typography-stylist` — treat it as
fallback-only; **never** edit trunk there day-to-day (the next CI deploy
rsyncs over trunk with deletion, discarding anything local).

```bash
cd C:\wamp64\www\wordpress-plugins\typography-stylist
svn update                       # sync the working copy first
# Build the exact file set locally:
cd <repo> && npm run build && node scripts/package.js --keep
# Mirror build/typography-stylist/* into the SVN trunk/ directory
# (copy over, then delete any trunk files not present in the staging dir)
svn status                       # review; svn add / svn rm as needed
svn commit -m "Release X.Y.Z"
svn copy https://plugins.svn.wordpress.org/typography-stylist/trunk \
         https://plugins.svn.wordpress.org/typography-stylist/tags/X.Y.Z \
         -m "Tagging version X.Y.Z"
```

Afterwards, create the matching GitHub Release (tag `vX.Y.Z`) anyway so
history stays consistent — but only after temporarily disabling the deploy
workflow or being comfortable with it re-deploying the same version
(re-deploying the same content is harmless; SVN just sees no changes, though
the tag copy will fail if the tag already exists — that's fine, the release
is already out).

## 9. On-demand builds (and why there's no nightly)

Need an installable zip from any branch without cutting a release?
**Actions → CI → Run workflow** (pick the branch) → download the
`typography-stylist-<sha>` artifact. Locally, `npm run package` produces the
same zip (add `--keep` to inspect the staged files in
`build/typography-stylist/`).

There is deliberately no scheduled nightly build: a nightly with no
consumers is CI noise, and the on-demand button plus `-beta.N` pre-releases
cover every real "give someone a build" case with better traceability.

## 10. Zip parity note

The zip attached to a GitHub Release and the zip wp.org serves are
**content-identical but not byte-identical**: wp.org builds its own archive
server-side from `tags/X.Y.Z` (different timestamps/ordering/compression).
If you ever need to compare them, unzip both and diff the trees — don't diff
the archives.

## Future work

- **E2E in CI**: the Playwright suite (`npm run test:e2e`) needs a live
  WordPress install; a `wp-env`-based job could run it in CI. Skipped for
  now to keep the pipeline simple.
- **Real 2x banner**: `.wordpress-org/banner-1544x500.png` is currently a
  copy of the 772×250 file, not a true retina banner — regenerate from
  source art when convenient.
