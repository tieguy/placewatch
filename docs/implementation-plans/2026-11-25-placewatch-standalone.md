# placewatch standalone — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the fork `tieguy/sfedits` into the standalone public project `tieguy/placewatch` — one branch (`main`), GitHub Issues, a new Toolforge tool, and docs an own-instance operator can follow — with the human-in-the-loop batched into seven named sittings.

**Architecture:** Six ordered phases from the approved design: settle the code (merge the design branch), make the GitHub repo standalone, move Lific issues to GitHub Issues, write the instance guide, build the new tool *by following that guide*, finish the docs. Every push to the deploy branch deploys within 15 minutes, so every outward-facing action is gated on the operator's explicit go — but pushes batch into phase-level goes so the operator is rarely the blocker.

**Tech Stack:** Node 22, mocha/chai/nock, Express, MariaDB (ToolsDB), Toolforge build service + jobs API, `gh` CLI, `sonar` CLI, Lific MCP tools, Toolhub API.

**Spec:** `docs/design-plans/2026-11-12-placewatch-standalone.md` — approved in Plannotator 2026-11-22, updated 2026-11-25 (Miami gate met, Miami secret added, SonarQube already onboarded). Executors read both. The August runbook `docs/design-plans/2026-08-15-placewatch-migration.md` remains the reference for cutover mechanics that are *not* in the instance guide.

**Approaches (from the spec):** A — guide first, then build the new tool from the guide *(chosen by the operator)*; B — migrate everything first, document last *(rejected: the guide would be untested)*; C — split repo work from the Toolforge move *(rejected: the README would contradict the live site)*.

**State this plan starts from (verified 2026-11-25, post-checker):** `integration` at `83ff363` (= `fork/integration`, no deploy gap); `miami-bot` merged; `scripts/rank.js` and `scripts/reassess.js` region-aware with `regions/{sfba,miami}.json`; `lib/dump-reader.js` still branch-only; `README-FOR-OTHER-CITIES.md` already committed and accurate (the spec's Phase 1 step 6 is done and dropped); the three `scripts/find-*.js` helpers already send compliant User-Agents through `lib/mw-api.js` (the spec's SFED-32 code fix is done; only the Lific closure remains); 22 open Lific issues to migrate (including SFED-42); SonarQube project `tieguy_sfedits` onboarded with a GitHub Actions workflow (`.github/workflows/sonar.yml`) that this plan removes per the minimal-GitHub constraint. SFED-40 (Miami launch) is still `active` and belongs to the Miami session, not this plan.

## For your review

The four hardest calls in this plan, each with the alternative:

1. **The SonarQube workflow the Miami session added gets removed.** `.github/workflows/sonar.yml` and its `SONAR_TOKEN` secret violate the minimal-GitHub rule you set in the design review. The plan first tries SonarCloud *automatic analysis* (a SonarCloud-side feature, not repo CI) and falls back to local `sonar analyze` scans. Alternative: keep the workflow — it also runs `npm test` in CI, which the design explicitly gave up.
2. **Merge policy: integration wins on the ranking code.** Miami's region-aware `rank.js`/`reassess.js` supersede the branch's versions; the branch contributes `lib/dump-reader.js` (rewired to `wmFetch`), `wikidata/onwiki/`, and its docs; `test/reassess-api.test.js` is dropped (it tests an export integration removed). Alternative: honor the branch's versions and rebase Miami onto them — more work, no gain.
3. **Rollback never restarts the old tool's autoupdate.** After the tool-name commit, `main`'s head is unsafe for the old tool (it would point the old bot at the new webservice and an unreachable database), and autoupdate cannot be pinned to a SHA. The old tool runs frozen at its last image until a failure is understood. Alternative: envvar overrides — they change the repo/branch, not the commit, so they don't solve it.
4. **Issue numbers resolve in a second pass.** Issues are created in SFED order (predictable but not guaranteed, since the repo already consumed PR numbers #1–#2), then cross-references in the bodies are patched with the real numbers and you spot-check the final map. Alternative: pause between creation and body-patching for a full re-approval — slower, and the bodies are already approved modulo placeholders.


## Global Constraints

- **Minimal GitHub dependence** [operator]: GitHub for git hosting and Issues only. No GitHub Actions, no `.github/` files, no Actions secrets, no branch protection, Discussions, Projects or Pages. SonarQube Cloud *automatic analysis* is a SonarCloud-side feature, not repo CI, so trying it (Task 10) does not violate this.
- **Every push to the deploy branch is a deploy** (≤15 min, autoupdate). No push, GitHub settings change or Toolforge action without the operator's explicit go (**[GO]** steps); a sitting-level go counts, because the agent presents the exact commit and command list it covers.
- **Two-tick rule:** the autoupdate tick that ships a change to `REPO_URL`/`BRANCH` defaults still runs the old script; only the next tick uses the new defaults. Verify via the autoupdate job log, not the changelog, when the polled commit is unchanged.
- `npm test` green **before** every commit: `mocha --colors --reporter spec --exit --ignore 'test/helpers/**' 'test/**/*.js'` (quote the glob). DB-backed suites report *pending* without the container: `npm run test:db:start` first; `SFEDITS_REQUIRE_DB=1` makes an unreachable DB a failure.
- **SonarQube gate (the repo is already onboarded, `.sonar-config.json`, project `tieguy_sfedits`):** run `sonar analyze secrets` over changed files before each commit; after each push, check new-code issues. BLOCKER/HIGH findings *introduced by this plan's changes* are must-fix. Pre-existing findings (the SFED-42 backlog) are SFED-42's scope, not this plan's.
- No Wikimedia call from new or merged code outside `lib/mw-api.js` (the merge adapts `lib/dump-reader.js` accordingly — Task 2). Serial requests only.
- Nothing private gets committed: no `*.ts.net` or `linear.app` URLs, no ToolsDB credentials, no secret values. Secret **values** never appear in agent sessions — verify envvars by name only.
- Names: repo/tool/software/UA components become `placewatch`; the SF account's `"nick": "sfedits"` and all `SFEDITS_*` envvar names stay.
- Scheduling: Phase 5 (Tasks 14–17) must not share a window with SFED-1's phase-3 cutover, if that project is running.
- Commit style: `Co-Authored-By: Claude` trailer, as on these branches.

## Review Focus

The five ways this project most likely fails, each pinned to the task that owns it:

1. **Two bots posting at once** (double-posting) — cutover order in Task 16 stops old jobs before starting new ones; verification demands exactly one post per channel per live edit, per configured account.
2. **The old tool's autoupdate ships the tool-name commit** before the new tool exists — Task 15 stops the old `autoupdate` job *first*, and Task 16's rollback **never restarts it** (the old tool runs frozen at its last image; `main`'s head is unsafe for it after Task 15).
3. **A deploy lands during the rename or branch move** — Tasks 6/9 rely on GitHub redirects and the two-tick rule; verification goes through the autoupdate job log and `/changelog.json`.
4. **Secrets leak through terminal scrollback** (the 2026-08-14 class: `toolforge envvars delete` prints values) — Task 14 has the operator set envvars; agents verify by name only, never values (Task 1 checks only the two non-secret `SFEDITS_DEPLOY_*` names).
5. **Private detail lands in public issues or commits** — Task 11's scrub + operator review, and Task 22's residual sweep including `ts\.net` over dated records.

## Operator touchpoints

The plan batches the human-in-the-loop moments. The agent never waits except at these; a phase-level go is still an explicit go, because the agent presents the exact commit list and command list before each one:

| # | Sitting | Covers |
|---|---|---|
| 1 | End of Phase 1 (Tasks 4–5) | One go: the batch push (the Task 2 merge + the Task 4 rule, one deploy) and the stale-branch deletions. |
| 2 | Repo consolidation (Tasks 6–8) | Branch-move push (one deploy), delete `integration`, close the upstream PRs (comment text shown here), the Leave-fork-network click, the rename. The two-tick waits are agent-scheduled check-backs — the operator can step away during them. |
| 3 | Rename commit (Tasks 9–10) | One go: the deploy push and the SONAR_TOKEN secret deletion. |
| 4 | Migration review (Tasks 11–12) | The big one: the scrubbed drafts, read in one sitting; the same go covers issue creation and the Lific closures. |
| 5 | Phase 5 (Tasks 14–16) | Tool-creation click, envvars, the cutover window. The operator is present by design — this is live operations. |
| 6 | Revocation + old-tool retirement (Task 17) | Two revocations in Discord/Mastodon settings, plus the old tool's retirement: deletion attempt, redirect fallback, envvar wipes (operator, private session), database backup-and-drop. |
| 7 | Docs-phase push + Toolhub (Tasks 21, 23) | One deploy covering the docs and comment-only commits from Tasks 13, 18, 19, 20 and 23, plus the go for the Toolhub registration and deprecation records. |

Everything not in this table — commits, tests, scans, drafts, guide-writing, waiting for ticks — proceeds without the operator.

---

### Task 1: Preflight — verify tools and baseline (read-only)

**Files:** none changed.

- [ ] Run the `sonar` CLI auth status check, `gh auth status`, and Toolforge reachability (`toolforge jobs list` on the old tool `san-francisco-edit-stream` via the bastion). Any failure stops the plan — report, don't work around.
- [ ] `git fetch fork` and confirm `integration` == `fork/integration` (`git log --oneline integration..fork/integration | wc -l` = 0).
- [ ] `npm run test:db:start`, then `SFEDITS_REQUIRE_DB=1 npm test`. Record the exact passing/pending counts as this plan's baseline. The suites must be 0-failing.
- [ ] On the old tool, list envvar **names only** (`toolforge envvars list`). If `SFEDITS_DEPLOY_REPO` or `SFEDITS_DEPLOY_BRANCH` appears, show those two values (a repo URL and a branch name — not secrets) and report before Task 6. Show no other envvar's value.

### Task 2: Merge `fork/place-bot-platform-design` into `integration`

**Files:** Commit (pre-existing, untracked): `docs/design-plans/2026-11-12-placewatch-standalone.md`, `docs/implementation-plans/2026-11-25-placewatch-standalone.md`. Modify: the both-since-`3bf655d` conflict files below. Create (from branch): `lib/dump-reader.js`, `test/dump-reader.test.js`, `wikidata/onwiki/*.wiki`, 6 branch-only docs.
**Interfaces:** Produces: `integration` containing the branch's unique work; `npm test` green; `seek-bzip` added to `package.json`; `lib/dump-reader.js` fetching through `wmFetch`.

- [ ] Commit the two untracked docs first, as their own commit, so the merge cannot sweep them in: `git add docs/design-plans/2026-11-12-placewatch-standalone.md docs/implementation-plans/2026-11-25-placewatch-standalone.md && git commit -m "docs: placewatch standalone design and implementation plan"`.
- [ ] Confirm no other session is using the checkout, then on `integration`: `git merge --no-ff fork/place-bot-platform-design`. Resolve with this policy:
  - `scripts/rank.js`, `test/rank.test.js`: **keep integration's version** (Miami's `--region` rewrite supersedes the branch's hardwired-SF version).
  - `scripts/reassess.js`, `test/reassess.test.js`: integration's region-aware structure is the base. Graft the branch's dump-reading capability (`lib/dump-reader.js` and its wiring, branch commit `2bd2d4a`); if that stage is entangled with the branch's old SF hardwiring, port it as a `--dump <dir>` option onto integration's structure.
  - **Do not carry `test/reassess-api.test.js`** — it imports `apiGet` from the branch's `reassess.js`, an export integration removed; the mw-api path it tested has its own tests.
  - **Adapt `lib/dump-reader.js`'s network fetch to `wmFetch` from `lib/mw-api.js`** (component `dump-reader`) so the Wikimedia-transport invariant holds; the seek-bzip block-reading logic is unchanged.
  - `docs/importance-ranking-methodology.md`: take the branch's edition (1,111 lines, newer measurements); re-apply any integration-only Miami/region edits on top.
  - `lib/user-agent.js` and `test/user-agent.test.js`: identical on both sides — the merge auto-resolves; verify no conflict marker remains.
  - `lib/compare-diff.js`, `lib/diff-page.js`, `lib/edit-stream.js`, `lib/revdel-check.js`, `lib/watchlist-sync.js`, `lib/wikidata-claim-watch.js`: **take integration's side** — the branch's only delta is a dead `USER_AGENT` constant that integration replaced with `lib/mw-api.js`.
  - `package.json`/`package-lock.json`: union; branch adds `seek-bzip`. `.gitignore`: union.
- [ ] Optional upstream checks from the spec (record outcomes, no porting): confirm a test pins `topicsForEdit` host-key matching (the `fd10956` class — fixed here by `dc87091`); note `5efa19c` (right-to-left screenshot fix) as **not ported** — it touches only the fallback screenshot path, and rendered diffs are the primary path.
- [ ] `npm run test:db:start && npm test` — 0 failing; `test/dump-reader.test.js` runs and passes.
- [ ] `sonar analyze secrets` over the changed files. Commit the merge (no `git add -A`; nothing unrelated rides along). **Do not push yet** — the push batches into Task 4's deploy.

### Task 3: Close SFED-32 (code already fixed)

**Files:** none — the three helper scripts already send compliant User-Agents via `wmFetchJson`.

- [ ] Verify: `grep -n "USER_AGENT\|mrfinnsmith\|SF Edits" scripts/find-*.js` returns nothing; each file calls `wmFetchJson` with a component name. If anything fails the check, stop and report — the fix would be `lib/mw-api.js`-routed, not a `lib/user-agent.js` import.
- [ ] Close SFED-32 in Lific (`status: done`) with evidence: the grep output, plus that `lib/` has no UA literals (`grep -rn "USER_AGENT = '" lib/` is empty).

### Task 4: Port upstream's temporary-account rule (TDD)

**Files:** Create: `lib/editor-identity.js`, `test/editor-identity.test.js`; Modify: `lib/edit-stream.js:68-69,102`, `lib/discord-platform.js:93-96` and its Thanks-link call site (~line 129), `test/edit-stream.test.js`, `test/discord-platform.test.js` (Special:Thanks suite, lines 282–294).

**Interfaces:** Produces: `lib/editor-identity.js` exporting `isIpAddress(user)`, `isTemporaryAccount(user)`, `isAnonymous(user)` (all `(string) -> boolean`), mirroring upstream mrfinnsmith's module of the same name. Upstream's commits (`963a6d5`, `f516fdf`) are on the mrfinnsmith main line, not in this repo's history — cite them by SHA in the commit message.

- [ ] Write failing tests first:
  - `test/editor-identity.test.js`: `~2026-42504-55` and `~2026-67040` (short Czech form) are temporary; `~Tilde`, `~Foo`, `Patandor`, `AUC2012`, `1.2.3` are not; IPs pass `isIpAddress`.
  - `test/edit-stream.test.js`: `toEdit({...baseEvent, user: '~2026-42504-55'}).anonymous === true` (extend the suite at lines 34–38).
  - `test/discord-platform.test.js`: in the Special:Thanks suite (lines 282–294), the thanks link is absent when the editor is `~2026-67040`.
- [ ] Run `npx mocha test/editor-identity.test.js` — fails (module missing).
- [ ] Implement `lib/editor-identity.js` with the temporary-account regex `/^~\d{4}-\d+(-\d+)?$/`; wire `toEdit`'s `anonymous:` field and `isIpEditor` (rename to `isAnonymousEditor`) to it.
- [ ] `npm test` — all pass, nothing regressed. `sonar analyze secrets` over the changed files. Commit, crediting upstream: "Ported from mrfinnsmith/sfedits 963a6d5 and f516fdf." **[GO]** One push (operator sitting 1): a single deploy covering the Task 2 merge and this commit. Verify `/changelog.json` shows both.

### Task 5: Prune the stale `fork/*` branches

**Files:** none in-repo (remote branch deletion); possibly Create: `docs/design-place-bot-platform.md`.

- [ ] Verify and delete **nine zero-commit branches**: the 3 upstream-PR branches (`readable-diff-images`, `article-header-images`, `delete-hidden-revisions` — their PRs close in Task 7) and 6 `claude/*` branches (`couple-of-issues-irb0a3`, `discord-bot-duplication-g39tnf`, `edit-collapsing-heavy-traffic-6opt3z`, `error-code-informativeness-v6630b`, `wikidata-duplication-nlc11s`, `wikipedia-dynamic-article-list-cnbg4q`); each must show `git log --oneline integration..fork/<b> | wc -l` = 0 before deletion.
- [ ] `claude/mission-district-wikidata-bot-7thbym` (1 commit, adds `docs/design-place-bot-platform.md`): compare that file with the merged `docs/design-plans/2026-07-23-place-bot-platform.md`. If distinct, cherry-pick the commit onto `integration` and push **[GO]**; if it duplicates, note that and delete the branch.
- [ ] `fix/admin-screenshots-22adec7` and `fix/screenshot-compression-f9b6bc4`: confirm obsolete (they patch `admin/Dockerfile`, `docker-compose.yml`, `pii-analyzer.py` — droplet-era files the repo deleted via SFED-9; rendered images replaced screenshots). Report the diff summary to the operator before deleting.
- [ ] **[GO]** `git push fork --delete <branch>` for each confirmed-dead branch, including `place-bot-platform-design` (dead once sitting 1's push has landed the merge) — same sitting as the Task 4 push. Keep `fork/main` and `fork/integration` (the latter dies in Task 6).

### Task 6: `main` becomes the only branch (deploy + delete `integration`)

**Files:** Modify: `scripts/toolforge-autoupdate.sh:28` (`BRANCH` default `integration` → `main`), `toolforge-jobs.yaml:41` (comment: "fork's integration branch" → the `main` deploy branch).

- [ ] `npm test` first; then commit the two changes.
- [ ] `git fetch . integration:main` — creates `main` (it does not exist locally) or fast-forwards it; it fails if not an ancestor — investigate, never force. **[GO]** (sitting 2) `git push fork main integration` — the `integration` push deploys the `BRANCH` change.
- [ ] Wait two autoupdate ticks (≤35 min; schedule the check-back rather than sleeping, and the operator may step away). The commit content is identical on both branches, so a changelog no-op proves nothing: **verify via the autoupdate job log** (`toolforge jobs logs autoupdate`) that the tick names `main` as the polled branch and completes clean.
- [ ] Switch the shared checkout: `git switch main` (same commit as `integration`; no file changes; no other session running). Set tracking: `git branch --set-upstream-to=fork/main main`. Delete local `integration` and `miami-bot` (`git branch -d` both — safe deletes, both merged).
- [ ] **[GO]** (sitting 2) `git push fork --delete integration`; `git remote prune fork`.

### Task 7: Close the operator's upstream PRs and issue

**Files:** none in-repo.

- [ ] Draft one short comment for mrfinnsmith/sfedits PRs #1, #2, #4 and issue #3: this fork is becoming the standalone project `tieguy/placewatch`; the work remains available there; thanks. **[GO]** Part of sitting 2 (repo consolidation): show the comment text with the rest of the sitting's commands, then post with `gh -R mrfinnsmith/sfedits pr close <n> --comment "..."` and `gh -R mrfinnsmith/sfedits issue close 3 --comment "..."`.

### Task 8: Leave the fork network, rename the repo, set metadata

**Files:** none in-repo.

- [ ] **[GO]** Operator action (web UI only, sitting 2): Settings → Danger Zone → Leave fork network on `tieguy/sfedits`. Agent verifies after: `gh api repos/tieguy/sfedits --jq .fork` → `false`.
- [ ] **[GO]** (sitting 2) `gh api -X PATCH repos/tieguy/sfedits -f name=placewatch -f description=... -F has_issues=true -F has_wiki=false` (description: one line, "placewatch — watch Wikipedia articles about a place and publish the edits that matter"). Topics via `gh api -R tieguy/placewatch` `--add-topic` (`gh repo edit -R tieguy/placewatch --add-topic wikipedia --add-topic bot --add-topic bluesky --add-topic mastodon --add-topic discord --add-topic toolforge --add-topic civic-tech`). The homepage waits until Task 17, when `placewatch.toolforge.org` exists.
- [ ] Verify old URLs redirect: `git ls-remote https://github.com/tieguy/sfedits.git HEAD` resolves.

### Task 9: The rename commit (repo names in code) + drop Travis + drop the SonarQube workflow

**Files:** Modify: `scripts/toolforge-autoupdate.sh:27,73-74`, `scripts/record-deploy.js:99,116`, `lib/user-agent.js:22,36`, `public/server.js:112,156,222-223,271,382,639,744`, `package.json:2-4`, `scripts/rank.js:178` (method URL; `blob/integration` → `blob/main`), `utils/mastodon.js:25`, the committed generated files `public/watchlist-500.json`, `public/watchlist-2500.json`, `public/watchlist-miami-*.json`, `public/ranking.json` (line-1 `method:` URLs), `test/changelog.test.js:21-23,35,52`, `test/toolforge-api.test.js:104,108` (URLs and the `integration` branch argument → `main`), `test/user-agent.test.js:13,17,18`, `test/wikidata-claim-watch.test.js:277`, `test/mw-api.test.js:354`; Delete: `.travis.yml`, `.github/workflows/sonar.yml` (and `.github/` if empty).

- [ ] Update the pinned tests first — they are the spec for this change: `tieguy/sfedits` → `tieguy/placewatch` (including the merge-commit fixture subjects), `sfedits-<component>` UA expectations → `placewatch-<component>` (component names otherwise unchanged), branch argument `integration` → `main`.
- [ ] Change the source strings to match: `REPO_URL`/`PROBE_UA_REPO` defaults, `record-deploy` UA + `repoUrl`, `lib/user-agent.js` `DEFAULT_CONTACT` (`https://github.com/tieguy/placewatch; luis@lu.is`) **and the `sfedits-${component}` template at line 36**, `public/server.js` repo links + `/tree/integration` (line 271) + `blob/integration` (line 156) → `main`, `package.json` (`name: placewatch`, homepage `https://github.com/tieguy/placewatch`, description "Post Wikipedia edits about a place to Bluesky, Mastodon and Discord."), `scripts/rank.js:178` method URL, `utils/mastodon.js:25` upstream link, the `method:` URLs in the generated JSON files. Do **not** touch tool-name strings (`IMAGE` at `autoupdate.sh:40`, `WATCHLIST_PROBE_FALLBACK` at `:65`, `config.base.json`, `toolforge-jobs.yaml` image lines and tool-name comments, `public/server.js:633,636`) — those are Task 15.
- [ ] Delete `.travis.yml` and `.github/workflows/sonar.yml` (minimal-GitHub constraint; the workflow the Miami session added is replaced by Task 10's scan method). `npm test`; `sonar analyze secrets` over changed files; commit.
- [ ] **[GO]** (sitting 3) Push (deploy). Redirects keep the old tool building until this lands. Wait two ticks; verify `/changelog.json` and the autoupdate job log.

### Task 10: Remotes, SonarQube without CI

**Files:** Modify: `.git/config` (remotes), `CLAUDE.md` (sonar + remote notes).

- [ ] Rename remotes in one sequence: `git remote rename origin upstream` (mrfinnsmith, read-only — never pushed), then `git remote rename fork origin`, then `git remote set-url origin git@github.com:tieguy/placewatch.git` and `git remote set-url upstream https://github.com/mrfinnsmith/sfedits.git`; fix `branch.main.remote` to `origin`. Set `gh`'s target so no later command lands on the wrong repo: `gh repo set-default tieguy/placewatch`.
- [ ] **[GO]** (sitting 3) Delete the now-orphaned Actions secret: `gh api -X DELETE repos/tieguy/placewatch/actions/secrets/SONAR_TOKEN`.
- [ ] Pick the analysis method, per the spec: try enabling **SonarQube Cloud automatic analysis** on the project (if the SonarCloud-side toggle needs the GitHub App permission, the operator grants it — a SonarCloud feature, not repo CI). If it cannot be enabled, the method is **local scans**: `sonar analyze` from the checkout. Record which one works in `CLAUDE.md`.
- [ ] Run one scan by the chosen method and read it: pre-existing findings are SFED-42's scope (already a Lific issue, migrating in Task 12); BLOCKER/HIGH introduced by *this plan's* commits are must-fix now. Record the projectKey (`tieguy_sfedits`, kept — renaming it would orphan scan history), the method, and "no CI" in `CLAUDE.md`'s SonarQube section.

### Task 11: Migration drafts + close SFED-5 (operator reviews)

**Files:** Create (untracked, never committed): `docs/migration/issue-map.md` and `docs/migration/<SFED-N>.md` drafts.

- [ ] Close SFED-5 in Lific (`status: done`, evidence: operator reports no recurrence through 2026-11-12).
- [ ] Build the migration list by rule at execution time: **every open SFED issue except** {SFED-36, SFED-2, SFED-3 (this project), SFED-5 (closed here), SFED-32 (closed in Task 3), SFED-40 (the Miami session's; leave it to that session)}. Expected today: **22** — SFED-1, 4, 7, 8, 11, 12, 13, 14, 16, 18, 19, 20, 21, 24, 27, 31, 33, 37, 38, 39, 41, 42. Flag any issue created after this plan for the same rule.
- [ ] For each: draft the GitHub body in `docs/migration/<SFED-N>.md` — title, scrubbed body (no `*.ts.net`, no `linear.app`; `LUI-N` → `LUI-<n>` resolved via the import comments to the mapped GitHub number or a doc path; `SFED-N` cross-references → `SFED-N` placeholder resolved in Task 12), informative comments folded in as dated notes, footer `Migrated from SFED-N (Lific)`, labels mapped (`place-bot`, `new-geos`, `Bug`, `Feature`, `Improvement`; drop `agent`, `quick`, `next`).
- [ ] Record the LUI→SFED→GitHub mapping as it settles in `docs/migration/issue-map.md` (Task 20 needs it).
- [ ] **[GO]** (sitting 4) Operator reviews every draft file before anything is posted. Fix what they flag.

### Task 12: Migrate the issues

**Files:** none in-repo.

- [ ] Create the five mapped labels: `gh label create -R tieguy/placewatch <name>` for each.
- [ ] Create each issue from its approved draft, **in SFED-number order** (`gh issue create -R tieguy/placewatch --title ... --body-file docs/migration/<SFED-N>.md --label ...`), recording each new number in the issue map.
- [ ] Second pass: now that the numbers exist, rewrite the `SFED-N` cross-reference placeholders in each body to the new GitHub numbers (`gh issue edit <n> -R tieguy/placewatch --body-file <patched draft>`). Give the operator the final number map for a spot-check.
- [ ] Close each Lific issue as done with the GitHub URL as evidence; update the Lific SFED project description to point at GitHub Issues.
- [ ] Update `CLAUDE.md`'s Work-tracking section: work for this repo lives in GitHub Issues (`gh issue list -R tieguy/placewatch`), not Lific — this overrides the global rule. (The full CLAUDE.md rewrite is Task 22; only the tracking pointer changes here.)

### Task 13: The instance guide

**Files:** Create: `docs/instance-guide.md`; Delete: `docs/deploy-toolforge.md`. Keep: `README-FOR-OTHER-CITIES.md` as a companion.

- [ ] Write `docs/instance-guide.md` for the own-instance reader: prerequisites (Toolforge account, tool, ToolsDB, channel credentials), then every step from empty tool to posting bot — tool creation, database (`CREATE DATABASE s<id>__<name> CHARACTER SET utf8mb4 COLLATE utf8mb4_bin` — the collation is load-bearing), envvars, build, migrate, webservice (`--mount all`), `jobs load`, smoke test. At most two lines on what placewatch *is*, then a link to the README — it repeats nothing the README holds, and links to the README for configuration reference.
- [ ] `README-FOR-OTHER-CITIES.md` stays a **companion document** (it covers watchlist-building method, not deployment); the guide links to it for that.
- [ ] Include an honest "what is still region-coupled" section: `regions/<name>.json` profile, the account stanza in `config.base.json`, WikiProject PageAssessments names, and the watchlist JSON the bot fetches.
- [ ] Delete `docs/deploy-toolforge.md` (git history keeps the historical runbooks). Fix cross-links (`grep -rn "deploy-toolforge" --exclude-dir=node_modules .`). `npm test`; `sonar analyze secrets`; commit. The commit rides with the next push — normally Task 15's `origin` push in sitting 5, otherwise sitting 7's docs-phase batch; the agent names it in that sitting's commit list either way.

### Task 14: Create the `placewatch` tool by following the guide

**Files:** possibly Modify: `docs/instance-guide.md` (fix every wrong or missing step, in the same session).

- [ ] **[GO]** (sitting 5) Operator creates the tool `placewatch` at toolsadmin (maintainer `luisvilla-personal`). Agent verifies the CLI sees it.
- [ ] **[GO]** (sitting 5) Follow `docs/instance-guide.md` step by step: create the ToolsDB database (note the new `s<id>` user), **fixing the guide wherever it misleads** — that is the test this project exists to run.
- [ ] **[GO]** (sitting 5) Operator sets the envvars on the new tool (values never appear in agent sessions): `SFEDITS_DISCORD_WEBHOOK_URL` (**new** webhook), `SFEDITS_MASTODON_ACCESS_TOKEN` (**regenerated** token), `SFEDITS_BLUESKY_PASSWORD` (copied), `SFEDITS_MIAMI_BLUESKY_PASSWORD` (copied; if Miami's password is not yet set anywhere, note it and carry on — Task 16 verifies whatever is configured), `SFEDITS_INVITE_CODES` (copied if set on the old tool — without it `/create` is disabled on the new tool). Agent verifies presence by **name only**: `toolforge envvars list` on the new tool.
- [ ] Nothing runs yet. Confirm the old tool's jobs are untouched.

### Task 15: The tool-name commit + first build on the new tool

**Files:** Modify: `config.base.json:17` (`titles_url` → `https://placewatch.toolforge.org/watchlist-500.json`) and `:62` (`database` → `s<new>__placewatch`), `toolforge-jobs.yaml:12,32,52` (image → `tool-placewatch/tool-placewatch:latest`) and comments `:3,:65` (tool name), `scripts/toolforge-autoupdate.sh:40,65`, `public/server.js:633,636` (tool card name/url) and the web page title, `test/public-server.test.js:103-271`, `test/shutdown.test.js:86,90`, `test/watchlist-sync.test.js:27`. `"nick": "sfedits"` stays.

- [ ] **Order is load-bearing (runbook 3b). [GO]** (sitting 5) First stop the OLD tool's `autoupdate` job — a Toolforge action, so it needs the operator's go. Nothing else on the old tool stops; it keeps posting from its current image.
- [ ] Update the pinned tests first (`san-francisco-edit-stream` → `placewatch` in host/URL assertions), then the source strings; `npm run test:db:start && npm test`; `sonar analyze secrets`; commit.
- [ ] **[GO]** (sitting 5) Push to `origin main` (the old autoupdate is stopped, so this does not deploy; the push carries any unpushed docs commits, e.g. Task 13's guide — name them in the sitting's commit list). Start the build on the new tool, following the guide's build step: `toolforge build start --ref main https://github.com/tieguy/placewatch` (as `placewatch`); fix the guide if it misleads; wait for the build to finish.

### Task 16: Cutover — no window with two bots

**Files:** possibly Modify: `docs/instance-guide.md` (webservice, jobs-load and smoke-test steps, fixed where wrong).

- [ ] **[GO]** (sitting 5) Execute in this order (runbook 3c + the guide's own steps; double-posting is the hazard):
  1. Old tool: confirm `autoupdate` stopped (Task 15); stop `bot`; stop `rebuild-topics`.
  2. Data: **check `/api/topics.json` on the old tool first.** If topics or subscriptions exist, migrate them: on the bastion, `mysqldump` `s57894__sfedits` (old tool's ToolsDB credentials) to a file under the old tool's home, then restore into `s<new>__placewatch` (new tool's credentials); verify row counts of `topics`, `subscriptions`, `topic_articles` match. A fresh `migrate` run is only acceptable if the store is verifiably empty.
  3. New tool: start the webservice `--mount all` (guide step; fix the guide if wrong); verify `https://placewatch.toolforge.org/watchlist-500.json` and `/api/topics.json`.
  4. New tool: `toolforge jobs load` (YAML copied to the bastion first — `jobs load` reads the bastion filesystem; the guide must say so).
  5. Check the bot log for both accounts' `✓ Watchlist sync: N articles` lines. **Restart web before bot** (empty-watchlist trap, SFED-16's class).
- [ ] Verify against live Wikipedia activity: one matched edit produces **exactly one post per channel** for every account with credentials (SF: Discord, Mastodon, Bluesky; Miami: Bluesky once its password is set). `/changelog.json` on the new tool records the SHA.
- [ ] **[GO]** (sitting 5) Old tool: stop the webservice. Keep the account until Task 17's retirement step decides its fate.
- [ ] Rollback (if verification fails): stop the new tool's jobs and webservice; restart the old tool's webservice, `bot` and `rebuild-topics` — in that order (web before bot). **Do not restart the old tool's autoupdate:** `main`'s head now contains Task 15's tool-name commit, which would redeploy onto the old tool and point it at the new webservice and a database it cannot reach. The old tool runs frozen at its last image until the failure is understood.

### Task 17: Post-cutover verification, credential revocation, old-tool retirement

**Files:** none in-repo.

- [ ] **[GO]** (sitting 6) Operator revokes the OLD Discord webhook and the OLD Mastodon token in their platforms' settings (closing the 2026-08-14 scrollback exposure). `SFEDITS_BLUESKY_PASSWORD` is copied, not rotated.
- [ ] Set the repo homepage now that it exists: `gh repo edit -R tieguy/placewatch --homepage https://placewatch.toolforge.org`.
- [ ] Watch one more autoupdate tick on the new tool: clean no-op or clean deploy.
- [ ] **Retire the old tool** [operator, 2026-11-25], only after the new tool has posted cleanly — a 24h soak is prudent, because retirement burns the Task 16 rollback path:
  1. **Delete if possible:** attempt tool-account deletion for `san-francisco-edit-stream` via toolsadmin. If it works, the old URL dies and the Toolhub record's `replaced_by` (Task 21) is the signpost.
  2. **Redirect if not:** with the old jobs already stopped, start a minimal webservice on the old tool that answers every path with a 301 to `https://placewatch.toolforge.org`, so old links keep working.
  3. **Wipe either way:** the **operator** (never the agent — `toolforge envvars delete` prints values, and the Bluesky passwords and invite codes are still live) deletes the old tool's envvars in a private session; dump `s57894__sfedits` once more into the new tool's home and drop the old database; clear the old tool's NFS home of everything except the redirect handler.
  4. If neither deletion nor a redirect is workable, the tool stays frozen at its last image (the Task 16 rollback state) and the operator decides later.
- [ ] Confirm the old tool's jobs list is empty, its webservice is down or redirecting, and the account is deleted or inert.

### Task 18: README rewrite

**Files:** Modify: `README.md` (full rewrite).

- [ ] Lead with placewatch as place-watching software + platform; San Francisco (and Miami) as reference instances; link `docs/instance-guide.md` for setup and `README-FOR-OTHER-CITIES.md` for watchlist-building; credit the lineage (edsu/anon → mrfinnsmith/sfedits → placewatch). Keep still-accurate reference material (configuration options, scripts, "Why the bot stopped"). Drop stale sections (droplet-era, fork-PR workflow). State plainly which parts remain SF/region-coupled.
- [ ] `npm test`; `sonar analyze secrets`; commit. The push is deferred to Task 23's docs-phase batch (sitting 7).

### Task 19: CONTRIBUTING.md

**Files:** Create: `CONTRIBUTING.md`.

- [ ] How to run the tests (DB container, quoted glob, `SFEDITS_REQUIRE_DB`); that a push to `main` deploys the reference instance, so changes arrive as pull requests or patches; what a bug report and a "new place" request should contain (fields chosen from SFED-12, 13, 14 as examples: region name, Wikidata QID, language wiki, desired channels). No `.github/` templates — the fields live in this file.
- [ ] `npm test` (nothing code-side changed; guards accidental edits); `sonar analyze secrets`; commit. The push is deferred to Task 23's docs-phase batch (sitting 7).

### Task 20: `LUI-` sweep + living docs + `notes/` decisions

**Files:** Modify: `lib/bluesky-utils.js:64`, `lib/mw-api.js:1`, `lib/config.js:146`, `lib/edit-significance.js:42`, `lib/osm-boundary.js:87`, `scripts/toolforge-api.js:249`, `scripts/toolforge-autoupdate.sh` (7 LUI refs), `scripts/test-db.sh:12,51`, `test/helpers/db-helper.js:24,66`, `test/osm-boundary.test.js:21,47,71,91`, `test/discord-platform.test.js:20`, `test/bluesky-utils.test.js:13`, `test/platform-modules.test.js:22`, `test/posting.test.js:229`, `docs/config-topic-store.md`, `docs/substantive-edit-filter.md`, `docs/importance-ranking-methodology.md`; possibly Delete: `notes/ISSUE_revert_risk.md`.

- [ ] Replace every `LUI-N` in code and tests using `docs/migration/issue-map.md`: closed issues → the reason stated in the comment itself or a doc path; open ones → the GitHub number. `LUI-` mentions inside dated records (postmortems, design docs) are allowed to stay — history is history; only tailnet hostnames come out (Task 22).
- [ ] Living-docs pass on the three docs above (`grep -n "integration\|sfedits\|fork\|tieguy" docs/config-topic-store.md docs/substantive-edit-filter.md docs/importance-ranking-methodology.md`; fix what's stale).
- [ ] `notes/` defaults (reviewer checks each): `IDEAS.md` stays (public idea backlog); `SFBA-TAGGING-EDITS.md` stays (SF-instance worklist, nothing private); `ISSUE_revert_risk.md` — fold any live content into the migrated GitHub SFED-33 issue (show the operator the addition in sitting 7) and delete the file; election `.txt` working notes stay as history; `cyclerank-wikipedia.pdf` stays (reference).
- [ ] `npm test`; `sonar analyze secrets`; commit. The push is deferred to Task 23's docs-phase batch (sitting 7).

### Task 21: Toolhub records (SFED-3)

**Files:** Create: `toolinfo.json` (working file, untracked).

- [ ] Author the toolinfo for `placewatch` (name, title, description, url `https://placewatch.toolforge.org`, repo, docs, author, license CC0-1.0) and **[GO]** register it with the Toolhub tools API (sitting 7; the record text is shown with the sitting's other items). Use the toolhub-discovery skill conventions; the old record's description is stale — do not copy it.
- [ ] **[GO]** Mark the `san-francisco-edit-stream` record deprecated with `replaced_by: placewatch` (Toolhub deprecation fields) — same sitting.
- [ ] Close SFED-3 in Lific with the record URLs as evidence.

### Task 22: Housekeeping and residual sweep

**Files:** Modify: `CLAUDE.md`, `~/Projects/STATUS.md` (outside the repo); Delete: `docs/migration/`.

- [ ] `CLAUDE.md`: single-branch map (`main` deploys; `upstream` read-only mirror), placewatch names (tool/repo/image/URLs table), GitHub-Issues work tracking, SonarQube scan method, two-tick + deploy-gate rules, drop the stale `main`-mirrors-upstream claim.
- [ ] Social accounts (Mastodon/Bluesky profile links) if they point at the old webservice URL — report for the operator to change; `~/Projects/STATUS.md` if it lists this repo.
- [ ] Residual sweep: `rg -n "sfedits|san-francisco-edit-stream|tieguy/sfedits|LUI-|linear.app|integration|ts\.net" --glob '!node_modules' --glob '!.git' --glob '!data'`. Every hit is either justified (`SFEDITS_*` envvars, `"nick": "sfedits"`, upstream credits, dated records — where `sfedits`/`LUI-` may legitimately remain) or fixed. The `ts\.net` part runs over the dated records too.
- [ ] Delete `docs/migration/` (the durable mapping lives in the GitHub issues' "Migrated from SFED-N" footers).
- [ ] Update the findings log `~/.local/state/opencode/retro/sfedits/2026-11-22-placewatch-design.md` with execution findings.

### Task 23: Context files + close out

**Files:** Create: `docs/users.md`, `docs/vision.md`, `docs/architecture.md`.

Write these exactly; the reviewer checks the files match. Caps: users ≤30 lines, vision ≤20, architecture ≤100 with its fixed sections.

- [ ] `docs/users.md`:

````markdown
# Users

- **Own-instance operators** (primary): Wikipedians and civic-tech
  maintainers who deploy placewatch on their own Toolforge tool for their
  own region. They read the README and docs/instance-guide.md, run
  `npm test`, and file bug reports.
- **New-place requesters**: people who want a feed for a region but do
  not run code. They open a "new place" issue; they never touch the repo.
- **The operator (tieguy)**: runs the reference instances (San Francisco
  and Miami accounts) on Toolforge and pushes to `main`, which deploys.
- **Agents**: Claude/opencode sessions developing the repo. They follow
  docs/architecture.md and the repo instructions; work is tracked in
  GitHub Issues.
````

- [ ] `docs/vision.md`:

````markdown
# Vision

placewatch watches Wikipedia articles about a place and publishes the
edits that matter to the people who care about that place.

One codebase serves every place: a region is configuration (a profile and
an account stanza), not a fork. The San Francisco and Miami instances are
the reference deployments; the next one should need no code changes.

Success is a stranger standing up a feed for their own city from the
public repository, and the ranking and filtering being good enough that
people trust what gets posted.
````

- [ ] `docs/architecture.md`:

````markdown
# Architecture

## Problem

Wikipedia articles about a place change constantly, and the people who
care about the place cannot watch them all. placewatch filters the edit
stream down to articles that belong to a region and edits that say
something, then publishes those edits to Bluesky, Mastodon and Discord.

## Stack

Node 22 (global fetch; ESM-only deps behind lazy import). mocha/chai/nock
for tests. Express for the web process. MariaDB via the mariadb pool
(ToolsDB in production, a throwaway container in tests). Wikimedia
traffic only through lib/mw-api.js (m3api + m3api-rest). Diff rendering
with satori + resvg; wtf_wikipedia parses wikitext. Deploy: Toolforge
build service, one image, five Procfile entries — four long-running
processes plus the one-off migrate.

## Codemap

- `page-watch.js` — the bot: stream, match, render, post.
- `lib/config.js` — committed base config plus envvar secrets.
- `lib/edit-stream.js` — EventStreams consumer; the edit shape.
- `lib/editor-identity.js` — the shared anonymous-editor rule.
- `lib/watchlist-sync.js` — account watchlist fetch and refresh.
- `lib/delivery.js` — the typed delivery layer every channel goes through.
- `lib/db.js`, `lib/topic-store.js`, `lib/topic-index.js`,
  `lib/rebuild.js`, `lib/subscription-delivery.js`,
  `lib/topic-create.js` — the place-bot platform: topics, subscriptions,
  ToolsDB persistence.
- `lib/region.js` — Wikidata region QID in, article set out.
- `lib/bluesky-platform.js`, `lib/mastodon-platform.js`,
  `lib/discord-platform.js` — delivery adapters.
- `lib/compare-diff.js`, `lib/diff-render-native.js`, `lib/diff-image.js`
  — diff fetch, strip, render.
- `lib/edit-significance.js` — the substantive-edit classifier.
- `lib/mw-api.js` — the only Wikimedia transport.
- `lib/user-agent.js` — the operator-identifying User-Agent.
- `lib/shutdown.js` — signal handling and run records.
- `public/server.js` — public web: coverage, /create, watchlist JSON.
- `scripts/reassess.js`, `scripts/rank.js`, `scripts/region-profile.js`,
  `regions/*.json`, `lib/dump-reader.js` — the local ranking pipeline.
- `scripts/toolforge-autoupdate.sh`, `scripts/record-deploy.js`,
  `toolforge-jobs.yaml` — deploy machinery.
- `db/migrations/*.sql` — schema, applied by `scripts/migrate.js`.

## Boundaries

- `lib/mw-api.js` is the only route to Wikimedia hosts. Raw fetch only
  for our own webservice, EventStreams, OSM, and OAuth token endpoints.
- `wikidata/` is edit-time provenance; nothing at runtime reads it.
- `regions/`, `scripts/rank.js`, `scripts/reassess.js` are local
  analysis; the bot never runs them.
- Secrets live in envvars; `config.base.json` carries structure only.
- `data/` is runtime artifacts, never committed.

## Invariants

- Every consumer type in the delivery fan-out carries its own membership
  test; topic-only edits never reach account channels.
- Topic subscriptions post once per matched edit, not once per account.
- Topic identity is the normalized-filters hash; schema changes are
  migration files only.
- Serial, anchored WDQS queries; a timeout is a scope error, not a retry.
- Delivery targets are an allowlist (SSRF guard).
- The User-Agent identifies the operator, built by `lib/user-agent.js`.
- The anonymous-editor rule is shared (`lib/editor-identity.js`), so the
  feed and the logs cannot disagree.

## Cross-cutting concerns

- Deploy = push to `main`; autoupdate polls every 15 minutes, builds,
  migrates, restarts web before bot.
- The bot fetches its watchlist from the webservice; restart web first.
- Tests need the DB container for the DB-backed suites; a green run
  without it proves less than it looks.
````

- [ ] `npm test`; `sonar analyze secrets`; commit. **[GO]** One push (sitting 7): a single deploy covering the docs and comment-only commits from Tasks 13, 18, 19, 20 and 23 — verify `/changelog.json` and a clean tick.
- [ ] Close SFED-36 and SFED-2 in Lific (`status: done`) with evidence: the sweep output, the live URLs, and the final report to the operator.

## Acceptance trace

Each design goal and anti-goal, and the tasks that carry it:

| Scenario (from the spec) | Tasks |
|---|---|
| One long-lived branch `main`, default + deploy branch, `integration` gone | 6, 8, 9 |
| Repo standalone (not a fork), named `tieguy/placewatch`, Issues on | 7, 8, 12 |
| Open work tracked in GitHub Issues; Lific issues closed with evidence; SFED-5 closed | 11, 12, 23 |
| Merge `place-bot-platform-design`; SFED-32 closed; temporary-account rule ported; optional upstream checks recorded; stale branches pruned | 2, 3, 4, 5 |
| New tool `placewatch` live; old tool retired — deleted if possible, else redirecting, else frozen — autoupdate never restarted; data carried over (checked first); no double-posting; credentials rotated (incl. Miami secret, invite codes) | 14, 15, 16, 17 |
| Instance guide exists, replaces `deploy-toolforge.md`, and is followed through Tasks 14–16 (fixes land in it) | 13, 14, 15, 16 |
| Docs for the own-instance reader; contributor surface; `LUI-` refs gone; living docs fixed; Toolhub updated | 18, 19, 20, 21 |
| No private detail in public issues or commits (scrub, operator review, `ts.net` sweep) | 11, 12, 22 |
| No accidental deploy (every outward step gated) and minimal operator blocking (seven batched sittings) | every **[GO]** step; the Operator touchpoints table |
| SonarQube without GitHub CI; method chosen and recorded; Sonar gate live from Task 2 | 9, 10 |
| Context files (users/vision/architecture) | 23 |
| SFED-36 and SFED-2 closed; findings log updated | 22, 23 |
