const { assert } = require('chai')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { rank, pearson, DEFAULTS } = require('../scripts/rank')
const { loadProfile } = require('../scripts/region-profile')

const INPUT = path.join(__dirname, 'fixtures', 'rank', 'input')
const GOLDEN = path.join(__dirname, 'fixtures', 'rank', 'golden')

// The fixtures are one synthetic Bay Area scenario, small enough to read:
//
//   cohort.json            21 tagged articles - a mix of top/high/mid/low and
//                          two 'unknown', plus one 'na' (a template) that
//                          buildUniverse must drop as a non-article.
//   untagged-candidates    5 candidates. Four reach the universe through
//                          IS_HERE_PROPERTIES (P131/P276); Steve Jobs carries
//                          only P19 (place of birth), so he never ranks.
//   links-prose-all        Prose link counts only. Palo Alto's only link to
//                          Silicon Valley sits in a navbox, so that edge is
//                          absent here and must stay absent from the counts.
//                          "California", "Steve Jobs" and "Fresno, California"
//                          are targets no universe article resolves to - they
//                          must be skipped, not crashed on.
//   redirects.json         Self-maps for every crawled title, plus "Frisco" and
//                          "SF" folding onto San Francisco (18 direct + 6 via
//                          "Frisco" = 24 inlinks). Several inlink ties (at 9, 4,
//                          3, 2, 1 and 0) pin the title tie-break.
//
// The golden files were produced by running the UNMODIFIED original rank.js
// (from fork/place-bot-platform-design) over these caches with
// --watchlist 5 --wide 10. They pin the refactor to zero behaviour change.

describe('rank', function() {
  let outDir, result

  before(function() {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfedits-rank-'))
    result = rank({ dataDir: INPUT, outDir, opts: { ...DEFAULTS, watchlist: 5, wide: 10 },
      profile: loadProfile('sfba') })
  })

  after(function() {
    fs.rmSync(outDir, { recursive: true, force: true })
  })

  it('golden test still passes with the sfba profile', function() {
    const actual = JSON.parse(fs.readFileSync(path.join(outDir, 'ranking.json'), 'utf8'))
    const golden = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'ranking.json'), 'utf8'))
    assert.deepEqual(actual.map(r => r.title), golden.map(r => r.title),
      'ranking titles, in order')
    golden.forEach((g, i) => {
      assert.equal(actual[i].tier, g.tier, `tier of ${g.title}`)
      assert.equal(actual[i].inlinks, g.inlinks, `inlinks of ${g.title}`)
    })

    // The published cuts carry a generated_at stamp; everything else is pinned.
    const strip = (o) => { const c = { ...o }; delete c.generated_at; return c }
    for (const name of ['watchlist-5.json', 'watchlist-10.json']) {
      const g = strip(JSON.parse(fs.readFileSync(path.join(GOLDEN, name), 'utf8')))
      const a = strip(JSON.parse(fs.readFileSync(path.join(outDir, name), 'utf8')))
      assert.deepEqual(a.titles, g.titles, `${name} titles, in order`)
      assert.deepEqual(a, g, name)
    }
  })

  it('writes the same files the original wrote', function() {
    for (const name of ['ranking.json', 'watchlist.json',
      'watchlist-5.json', 'watchlist-10.json', 'ranking-report.md']) {
      assert.isTrue(fs.existsSync(path.join(outDir, name)), `${name} written`)
    }
    // the legacy bare-array shape, not the published-with-provenance one
    const legacy = JSON.parse(fs.readFileSync(path.join(outDir, 'watchlist.json'), 'utf8'))
    assert.deepEqual(legacy, [
      'San Francisco', 'Oakland, California', 'Silicon Valley',
      'Berkeley, California', 'Golden Gate Bridge'
    ])
  })

  it('pins the universe and folding rules the fixture exercises', function() {
    const { ranked, watchlist, wide } = result
    const titles = ranked.map(r => r.title)

    assert.notInclude(titles, 'Steve Jobs') // P19-only candidate: born here, not OF here
    assert.notInclude(titles, 'Template:San Francisco') // 'na' importance: non-article

    const by = (t) => ranked.find(r => r.title === t)
    assert.equal(by('San Francisco').inlinks, 24) // 18 direct + 6 folded from "Frisco"
    assert.equal(by('Silicon Valley').inlinks, 11) // Palo Alto's navbox-only link not counted
    assert.equal(by('Salesforce Tower').tagged, false) // candidate ranked alongside the cohort

    // ties break by title, both above and below the watchlist cuts
    assert.isBelow(titles.indexOf('Berkeley, California'), titles.indexOf('Golden Gate Bridge'))
    assert.isBelow(titles.indexOf('Bay Area Rapid Transit'), titles.indexOf('San Jose, California'))
    assert.isBelow(titles.indexOf('Grace Cathedral (San Francisco)'), titles.indexOf('Half Moon Bay, California'))

    assert.equal(watchlist.length, 5)
    assert.equal(wide.length, 10)
    assert.deepEqual(watchlist.map(r => r.title), titles.slice(0, 5))
  })

  it('exclude_titles removes a title from the ranking', function() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfedits-rank-'))
    try {
      const profile = { ...loadProfile('sfba'), exclude_titles: ['Golden Gate Bridge'] }
      const { ranked } = rank({ dataDir: INPUT, outDir: dir,
        opts: { ...DEFAULTS, watchlist: 5, wide: 10 }, profile })
      assert.notInclude(ranked.map(r => r.title), 'Golden Gate Bridge',
        'the excluded title must not rank')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('pearson: perfect, inverse and degenerate inputs', function() {
    assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1)
    assert.equal(pearson([1, 2, 3], [3, 2, 1]), -1)
    assert.isNull(pearson([1, 1, 1], [1, 2, 3]))
  })

  it('report includes the validation section', function() {
    const md = fs.readFileSync(path.join(outDir, 'ranking-report.md'), 'utf8')
    assert.include(md, '## Validation against human ratings')
    assert.include(md, 'r = 0.520')
  })

  it('report names the region, not the Bay Area', function() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfedits-rank-'))
    try {
      // the fixture universe contains real titles like "Bay Area Rapid
      // Transit", so what must go is the Bay Area *branding*: the header
      // and the "nine counties" phrase, not the article names
      const profile = { ...loadProfile('sfba'), label: 'Testville' }
      rank({ dataDir: INPUT, outDir: dir, opts: { ...DEFAULTS, watchlist: 5, wide: 10 },
        profile })
      const md = fs.readFileSync(path.join(dir, 'ranking-report.md'), 'utf8')
      assert.equal(md.slice(0, md.indexOf('\n')), '# Testville article ranking')
      assert.include(md, 'Testville')
      assert.notInclude(md, 'Bay Area article ranking')
      assert.notInclude(md, 'nine counties')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
