#!/usr/bin/env node

/**
 * Produce a region's article ranking, proposed importance tiers, and the bot
 * watchlist, from caches built by reassess.js and reassess-untagged.js.
 * LOCAL tool - never deployed, never run by the bot.
 *
 * The ranking is a single measure: how many other articles IN THE UNIVERSE link
 * to this one from their own prose, with navbox/template links excluded and
 * redirects folded onto canonical titles.
 *
 * The universe is every tagged article plus Wikidata candidates whose data says
 * the subject IS in the region (located in / headquartered / at / holds a
 * regional office), NOT merely that a person was born, died or worked here.
 * Sources and targets both come from that set - counting links only from tagged
 * articles would make under-tagged parts of the region look less central, which
 * is self-reinforcing. Titles the region profile excludes (profile towns,
 * sandbagged articles) are dropped from the universe before ranking.
 *
 * Tier CUTS are a judgement call the data cannot make. The defaults below are a
 * proposal, not a finding; --top/--high/--mid override them.
 *
 * Method and evidence: docs/importance-ranking-methodology.md
 *
 * Usage: node scripts/rank.js --region <name> [--watchlist N] [--wide N]
 *                             [--top 0.0025] [--high 0.025] [--mid 0.15]
 * Outputs (data/reassess/<name>/):
 *   ranking.json          every article, ranked, with tier and current rating
 *   watchlist.json        the top N titles, bare array (legacy shape)
 *   watchlist-500.json    the bot's list, with provenance - published
 *   watchlist-2500.json   the wide list, with provenance - published, unwatched
 *   ranking-report.md     human-readable summary + the diffs
 */

const fs = require('fs')
const path = require('path')
const minimist = require('minimist')
const {
  canonicalInlinks, buildUniverse, assignTiers, percentileRanks,
  IS_HERE_PROPERTIES
} = require('./reassess')
const { loadProfile } = require('./region-profile')

const DEFAULTS = { top: 0.0025, high: 0.025, mid: 0.15, watchlist: 500, wide: 2500 }

/**
 * The two published cuts of one ranking. The narrow list is what the bot
 * watches; the wide list is published for transparency and for anyone who
 * wants fuller coverage. Narrow is always a prefix of wide, so an article
 * never appears in the wide list but not the narrow one at a higher rank.
 */
function cuts(ranked, opts) {
  return {
    narrow: ranked.slice(0, opts.watchlist),
    wide: ranked.slice(0, opts.wide)
  }
}

function load(dataDir, name) {
  const p = path.join(dataDir, `${name}.json`)
  if (!fs.existsSync(p)) throw new Error(`missing ${p} - run the reassess stages first`)
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

/**
 * Parse `--region <name> [--watchlist N] [--wide N] [--top F] [--high F]
 * [--mid F]`. Same missing-region message as reassess.js.
 * @returns {{ region: string, opts: Object }}
 */
function parseArgs(argv) {
  const args = minimist(argv, { string: ['region'] })
  if (!args.region) throw new Error('--region is required')
  const opts = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS)) {
    if (args[key] === undefined) continue
    opts[key] = Number(args[key])
    if (!Number.isFinite(opts[key])) throw new Error(`bad value for --${key}`)
  }
  return { region: args.region, opts }
}

const regionDir = (name) => path.join(__dirname, '..', 'data', 'reassess', name)

/**
 * Pearson correlation of two equal-length samples, or null when either side
 * has zero variance or there are fewer than 2 points.
 */
function pearson(xs, ys) {
  if (xs.length !== ys.length) throw new Error('pearson: samples differ in length')
  if (xs.length < 2) return null
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return null
  return sxy / Math.sqrt(sxx * syy)
}

const url = t => `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`
const link = t => `[${t.replace(/\|/g, '\\|')}](${url(t)})`

function table(rows, { showTier = true } = {}) {
  const head = `| Article | Links | Current | ${showTier ? 'Proposed |' : ''}\n` +
    `|---|---|---|${showTier ? '---|' : ''}\n`
  return head + rows.map(r =>
    `| ${link(r.title)} | ${r.inlinks} | ${r.tagged ? r.importance : '*untagged*'} |` +
    (showTier ? ` ${r.tier} |` : '')
  ).join('\n') + '\n'
}

/**
 * One ranking run: read the four reassess caches from dataDir, write ranking
 * files into outDir, return the rows. Everything the CLI prints is printed
 * here too, so a library caller sees exactly what a run produced.
 *
 * The region profile supplies the excluded titles (dropped from the universe
 * before ranking), the live importance filter (the deployed bot's, the only
 * honest baseline for the added/dropped diff) and the report's wording.
 * @returns {{ ranked: Array, watchlist: Array, wide: Array }}
 */
function rank({ dataDir, outDir, opts = { ...DEFAULTS }, profile = loadProfile('sfba') }) {
  const cohort = load(dataDir, 'cohort')
  const candidates = load(dataDir, 'untagged-candidates')
  const proseAll = load(dataDir, 'links-prose-all')
  const redirects = load(dataDir, 'redirects')

  const excluded = new Set(profile.exclude_titles)
  const universe = buildUniverse(cohort, candidates)
    .filter(u => !excluded.has(u.title))
  const counts = canonicalInlinks(proseAll, redirects, universe.map(u => u.title))
  universe.forEach(u => { u.inlinks = counts[u.title] || 0 })
  // ties broken by title so the output is stable between runs
  universe.sort((a, b) => b.inlinks - a.inlinks || a.title.localeCompare(b.title))
  const ranked = assignTiers(universe, opts)

  const RANK = { top: 3, high: 2, mid: 1, low: 0 }
  const rated = ranked.filter(r => RANK[r.importance] !== undefined)
  const unchanged = rated.filter(r => r.tier === r.importance).length
  const promoted = rated.filter(r => RANK[r.tier] > RANK[r.importance])
  const demoted = rated.filter(r => RANK[r.tier] < RANK[r.importance])
  const unrated = ranked.filter(r => r.importance === 'unknown')
  const newlyTagged = ranked.filter(r => !r.tagged)

  // Validation: how well does the inlink measure reproduce the human ratings?
  // SF's published headline (§5.1) is for canonical inlinks; log1p and the
  // percentile rank bracket it, and none of the three is the transform behind
  // the published figure.
  const ratings = rated.map(r => RANK[r.importance])
  const inlinks = rated.map(r => r.inlinks)
  const validation = [
    ['canonical inlinks', pearson(inlinks, ratings)],
    ['Math.log1p(inlinks)', pearson(inlinks.map(v => Math.log1p(v)), ratings)],
    ['inlink percentile rank', pearson(percentileRanks(inlinks), ratings)]
  ]
  const fmtR = (r) => r === null ? '—' : r.toFixed(3)

  const liveImportance = profile.live_importance

  // the bot watchlist: purely the top N of the ranking
  const { narrow: watchlist, wide } = cuts(ranked, opts)
  const currentWatch = new Set(
    cohort.filter(a => liveImportance.includes(a.importance)).map(a => a.title))
  const watchNow = new Set(watchlist.map(r => r.title))
  const added = watchlist.filter(r => !currentWatch.has(r.title))
  const dropped = ranked.filter(r => currentWatch.has(r.title) && !watchNow.has(r.title))
    .sort((a, b) => b.inlinks - a.inlinks)

  // Published lists carry provenance: a bare array is hard to audit once it is
  // sitting on a webserver detached from the run that produced it.
  const publish = (titles) => JSON.stringify({
    generated_at: new Date().toISOString(),
    method: 'https://github.com/tieguy/sfedits/blob/integration/docs/importance-ranking-methodology.md',
    universe: ranked.length,
    count: titles.length,
    titles
  })

  fs.writeFileSync(path.join(outDir, 'ranking.json'), JSON.stringify(ranked))
  fs.writeFileSync(path.join(outDir, 'watchlist.json'),
    JSON.stringify(watchlist.map(r => r.title)))
  fs.writeFileSync(path.join(outDir, `watchlist-${opts.watchlist}.json`),
    publish(watchlist.map(r => r.title)))
  fs.writeFileSync(path.join(outDir, `watchlist-${opts.wide}.json`),
    publish(wide.map(r => r.title)))

  const pct = (a, b) => `${(100 * a / b).toFixed(0)}%`
  const md = `# ${profile.label} article ranking

Generated by \`scripts/rank.js\` on ${new Date().toISOString().slice(0, 10)}.
Method: [docs/importance-ranking-methodology.md](../../docs/importance-ranking-methodology.md)

Universe: **${ranked.length}** articles — ${ranked.filter(r => r.tagged).length} already
tagged, ${newlyTagged.length} Wikidata candidates whose data places them in the
region's ${profile.anchors.length} counties via ${IS_HERE_PROPERTIES.join('/')}.

Ranked by prose links from other articles in the universe, navbox links excluded,
redirects folded.

## Proposed tiers

Cut points are a judgement call, not a finding. These are a proposal.

| Tier | Share | Articles | Link cutoff |
|---|---|---|---|
| Top | ${(100 * opts.top).toFixed(2)}% | ${ranked.filter(r => r.tier === 'top').length} | ${ranked.cutoffs.top} |
| High | ${(100 * opts.high).toFixed(1)}% | ${ranked.filter(r => r.tier === 'high').length} | ${ranked.cutoffs.high} |
| Mid | ${(100 * opts.mid).toFixed(0)}% | ${ranked.filter(r => r.tier === 'mid').length} | ${ranked.cutoffs.mid} |
| Low | rest | ${ranked.filter(r => r.tier === 'low').length} | |

## Effect on existing ratings

Of ${rated.length} currently-rated articles:

- unchanged: **${unchanged}** (${pct(unchanged, rated.length)})
- promoted: ${promoted.length}
- demoted: ${demoted.length}

${unrated.length} articles currently carry the banner with no rating and would get one.
${newlyTagged.length} articles are not tagged at all; of those,
${newlyTagged.filter(r => r.tier !== 'low').length} are proposed above Low and
warrant human review before being applied.

## Validation against human ratings

Over the ${rated.length} tagged articles rated low/mid/high/top, Pearson r
between the human rating (0–3) and each transform of canonical inlinks:

| Measure | n | Pearson r |
|---|---|---|
${validation.map(([measure, r]) => `| ${measure} | ${rated.length} | ${fmtR(r)} |`).join('\n')}

SF's published r = 0.520 (docs/importance-ranking-methodology.md §5.1); the inlink transform behind that figure is not recorded.

## Newly tagged, proposed above Low

${table(newlyTagged.filter(r => r.tier !== 'low'))}
## Top ${opts.watchlist} — the bot watchlist

Currently the bot watches **${currentWatch.size}** articles: everything rated
${liveImportance.map(i => i[0].toUpperCase() + i.slice(1)).join(', ')}.
Switching to the top ${opts.watchlist} of this ranking would **add ${added.length}**
and **drop ${dropped.length}** — a deliberate reduction in coverage, not a swap.

A wider cut of the same ranking is published alongside it as
\`watchlist-${opts.wide}.json\` (${wide.length} articles) for anyone who wants
fuller coverage than the bot posts.

### First 50 of the ranking

${table(ranked.slice(0, 50))}
### Added to the watchlist (${added.length})

${table(added)}
### Dropped from the watchlist (${dropped.length})

${table(dropped)}`

  fs.writeFileSync(path.join(outDir, 'ranking-report.md'), md)

  console.log(`universe ${ranked.length} (${ranked.filter(r => r.tagged).length} tagged + ${newlyTagged.length} new)`)
  console.log(`tiers: top ${ranked.filter(r => r.tier === 'top').length} (>=${ranked.cutoffs.top} links)` +
    `  high ${ranked.filter(r => r.tier === 'high').length} (>=${ranked.cutoffs.high})` +
    `  mid ${ranked.filter(r => r.tier === 'mid').length} (>=${ranked.cutoffs.mid})` +
    `  low ${ranked.filter(r => r.tier === 'low').length}`)
  console.log(`existing ratings: ${unchanged} unchanged (${pct(unchanged, rated.length)}), ` +
    `${promoted.length} promoted, ${demoted.length} demoted`)
  console.log(`watchlist: +${added.length} / -${dropped.length} vs the current ${currentWatch.size}`)
  console.log(`wrote ranking.json, watchlist.json, ranking-report.md`)

  return { ranked, watchlist, wide }
}

function main() {
  const { region: name, opts } = parseArgs(process.argv.slice(2))
  const dir = regionDir(name)
  rank({ dataDir: dir, outDir: dir, opts, profile: loadProfile(name) })
}

if (require.main === module) {
  try { main() } catch (error) { console.error(error.message); process.exit(1) }
}

module.exports = { rank, parseArgs, pearson, DEFAULTS, cuts }
