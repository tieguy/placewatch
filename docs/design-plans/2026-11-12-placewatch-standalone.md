# placewatch as a standalone project

Date: 2026-11-12. Approved 2026-11-22 in Plannotator. Tracks: SFED-36
(umbrella), SFED-2 (rename and tool
migration). Supersedes the repo-host decision and the Linear-era details of
`docs/design-plans/2026-08-15-placewatch-migration.md`. That runbook stays
the source for Toolforge mechanics: the cutover order, the double-posting
hazard, and rollback.

Decisions are marked **[operator]** when Louie made them in the brainstorm
and **[proposed]** when they are defaults proposed in the brainstorm and
not contested. The builder may revisit a **[proposed]** decision with a
reason. A **[operator]** decision is fixed.

## Intent

Turn the fork `tieguy/sfedits` into a standalone public project named
**placewatch**: one repository, one long-lived branch, one Toolforge tool,
public issues, and documentation that a stranger can follow.

The main public consumer is **someone who sets up their own instance for
their own state or city** [operator]. Every documentation choice serves
that reader first. The operator and agents working in this repo are the
second audience.

The work is not hard, but it has many steps. Thoroughness is the success
criterion: no stale name, URL, branch, issue reference or credential left
behind.

## Goals

1. One long-lived branch, `main`. It is the default branch and the deploy
   branch.
2. The GitHub repository is standalone (not a fork) and named
   `tieguy/placewatch`.
3. Open work is tracked in GitHub Issues on that repository, not in Lific.
4. The live deployment runs on a new Toolforge tool, `placewatch`. The old
   tool `san-francisco-edit-stream` is retired [operator, 2026-11-25]:
   deleted if Toolforge allows it, otherwise serving a redirect to the
   new tool, with its envvars, database and home wiped either way.
5. The documentation describes placewatch as it is, for the
   own-instance reader, and a fresh Toolforge setup has tested the
   instance guide.

## Non-goals

- **San Francisco as configuration** (SFED-1, SFED-11). That work is a
  separate project [operator]. This project leaves the SF-specific code
  as it is. The documentation must state honestly which parts are still
  SF-specific.
- **Moving to Wikimedia GitLab.** The code stays on GitHub for now
  [operator]. If it moves later, issues would move to Phabricator, because
  Wikimedia GitLab disables issues by policy. Nothing in this project
  prepares for that move [operator].
- Renaming the `SFEDITS_*` environment variables. They keep their names,
  because renaming them changes code, stored envvars and docs for no gain
  [proposed, carried over from the August runbook].
- Renaming the social accounts (`@SFedits@sfba.social`,
  `top500.thebay.wiki`, the Discord webhook) [decided 2026-08-15].

## Anti-goals

- **Double-posting by two running copies.** During the cutover, the old
  tool and the new tool must never both run the bot. If they do, each edit
  is posted twice to the same channel. This rule is not about one edit
  reaching several channels: an article can belong to several places (for
  example, a person tied to two cities), and each matching topic or
  account may post it once.
- **A guide that nobody has followed.** If the instance guide was not used
  to build the `placewatch` tool, this project has failed even if the
  rename works.
- **Leaking private detail into public issues**: tailnet URLs, ToolsDB
  credentials, secret values, or personal information.
- **An accidental deploy.** Every push to the deploy branch is a deploy
  and waits for the operator's explicit go.

## Constraints

- A push to the deploy branch deploys within 15 minutes, through
  autoupdate (`scripts/toolforge-autoupdate.sh`, `*/15` in
  `toolforge-jobs.yaml`).
- The old tool's autoupdate reads `REPO_URL` (line 27, default
  `https://github.com/tieguy/sfedits.git`) and `BRANCH` (line 28, default
  `integration`). The envvars `SFEDITS_DEPLOY_REPO` and
  `SFEDITS_DEPLOY_BRANCH` override them. **Two-tick rule:** the tick that
  deploys a change to these defaults still runs the old script. Only the
  next tick uses the new defaults.
- Toolforge tools cannot be renamed, so the tool part is a new-tool
  migration.
- GitHub's "Leave fork network" (Settings → Danger Zone) is permanent. It
  drops the fork's PRs and issues and keeps all commits. The fork qualifies
  because it is public, under 1 GB, and has no child forks.
- After a rename, GitHub redirects the old URL for web, git and API
  traffic, as long as no new repository takes the old name.
- The working tree is shared with other sessions. Do not check out other
  branches in it. Use worktrees or `git fetch . a:b`.
- `CLAUDE.md` is gitignored by design. It is private agent context, not
  public documentation.
- **Minimal GitHub dependence** [operator]. The project must stay portable
  to GitLab or another host. Use GitHub for git hosting and Issues only.
  Do not add GitHub Actions, `.github/` workflows, Actions secrets,
  branch protection rules, or GitHub-only features such as Discussions,
  Projects or Pages. Touch repository settings only as this project needs
  (leave the fork network, rename, description, Issues on, wiki off).
  The existing GitHub dependencies in code (the GitHub API fallback in
  `resolve_remote_sha()`, the compare API in `scripts/record-deploy.js`)
  stay as they are. This project adds no new ones.

## Approaches considered

**A. Guide first, then build the new tool from the guide. Chosen
[operator].** Settle the code and the repository, move the issues, write a
general "run your own instance on Toolforge" guide, then create the
`placewatch` tool by following that guide and fixing it wherever it is
wrong. This tests the guide on a fresh setup, which is exactly the path
the main audience will take. The cost is that the cutover waits for the
guide draft. That cost is small, because creating the tool and
provisioning ToolsDB are inert and can start early.

**B. Migrate everything first, document last.** Execute the August
runbook with GitHub in place of GitLab, then rewrite the docs. This
reaches the new name sooner, but the guide would be written from memory,
and the first real test would be a stranger's.

**C. Two projects: repo, issues and docs now; Toolforge later.** Rejected.
The README would say placewatch while the public site stays at
`san-francisco-edit-stream.toolforge.org`, and the deploy docs would be
rewritten twice.

## Design

Six phases, in order. Each phase lists what it must achieve and the
decisions it carries. The step-by-step plan is left to the builder.

### Phase 1: Settle the code

1. **Merge `fork/place-bot-platform-design` into `integration`.** The
   content inventory is in SFED-36: `scripts/rank.js`,
   `lib/dump-reader.js`, the wtf_wikipedia parser in `scripts/reassess.js`,
   dump-based reading, the `lib/user-agent.js` fix, the newer methodology
   doc, and the proposals and elections docs. Expect conflicts in
   `scripts/reassess.js`: `integration` rebuilt it around `lib/mw-api.js`.
   `npm test` must pass after the merge.
2. **SFED-32.** After the merge, check the three helper scripts
   (`scripts/find-articles-in-categories.js`, `find-categories.js`,
   `find-translations.js`). If any still sends the upstream User-Agent,
   switch it to `lib/user-agent.js`. Close SFED-32 in Lific.
3. **Port the temporary-account rule from upstream** [operator]. Upstream
   commits `963a6d5` and `f516fdf` (mrfinnsmith/sfedits) treat Wikipedia
   temporary accounts (`~2026-…`, including short forms) as anonymous.
   Our check, `lib/edit-stream.js:102`, matches only IPv4 and IPv6
   addresses. Also check whether `lib/discord-platform.js:91` or any other
   anonymous check needs the same rule. Upstream applied the rule to its
   Supabase edit log, so this is a port, not a cherry-pick. Port the
   matching rule and its test cases, and credit upstream in the commit
   message.
4. **Upstream review is done.** Upstream's other 37 commits since the fork
   point are specific to its droplet, Docker, Supabase, Gemini and Presidio
   setup. Two are optional checks, not requirements: `5efa19c`
   (right-to-left screenshot fix; it applies only to our fallback
   screenshot path) and `fd10956` (language-code matching; probably
   already fixed here, so verify rather than port).
5. **Prune stale branches on the `fork` remote**, per SFED-36: 11 branches
   with nothing outside `integration`. Confirm
   `fix/admin-screenshots-22adec7` and `fix/screenshot-compression-f9b6bc4`
   are obsolete before deleting them. Check whether `integration` already
   has the one design-doc commit on
   `claude/mission-district-wikidata-bot-7thbym`, and save it if not.
6. **Update `README-FOR-OTHER-CITIES.md`** (uncommitted, drafted
   2026-11-12). After the merge it no longer needs to tell readers to copy
   `rank.js` from another branch. Phase 6 folds it into the docs. Here it
   only needs to stop being wrong.

### Phase 2: Make the GitHub repository standalone

1. **`main` becomes the only long-lived branch** [proposed]. Fast-forward
   `main` to `integration`. In the same deploy, change the autoupdate
   default `BRANCH` to `main`. After two clean ticks (see the two-tick
   rule), the old tool watches `main`. Then delete `integration` on the
   remote and locally, and update the upstream tracking. The shared
   checkout sits on `integration`. Switch it to `main` with `git switch
   main` when no other session is running. Because `main` and
   `integration` are the same commit at that point, this changes no files.
   Do it before the local delete [proposed]. Check first that
   the old tool has no `SFEDITS_DEPLOY_BRANCH` envvar
   (`toolforge envvars show`). If it has one, update it.
2. **Close the operator's upstream PRs** (#1, #2 and #4 on
   mrfinnsmith/sfedits; issue #3) with a short note that points to
   placewatch [proposed]. Leaving the fork network may orphan their head
   branches. In any case, the PRs have had no response since
   July and August. Closing them is an outward-facing action and waits
   for a go.
3. **Leave the fork network** [operator]. The two stale PRs on
   `tieguy/sfedits` (#1 and #2, both against the frozen `main`) are lost.
   That is acceptable.
4. **Rename the repository to `placewatch`** [operator, decided
   2026-08-15]. Set the description and topics. Turn on Issues. Turn off
   the wiki unless it is used. Change the homepage, which still points to
   mrfinnsmith.com.
5. **Rename commit.** Change the defaults that name the repository:
   `scripts/toolforge-autoupdate.sh` (lines 27 and 73),
   `scripts/record-deploy.js` (lines 99 and 116), `lib/user-agent.js`,
   the `public/server.js` repo links, `package.json` (`name`; the
   `homepage` still names `edsu/anon`), and the tests that pin these
   strings (`test/changelog.test.js`, `test/toolforge-api.test.js`).
   Redirects keep the old tool working until this commit deploys. Do not
   change the Toolforge tool name here. That happens in Phase 5.
6. **Remotes:** rename the local remote `fork` to `origin`, and rename
   the current `origin` (mrfinnsmith) to `upstream` [proposed]. Point
   `origin` at the new URL.
7. **Delete `.travis.yml`.** It targets a nonexistent `master` branch, and
   nothing runs it. **No GitHub-hosted CI replaces it** [operator]; see the
   minimal-GitHub constraint. Tests keep running locally (`npm test`)
   before every push, as they do today.
8. **Onboard SonarQube** [operator]. The operator is a Sonar employee with
   unlimited SonarQube Cloud access, so neither the free tier nor the
   repo's fork status limits this step. (OCFG-17 corrects the global agent
   instructions, which still cite the free tier.) Run this step after the
   rename, so that the project key carries the final name. Do not add a CI
   workflow or an Actions secret (minimal-GitHub constraint). The analysis
   must therefore run without any file in `.github/`: use SonarQube Cloud
   automatic analysis if it supports this repo, and otherwise run the
   scanner locally through the `sonar` CLI. The builder finds out which
   works and records it. Steps: test the `sonar` CLI first (auth status),
   then run `sonar import --repo tieguy/placewatch` (BETA) and
   `sonar link`. Record the projectKey, the analysis method and any
   exclusions in `CLAUDE.md`. From then on, the global SonarQube gate
   applies: `sonar analyze secrets` before commits, and a check of
   new-code issues after pushes.

### Phase 3: Move the issues from Lific to GitHub

**Scope: open issues only** [operator]. Of the 22 open (backlog) SFED
issues, these are **not** migrated [proposed]:

| Issue | Instead |
|---|---|
| SFED-36, SFED-2 | This project carries them out. Close them in Lific at the end. |
| SFED-3 (Toolhub record) | Done in Phase 6. |
| SFED-5 (OOM watch) | Close in Lific. Evidence: the operator reports no recurrence through 2026-11-12. This also drops the August runbook's stability gate [operator]. |
| SFED-32 | Closed in Phase 1. |

That leaves 17 to migrate: SFED-1, 4, 7, 8, 11, 12, 13, 14, 16, 18, 19,
20, 21, 24, 27, 31 and 33.

For each migrated issue:

- Copy the title and body. Add a footer that names the origin
  ("Migrated from SFED-N"), without the tailnet URL.
- **Scrub before posting:** remove Lific links (any `*.ts.net` tailnet
  host) and `linear.app` URLs. Rewrite
  `LUI-N` and `SFED-N` references to the new GitHub numbers, or to a doc
  path when the referenced issue is closed. Check for credentials,
  ToolsDB usernames and personal detail. The operator reviews the scrubbed
  text before anything goes public. This is the anti-goal check.
- Copy the comments that still carry information, folded into the body as
  dated notes, not as separate comments [proposed].
- Map the labels: `place-bot`, `new-geos`, `Bug`, `Feature` and
  `Improvement` become GitHub labels. Drop `agent`, `quick` and `next`,
  which are workflow markers [proposed].
- Close the Lific issue as done, with the GitHub URL as evidence.

Afterwards, the Lific project SFED stays in place, and its description
says that work moved to GitHub Issues [proposed]. The repo's agent
instructions (`CLAUDE.md`, work-tracking section) must say that this repo
tracks work in GitHub Issues through `gh`, overriding the global "status
lives in Lific" rule. Without that line, agents will keep filing work in
Lific.

The builder keeps a **LUI → SFED → GitHub mapping table**, because Phase 6
needs it for code comments. The Lific import carried the Linear origin in
the comments ("Originally by … Linear") and in cross-references.

### Phase 4: Write the instance guide

A new document for the own-instance reader: what you need (a Toolforge
account, a tool, ToolsDB, social or Discord credentials) and every step
from an empty tool to a posting bot. **It does not repeat the README**
[operator]: it has at most one or two lines on what placewatch is, then a
link to the README. Each fact lives in one document. The guide links to
the README for configuration reference, and the README links to the guide
for setup. The guide replaces `docs/deploy-toolforge.md`. That file is written for the July
`place-bot-platform` branch and mixes historical cutover runbooks with
setup steps. The historical runbook sections are dropped, because git
history keeps them.

The guide must be honest about the SF coupling that remains until SFED-1:
which constants or files a new instance has to change, and why.
`README-FOR-OTHER-CITIES.md` already covers much of the
watchlist-building side. The builder decides whether it becomes a section
of the guide or a companion document.

Phase 4 may overlap Phase 5's inert steps (create the tool, provision
ToolsDB), because those steps are themselves in the guide.

### Phase 5: Build the `placewatch` tool by following the guide

The August runbook's Phase 3 is the reference for the mechanics (3a–3f).
Differences from that runbook:

- **Follow the instance guide, not the runbook,** wherever they overlap.
  Each place where the guide is wrong or missing a step is fixed in the
  guide in the same session. The runbook supplies only what is specific to
  the cutover: data migration, double-posting order, credential rotation,
  rollback.
- The deploy source is `https://github.com/tieguy/placewatch`, branch
  `main`. There is no GitLab port.
- The stability gate is dropped (see Phase 3).
- **Credential rotation** [proposed]. Source: the August runbook (its
  Phase 3a, step 4) and SFED-2 record that the Discord webhook URL and the
  Mastodon access token were exposed in a terminal session's scrollback on
  2026-08-14. Neither document says how. The runbook warns nearby that
  `toolforge envvars delete` prints the value it deletes, which is one
  likely cause. The operator does not recall the incident, so treat it as
  unverified. Rotate anyway: the new tool needs these envvars set in any
  case, so a new webhook and a new token cost little. Revoke the old ones
  after the new bot is verified. `SFEDITS_BLUESKY_PASSWORD` is copied, not
  rotated, unless the operator asks for rotation.
- **Data:** check `/api/topics.json` on the old tool first. If production
  topics or subscriptions exist now, use `mysqldump` and restore. Do not
  run a fresh `migrate`.
- **Tool-name commit:** `config.base.json`, `toolforge-jobs.yaml`,
  `scripts/toolforge-autoupdate.sh` (lines 40 and 65),
  `public/server.js` (about lines 627–636), and the tests that pin
  `san-francisco-edit-stream` (`test/public-server.test.js`,
  `test/shutdown.test.js`, `test/watchlist-sync.test.js`). The runbook's
  order still holds: stop the old tool's autoupdate before pushing this
  commit.
- **Names** [proposed]: the software, repository, tool, web page title and
  User-Agent component strings become `placewatch`. The SF account bot
  keeps `"nick": "sfedits"`, because that names the SF instance, not the
  software, and it matches the unchanged social accounts.
- **Old tool:** stop all jobs and the webservice, then retire it
  [operator, 2026-11-25]: delete the tool account if Toolforge allows,
  otherwise run a minimal redirect webservice to
  `placewatch.toolforge.org`. Either way, wipe it: the operator deletes
  its envvars in a private session (`toolforge envvars delete` prints
  values, and the Bluesky passwords and invite codes stay live), the old
  ToolsDB database is dumped once more and dropped, and the home
  directory is cleared. Retirement happens only after the new tool has
  run clean — wiping burns the rollback path.

### Phase 6: Finish the documentation and wrap up

1. **README.md:** rewrite it for the own-instance reader. Lead with
   placewatch as a place-watching bot and platform, present San Francisco
   as the reference instance, link the instance guide, and credit the
   lineage (edsu/anon → mrfinnsmith/sfedits → placewatch). Keep the
   reference material, such as configuration options and scripts, that is
   still accurate.
2. **Contributor surface:** a short `CONTRIBUTING.md`: how to run the
   tests, that a push to `main` deploys the reference instance (so changes
   come in as pull requests or patches), and what to put in a bug report
   or a "new place" request [proposed]. Choose the "new place" fields with
   SFED-12, 13 and 14 as examples. These fields live in `CONTRIBUTING.md`,
   not in `.github/ISSUE_TEMPLATE/`, so they survive a move off GitHub
   [proposed; minimal-GitHub constraint].
3. **Code comments and tests:** replace the 41 `LUI-` references (CLAUDE.md
   11; code and tests 27; docs 5, per the 2026-11-12 count) using the
   mapping table. Where the referenced issue is closed, the comment should
   state the reason itself, or point to a doc, instead of citing a dead ID.
4. **Docs inventory:** keep the dated records (postmortems, validation
   reports, design and implementation plans) as history. Do not rewrite
   them [proposed]. Fix the living docs (`docs/config-topic-store.md`,
   `docs/substantive-edit-filter.md`,
   `docs/importance-ranking-methodology.md`). Decide for each file in
   `notes/` whether it is public documentation, belongs in an issue, or
   should leave the repo.
5. **Toolhub (SFED-3):** create the toolinfo for `placewatch`. Mark the
   `san-francisco-edit-stream` record deprecated, with `replaced_by`.
6. **Housekeeping:** `CLAUDE.md` (branch map, names, work tracking), the
   profile links on the social accounts if they point at the old
   webservice, the local checkout directory name (optional), and
   `~/Projects/STATUS.md` if it lists this repo.
7. **Residual sweep:**
   `rg -n "sfedits|san-francisco-edit-stream|tieguy/sfedits|LUI-|linear.app|integration|ts\.net"`
   outside `node_modules`, `.git`, `data` and the dated records. Every
   remaining hit is either justified (the `SFEDITS_*` envvars, the
   `sfedits` nick, credits to upstream) or fixed. Run the `ts\.net` part
   over the dated records too: tailnet hostnames are private and come out
   of every committed file, history docs included.
8. Close SFED-36 and SFED-2 in Lific.

## Order and gates

Phases run in order 1 → 6. Phase 4 may overlap Phase 5's inert setup
steps. **Update 2026-11-25 [operator]:** the Miami code is merged and
deployed on `integration` (SFED-40); only Miami configuration remains, so
the gate below is met. Two consequences: Phase 5 must set
`SFEDITS_MIAMI_BLUESKY_PASSWORD` on the new tool along with the other
secrets, and Phase 2 step 8 starts from the SonarQube project already
onboarded in commit `59aea6f` (check its key and analysis method after
the rename instead of onboarding from scratch).

Original gate: **Execution starts only after the Miami work**
(`docs/implementation-plans/2026-11-12-miami-bot.md`) **lands on
`integration`** [operator, 2026-11-22]. Miami edits the same files Phases
1–2 merge and rename (`config.base.json`, `lib/config.js`, the ranking
scripts), and Phase 2 deletes `integration` itself. When Phase 1 runs
after Miami, `scripts/rank.js` and `lib/dump-reader.js` may already be on
`integration` (Miami Part 2 ports them); the merge then reconciles those
files instead of adding them.

Before Phase 1, run the read-only tool checks: `sonar` auth status,
`gh auth status` (it needs scopes for repo settings and issue creation), and `toolforge` access on the
old tool. A broken tool then shows up at the start, not halfway through a
cutover. Every push to the deploy branch, every GitHub settings change
(leave network, rename) and every Toolforge action waits for the
operator's go. SFED-1's phase-3 cutover must not share a window with
Phase 5. Since SFED-1 is a separate project, this is a scheduling note
only.

## Left to the builder

- The step-by-step plan, its granularity, and how to resolve the
  `reassess.js` conflicts.
- Whether to script the issue migration (Lific MCP tools to `gh issue
  create`) or do it by hand for 17 issues.
- The structure of the instance guide and of the README, within the
  audience and honesty rules above.
- Verification for each phase. At minimum: `npm test` green, a clean
  autoupdate tick per deploy, the changelog showing the SHA, and one live
  edit producing exactly one post per channel after the cutover.
