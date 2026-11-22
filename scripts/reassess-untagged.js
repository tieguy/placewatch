#!/usr/bin/env node

/**
 * Find English Wikipedia articles the SFBA task force has never tagged.
 * LOCAL companion to scripts/reassess.js - run that first (its cohort,
 * links to Wikidata targets, etc. are prerequisites).
 *
 * Candidates come from Wikidata structure: items whose located-in chain
 * reaches one of the nine Bay Area counties, items whose P19/P20/P159/
 * P276/P937 point at such a place, and P39 holders of Bay Area offices -
 * intersected with "has an enwiki article" and minus the current cohort.
 * As a WATCHLIST source this pull was too noisy (see IDEAS.md §3); as a
 * one-time tagging-candidate list, noise just means a human skims past.
 *
 * Candidates are then scored with the same significance metrics as the
 * main reassessment (inlinks from the cohort, Wikidata entanglement,
 * WikiProject count, lead position), percentile-ranked within the
 * candidate set, and the top slice reported with evidence.
 *
 * Usage: node scripts/reassess-untagged.js --region <name> <stage>|all
 * Stages: candidates links claims assessments leads report
 * Caches: data/reassess/<region>/untagged-<stage>.json
 */

const fs = require('fs')
const path = require('path')
const {
  percentileRanks, median, leadScore, fetchPageviews,
  api, batches, WD_API, region, setRegion, parseCli, loadTargets,
  noClaimTargetsSkip
} = require('./reassess')
const { loadProfile } = require('./region-profile')
const { sparqlRows, isRetryable } = require('../lib/sparql')
const { memberPattern } = require('../lib/region')

const REPORT_SIZE = 100
const sleep = ms => new Promise(r => setTimeout(r, ms))

function cachePath(stage) { return path.join(region().dataDir, `untagged-${stage}.json`) }
function loadCache(stage) {
  const p = cachePath(stage)
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null
}
function saveCache(stage, data) {
  fs.mkdirSync(region().dataDir, { recursive: true })
  fs.writeFileSync(cachePath(stage), JSON.stringify(data))
}
function requireMain(stage) {
  const p = path.join(region().dataDir, `${stage}.json`)
  if (!fs.existsSync(p)) throw new Error(`run scripts/reassess.js first (missing ${stage}.json)`)
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

// Helper to retry sparqlRows calls that fail transiently.
// The old local loop absorbed 5 failures; this preserves that semantics.
async function sparqlRowsWithRetry(query, maxAttempts = 5, retryDelayMs = 5000) {
  let lastError = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await sparqlRows(query)
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts && isRetryable(error)) {
        // Escalating backoff: matches pre-port semantics (5000 * attempt = 5/10/15/20s, tolerates ~50s overload)
        if (retryDelayMs > 0) await sleep(retryDelayMs * attempt)
        continue
      }
      // Final attempt or non-retryable error: give up
      break
    }
  }
  throw lastError
}

// ----------------------------------------------------------------- stages

/**
 * One candidate query: enwiki title projection over the shared membership
 * pattern (lib/region.js memberPattern - the same patterns the place-bot
 * platform matches topics with).
 */
function candidateQuery(via, county) {
  return `SELECT DISTINCT ?item ?title WHERE {
      ${memberPattern(via, county)}
      ?article schema:about ?item ;
      schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title . }`
}

/**
 * Enwiki articles for region-connected items, minus the cohort.
 * Anchored per-anchor queries only - the unanchored multi-anchor union
 * times out on WDQS (learned the hard way in the claim-watch work).
 */
async function stageCandidates() {
  const { anchors, untaggedProperties } = region()
  const cohortTitles = new Set(requireMain('cohort').map(a => a.title))
  const found = new Map() // title -> {qid, via:Set}

  function add(rows, via) {
    // sparqlRows returns simplified rows: {item: 'Q123', title: 'Article Title'}
    for (const row of rows) {
      const title = row.title
      const qid = row.item
      if (!found.has(title)) found.set(title, { qid, via: new Set() })
      found.get(title).via.add(via)
    }
  }

  let n = 0
  const total = anchors.length * (untaggedProperties.length + 2)
  for (const county of anchors) {
    // the places themselves, items pointing at them, and holders of offices
    // with regional jurisdiction (with retry: old loop absorbed 5 failures)
    for (const via of ['P131', ...untaggedProperties, 'P39']) {
      add(await sparqlRowsWithRetry(candidateQuery(via, county)), via)
      process.stdout.write(`\r  candidates: query ${++n}/${total}, ${found.size} titles`)
      await sleep(250)
    }
  }
  console.log()

  const candidates = [...found.entries()]
    .filter(([title]) => !cohortTitles.has(title))
    .map(([title, { qid, via }]) => ({ title, qid, via: [...via].sort() }))
  console.log(`  ${found.size} structurally connected articles, ` +
    `${candidates.length} not in the task force`)
  return candidates
}

/**
 * Inlinks from the task-force cohort into the candidate set. Re-crawls
 * cohort outlinks (the main run's crawl only kept cohort-internal hits).
 */
async function stageLinks(candidates) {
  const targetSet = new Set(candidates.map(c => c.title))
  const cohortTitles = requireMain('cohort').map(a => a.title)
  const checkpoint = loadCache('links-progress') || { nextBatch: 0, counts: {} }
  const counts = checkpoint.counts
  const allBatches = [...batches(cohortTitles, 50)]

  for (let b = checkpoint.nextBatch; b < allBatches.length; b++) {
    let cont = {}
    do {
      const data = await api(region().wikiApi, {
        action: 'query', prop: 'links', plnamespace: 0, pllimit: 'max',
        titles: allBatches[b].join('|'), ...cont
      })
      for (const page of Object.values(data.query?.pages || {})) {
        for (const link of (page.links || [])) {
          if (targetSet.has(link.title)) counts[link.title] = (counts[link.title] || 0) + 1
        }
      }
      cont = data.continue || null
      await sleep(50)
    } while (cont)
    if (b % 10 === 9 || b === allBatches.length - 1) {
      saveCache('links-progress', { nextBatch: b + 1, counts })
    }
    process.stdout.write(`\r  links: batch ${b + 1}/${allBatches.length}`)
  }
  console.log()
  fs.rmSync(cachePath('links-progress'), { force: true })
  return counts
}

/** Region statement counts for candidate items (same as main claims stage). */
async function stageClaims(candidates) {
  const targets = loadTargets()
  const places = new Set(targets.places)
  const positions = new Set(targets.positions)
  const qids = [...new Set(candidates.map(c => c.qid))]
  const checkpoint = loadCache('claims-progress') || { nextBatch: 0, counts: {} }
  const counts = checkpoint.counts
  const allBatches = [...batches(qids, 50)]

  for (let b = checkpoint.nextBatch; b < allBatches.length; b++) {
    const data = await api(WD_API, {
      action: 'wbgetentities', ids: allBatches[b].join('|'), props: 'claims'
    })
    for (const [qid, entity] of Object.entries(data.entities || {})) {
      let n = 0
      for (const [prop, claims] of Object.entries(entity.claims || {})) {
        for (const claim of claims) {
          const value = claim.mainsnak?.datavalue?.value
          const target = value && value['entity-type'] === 'item' ? `Q${value['numeric-id']}` : null
          if (target && (places.has(target) || (prop === 'P39' && positions.has(target)))) n++
        }
      }
      counts[qid] = n
    }
    if (b % 10 === 9 || b === allBatches.length - 1) {
      saveCache('claims-progress', { nextBatch: b + 1, counts })
    }
    process.stdout.write(`\r  claims: batch ${b + 1}/${allBatches.length}`)
    await sleep(50)
  }
  console.log()
  fs.rmSync(cachePath('claims-progress'), { force: true })
  return counts
}

/** Which WikiProjects DO tag each candidate (SFBA is zero by construction). */
async function stageAssessments(candidates) {
  const result = {}
  let done = 0
  for (const batch of batches(candidates.map(c => c.title), 50)) {
    const data = await api(region().wikiApi, {
      action: 'query', prop: 'pageassessments', pasubprojects: 'true',
      palimit: 'max', titles: batch.join('|')
    })
    const renames = {}
    for (const n of (data.query?.normalized || [])) renames[n.to] = n.from
    for (const page of Object.values(data.query?.pages || {})) {
      const title = renames[page.title] || page.title
      result[title] = { otherProjects: Object.keys(page.pageassessments || {}).length }
    }
    done += batch.length
    process.stdout.write(`\r  assessments: ${done}/${candidates.length}`)
    await sleep(50)
  }
  console.log()
  return result
}

async function stageLeads(candidates) {
  const checkpoint = loadCache('leads-progress') || { nextBatch: 0, scores: {} }
  const scores = checkpoint.scores
  const allBatches = [...batches(candidates.map(c => c.title), 20)]

  for (let b = checkpoint.nextBatch; b < allBatches.length; b++) {
    const data = await api(region().wikiApi, {
      action: 'query', prop: 'extracts', exintro: 1, explaintext: 1,
      exlimit: 'max', titles: allBatches[b].join('|')
    })
    const renames = {}
    for (const n of (data.query?.normalized || [])) renames[n.to] = n.from
    for (const page of Object.values(data.query?.pages || {})) {
      const title = renames[page.title] || page.title
      const { score, term } = leadScore(page.extract)
      scores[title] = term ? { score, term } : { score }
    }
    if (b % 25 === 24 || b === allBatches.length - 1) {
      saveCache('leads-progress', { nextBatch: b + 1, scores })
    }
    process.stdout.write(`\r  leads: batch ${b + 1}/${allBatches.length}`)
    await sleep(50)
  }
  console.log()
  fs.rmSync(cachePath('leads-progress'), { force: true })
  return scores
}

async function stageReport() {
  const candidates = loadCache('candidates')
  const links = loadCache('links')
  const claims = loadCache('claims')
  const assessments = loadCache('assessments')
  const leads = loadCache('leads')
  if (!candidates || !links || !claims || !assessments || !leads) {
    throw new Error('missing untagged stage caches')
  }

  const rows = candidates.map(({ title, qid, via }) => ({
    title,
    qid,
    via,
    inlink: links[title] || 0,
    entangle: claims[qid] || 0,
    exclusive: 1 / (1 + (assessments[title]?.otherProjects ?? 0)),
    lead: leads[title]?.score ?? 0,
    leadTerm: leads[title]?.term || null
  }))
  const metrics = ['inlink', 'entangle', 'exclusive', 'lead']
  for (const metric of metrics) {
    const ranks = percentileRanks(rows.map(r => r[metric]))
    rows.forEach((row, i) => { row[`${metric}Pct`] = ranks[i] })
  }
  for (const row of rows) row.significance = median(metrics.map(m => row[`${m}Pct`]))
  rows.sort((a, b) => b.significance - a.significance)
  saveCache('scores', rows)

  const top = rows.slice(0, REPORT_SIZE)
  console.log(`  fetching pageviews for top ${top.length}`)
  for (const r of top) {
    r.views = await fetchPageviews(r.title)
    await sleep(60)
  }

  const md = `# Articles not tagged by the SFBA task force

${rows.length} enwiki articles are structurally connected to the Bay Area
on Wikidata (located-in chain, birth/death/HQ/work location, or Bay Area
office) but carry no ${region().project} tag. Top ${top.length} by the same
significance score as the main reassessment, ranked within this set:

| Article | Signif. | Cohort inlinks | BA statements | Via | Other projects | Lead | Views/yr |
|---|---|---|---|---|---|---|---|
${top.map(r =>
  `| [${r.title.replace(/\|/g, '\\|')}](https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))})` +
  ` | ${(100 * r.significance).toFixed(1)} | ${r.inlink} | ${r.entangle} | ${r.via.join(' ')}` +
  ` | ${Math.round(1 / r.exclusive - 1)} | ${r.leadTerm ? `${r.lead.toFixed(2)} "${r.leadTerm}"` : '-'}` +
  ` | ${r.views == null ? '?' : r.views.toLocaleString('en-US')} |`).join('\n')}
`
  fs.writeFileSync(path.join(region().dataDir, 'untagged-report.md'), md)
  console.log(`  wrote ${path.join(region().dataDir, 'untagged-report.md')}`)
  return top
}

const STAGES = {
  candidates: () => stageCandidates(),
  links: () => stageLinks(requireStage('candidates')),
  claims: () => stageClaims(requireStage('candidates')),
  assessments: () => stageAssessments(requireStage('candidates')),
  leads: () => stageLeads(requireStage('candidates')),
  report: () => stageReport()
}

function requireStage(stage) {
  const data = loadCache(stage)
  if (!data) throw new Error(`stage "${stage}" has not run yet`)
  return data
}

async function main() {
  let parsed
  try {
    parsed = parseCli(process.argv.slice(2), STAGES)
  } catch (error) {
    console.error(`usage: node scripts/reassess-untagged.js --region <name> <${Object.keys(STAGES).join('|')}|all>`)
    console.error(error.message)
    process.exit(1)
  }
  setRegion(loadProfile(parsed.region))
  const toRun = parsed.stage === 'all' ? Object.keys(STAGES) : [parsed.stage]
  // The ranking needs only candidates and links; without claim_targets,
  // claims cannot run and everything after it only feeds report - so 'all'
  // stops after links and still ends cleanly
  const { skipped, line } = noClaimTargetsSkip(parsed.stage,
    ['claims', 'assessments', 'leads', 'report'])
  for (const stage of toRun) {
    if (skipped.includes(stage)) {
      if (line && stage === skipped[0]) console.log(line)
      continue
    }
    if (parsed.stage === 'all' && stage !== 'report' && loadCache(stage)) {
      console.log(`${stage}: cached, skipping`)
      continue
    }
    console.log(`${stage}:`)
    const started = Date.now()
    const result = await STAGES[stage]()
    if (stage !== 'report') saveCache(stage, result)
    console.log(`${stage}: done in ${Math.round((Date.now() - started) / 1000)}s`)
  }
}

if (require.main === module) {
  main().catch(error => { console.error(error); process.exit(1) })
}

module.exports = { candidateQuery, region }
