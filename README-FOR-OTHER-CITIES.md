# Running an edits bot for another city

This bot posts screenshots of edits to Wikipedia articles about the San
Francisco Bay Area. The code that watches edits and posts them works for any
place. The hard part is the **list of articles to watch**. This document
explains how we built the Bay Area list, what we tried that failed, and what
another city could do to get a list and a running bot.

The full analysis, with the numbers behind every claim below, is in
[`docs/importance-ranking-methodology.md`](docs/importance-ranking-methodology.md).

## What we built for the Bay Area

The bot watches the 500 articles in
[`public/watchlist-500.json`](public/watchlist-500.json). We also publish a
wider list of 2,500 articles in
[`public/watchlist-2500.json`](public/watchlist-2500.json) for anyone who wants
more coverage. We made both lists in five steps.

### 1. Start from the articles that editors already tagged

Wikipedia's [San Francisco Bay Area task
force](https://en.wikipedia.org/wiki/Wikipedia:WikiProject_California/San_Francisco_Bay_Area_task_force)
puts a banner on the talk page of each article it covers. The
[PageAssessments API](https://www.mediawiki.org/wiki/Extension:PageAssessments)
lists those articles under the project name `California/San Francisco Bay Area
task force`. About 14,000 articles carry the banner, and 11,778 of them have an
importance rating (Top, High, Mid or Low).

Our first version of the bot watched the Top and High articles. We stopped
because the ratings are uneven. The sitting mayor of San Francisco was rated Mid,
so the bot ignored edits to his article. Netflix and the physicist Steven
Weinberg were rated High, so the bot posted edits to their articles.

### 2. Add articles that editors never tagged, using Wikidata

Tagging is incomplete: some important Bay Area articles have no banner. We
queried Wikidata for items connected to the nine Bay Area counties that have an
English Wikipedia article (`scripts/reassess-untagged.js`). We kept an item only
when Wikidata says the subject **is** in the region:

- located in the region, through any chain of `P131` (located in the
  administrative territorial entity);
- headquartered there (`P159`) or located there (`P276`);
- holds an office whose jurisdiction is there (`P39`).

We dropped born-here (`P19`), died-here (`P20`) and worked-here (`P937`). Those
three properties produced about 10,900 of the 15,500 raw candidates, and almost
none of those candidates belonged on the list. For example, Ronald Reagan worked
at Fort Mason, and Microsoft has a Silicon Valley campus. The rule is
`IS_HERE_PROPERTIES` in [`lib/region.js`](lib/region.js).

The tagged articles plus the Wikidata candidates gave a set of 18,474 articles.
We call this set the **universe**.

### 3. Rank by links from other articles in the universe

We ranked each article by how many other articles in the universe link to it.
An editor who writes a link from one article to another is saying that the two
subjects are related. The more articles about the region that link to an
article, the more central that article is to the region.

The raw link count gave poor results. We had to fix three measurement problems
before the count was useful:

| Problem | Example | Fix |
|---|---|---|
| Navigation boxes (navboxes) add links that no editor wrote in the article. 77% of all raw links came from templates. | Every BART station links to every other BART station through a shared navbox. | Count only `[[links]]` written in the article's own wikitext. |
| Citations link to the publication they cite. | About 93% of the links to TechCrunch were inside citations. | Remove `<ref>` blocks and citation templates before counting. |
| Links to a redirect were not counted for the target article. 14% of links pointed at a redirect. | `[[California Gold Rush]]` redirects to *California gold rush*. | Count each link toward the article that the redirect points to. |

We checked each version of the count against the 11,778 human ratings. The
correlation rose from 0.367 (raw links) to 0.520 (after the fixes). We do not
treat the human ratings as correct answers. We used them to reject metrics that
disagreed with the ratings as a group.

The ranking code is in `scripts/reassess.js` (data collection and link counting)
and `scripts/rank.js` (ranking and output). Both run on a laptop. They are not
deployed and the bot never runs them.

### 4. Cut the ranking at a size people can follow

We measured how often articles at each rank are edited:

| Watchlist size | Edits per day (approx.) |
|---|---|
| Top 100 | 10 |
| Top 500 | 30 |
| Top 1,000 | 64 |
| Top 2,500 | 108 |

About 30 posts a day suits a Bluesky or Mastodon account. About 100 a day is
manageable in a Discord channel. We therefore chose 500 for the bot and 2,500
for the published wide list.

### 5. Publish the list and point the bot at it

`rank.js` writes the list with its date and a link to the method. The bot
downloads the list from a URL every 24 hours, as set in `config.base.json`:

```json
"watchlist_source": {
  "titles_url": "https://san-francisco-edit-stream.toolforge.org/watchlist-500.json",
  "refresh_hours": 24
}
```

If a download returns no articles, the bot treats it as a failure and keeps
the last good list.

### Known weaknesses

- **We regenerate the list by hand.** New articles and renamed articles are
  missing until someone reruns the scripts.
- **Some articles about technology products rank too high.** Infobox fields
  such as `products =` or `operating system =` contain links that the fixes in
  step 3 do not remove.
- **Articles about crimes rank too low.** People read them a lot, but few other
  articles link to them.
- **A low link count can mean the article is badly linked, not unimportant.**
  For example, 122 articles mention the Moscone–Milk assassinations without
  linking to the article about them.

## What we tried that did not work

The methodology document records each of these approaches with its numbers.
They are listed here so that another city does not need to test them again.

- **Wikidata alone.** Six structural Wikidata criteria together found only 273
  of the 503 Top and High articles. They missed Jack Kerouac, the Grateful
  Dead, the dot-com bubble and the gold rush, because Wikidata does not record
  "this is important to the region".
- **Wikipedia categories.** A category includes everyone who ever held a
  position, so categories made the list about ten times too large. They are
  useful for checking the list for missing articles, not for building it.
- **"Current office holder" queries on Wikidata.** A query for current members
  of the San Francisco Board of Supervisors returned 7 people for 11 seats,
  including a supervisor who left in 2012. Many entries lack end dates.
- **Pageviews, the number of WikiProjects that tag an article, and the number
  of editors of an article.** None of these improved the ranking. The number
  of WikiProjects correlated negatively with the human ratings (r = −0.082),
  because important topics attract more WikiProjects, not fewer.
- **Wikidata class (`P31`) rules.** Predicting an article's rating from its
  Wikidata class was only 2 percentage points more accurate than guessing
  "Low" every time.

## What another city might try

Choose the approach that fits the time you have. The approaches are listed from
fastest to most thorough.

### Option A: use your WikiProject's ratings (an hour)

If a WikiProject or task force tags your city's articles with importance
ratings, the bot can watch them directly:

```json
"watchlist_source": {
  "project": "Your WikiProject or task force name",
  "wikipedia": "English Wikipedia",
  "importance": ["Top", "High"],
  "refresh_hours": 24
}
```

Check the project name first. A wrong name returns no articles and gives no
error. Task force names include the parent project, as in `California/San
Francisco Bay Area task force`. When you query PageAssessments by hand, pass
`pasubprojects=true`; without it, articles tagged only by a task force are not
returned.

This option inherits whatever errors the ratings contain. Look through the
Top and High lists before you launch.

### Option B: rerun our ranking for your region (a day or two)

1. Write a region profile: copy `regions/sfba.json` to `regions/<name>.json`
   and edit it. The name (lowercase letters, digits, hyphens) names both the
   file and the cache directory. The fields that need thought:
   - `wikiproject`: your WikiProject or task force name. Check it first. A
     wrong name returns no articles and gives no error. Task force names
     include the parent project, as in `California/San Francisco Bay Area
     task force`.
   - `anchors`: the Wikidata QIDs of your region's top-level areas; the Bay
     Area uses its nine counties, starting with `Q62`, San Francisco.
   - `lead_terms`: place names whose early appearance in an article's lead
     marks a defining regional connection. Keep ambiguous names out.
   - `lead_exclusions`: uses of those names that are NOT about your region
     (for Miami: `Miami University`, `Miami, Oklahoma`). They are blanked
     out before the lead is scored.
   - `claim_targets`: the bot's claim-watch target cache, which the claims
     stage counts statements against. Leave it `null` if you do not have
     one; the claims stage then refuses to run, and `all` skips it with a
     log line.
2. Run each command with `--region <name>`: `node scripts/reassess.js
   --region <name> all`, then `node scripts/reassess-untagged.js --region
   <name> all`, then `node scripts/rank.js --region <name> --watchlist 500
   --wide 2500`. The link crawl reads every article in the universe, so
   expect it to take a while.
3. Caches live in `data/reassess/<name>/`, one file per stage: delete a
   file to force a re-fetch, and an interrupted run resumes. Old flat
   caches in `data/reassess/` are ignored: move them into
   `data/reassess/sfba/` to reuse them.
4. Read `data/reassess/<name>/ranking-report.md` before you publish the
   list. Look for articles that are on the list only because your region's
   articles mention them often. In our run, untagged articles such as
   Microsoft and UC Davis ranked high this way.
5. Publish `watchlist-500.json` from the same directory somewhere public
   and set `titles_url` to it.

If your region has no WikiProject, skip the tagged-articles part and build
the universe from Wikidata alone. Expect more irrelevant articles in the
ranking, and check the top of the list by hand.

### Option C: a Wikidata region topic (experimental)

The platform code in `lib/region.js` turns a Wikidata place QID into a set of
articles and rebuilds the set every night. A city or county uses `P131`
membership. A neighborhood uses coordinates inside its OpenStreetMap boundary.
This keeps the list current without hand reruns. However, it has the coverage
gap described under "Wikidata alone" above, because it finds articles about
things located in the place, not articles about the place's culture and
history. The plan to combine region membership, WikiProject tags and a top-N
ranking is in
[`docs/design-plans/2026-08-16-topic-membership-sources.md`](docs/design-plans/2026-08-16-topic-membership-sources.md).

## Getting the bot running

The bot runs on [Toolforge](https://toolforge.org). The steps are in
[`docs/deploy-toolforge.md`](docs/deploy-toolforge.md) and the main
[`README.md`](README.md). The values that are specific to San Francisco are:

| Where | What to change |
|---|---|
| `config.base.json` | `nick`; the post `template`; `watchlist_source`; `mastodon.instance`; `bluesky.identifier`; `wikidata_claims`; `topic_store.database` |
| Toolforge environment variables | `SFEDITS_DISCORD_WEBHOOK_URL`, `SFEDITS_BLUESKY_PASSWORD`, `SFEDITS_MASTODON_ACCESS_TOKEN`, `SFEDITS_INVITE_CODES` (set with `toolforge envvars create`); the first account uses these unprefixed names — each further account needs an `id`, and its secrets are `SFEDITS_<ID>_BLUESKY_PASSWORD` / `_MASTODON_ACCESS_TOKEN` / `_DISCORD_WEBHOOK_URL` |
| `toolforge-jobs.yaml` | the tool name `san-francisco-edit-stream` in each `image:` line |
| `lib/wikidata-claim-watch.js` | `BAY_AREA_COUNTIES`, if you use the Wikidata claim-change alerts |

A problem confined to a further account (a missing secret, or a bad or
duplicate `id`) disables only that account: the bot logs
`[config] account "<id>" disabled: …` at startup and keeps running.

Run `node page-watch.js --noop --verbose` first. It watches live edits and
prints what it would post, without posting anything.
