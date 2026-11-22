const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { assert } = require('chai')
const { describe, it } = require('mocha')

const { candidateQuery, region } = require('../scripts/reassess-untagged')
const { memberPattern } = require('../lib/region')

describe('reassess-untagged', function() {
  describe('candidateQuery', function() {
    it('composes the located-in query from the shared membership pattern', function() {
      const query = candidateQuery('P131', 'Q62')
      assert.include(query, memberPattern('P131', 'Q62'))
      assert.include(query, 'SELECT DISTINCT ?item ?title')
      assert.include(query, 'schema:isPartOf <https://en.wikipedia.org/>')
    })

    it('composes pointer-property queries from the shared membership pattern', function() {
      const query = candidateQuery('P937', 'Q62')
      assert.include(query, memberPattern('P937', 'Q62'))
    })

    it('composes the office-holder query from the shared membership pattern', function() {
      const query = candidateQuery('P39', 'Q62')
      assert.include(query, memberPattern('P39', 'Q62'))
    })

    it('rejects an invalid county QID before querying', function() {
      assert.throws(() => candidateQuery('P131', 'Q0abc'), /QID/)
    })

    it('composes a query for every sfba anchor', function() {
      for (const anchor of region().anchors) {
        assert.include(candidateQuery('P131', anchor), memberPattern('P131', anchor))
      }
    })

    it('keeps the deliberately wider tagging-candidate property set', function() {
      // Born/died/worked-here are excluded from watchlist membership
      // (lib/region IS_HERE_PROPERTIES) but kept here: as a one-time
      // tagging-candidate list, noise just means a human skims past.
      assert.deepEqual(region().untaggedProperties,
        ['P19', 'P20', 'P159', 'P276', 'P937'])
    })
  })

  describe("untagged 'all' without claim_targets", function() {
    this.timeout(10000)
    const repo = path.join(__dirname, '..')
    const miamiDir = path.join(repo, 'data', 'reassess', 'miami')

    // Cache hits for every claims-independent stage keep the run offline;
    // the skip rule alone decides claims and report (report reads claims).
    beforeEach(function() {
      if (fs.existsSync(miamiDir)) this.skip()  // never clobber a real Miami run
      fs.mkdirSync(miamiDir, { recursive: true })
      for (const name of ['cohort', 'untagged-candidates', 'untagged-links',
        'untagged-assessments', 'untagged-leads']) {
        fs.writeFileSync(path.join(miamiDir, `${name}.json`), '[]')
      }
    })
    afterEach(function() { fs.rmSync(miamiDir, { recursive: true, force: true }) })

    it("skips claims and report and ends cleanly", function() {
      const out = spawnSync('node',
        ['scripts/reassess-untagged.js', '--region', 'miami', 'all'],
        { cwd: repo, encoding: 'utf8' })
      assert.equal(out.status, 0, out.stderr)
      assert.include(out.stdout,
        'region "miami" has no claim_targets; skipping claims and report — run scripts/rank.js for the ranking')
      assert.lengthOf(out.stdout.match(/has no claim_targets; skipping/g), 1)
      assert.notInclude(out.stdout, 'missing untagged stage caches')
    })

    it('a direct claims run still throws instead of skipping', function() {
      const out = spawnSync('node',
        ['scripts/reassess-untagged.js', '--region', 'miami', 'claims'],
        { cwd: repo, encoding: 'utf8' })
      assert.equal(out.status, 1)
      assert.match(out.stderr,
        /region "miami" has no claim_targets; the claims stage needs them/)
    })
  })
})
