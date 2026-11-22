const fs = require('fs')
const os = require('os')
const path = require('path')
const { assert } = require('chai')

const { loadProfile, leadMatcher } = require('../scripts/region-profile')

// The 35 lead terms at scripts/reassess.js:62-70, copied verbatim.
const BAY_AREA_TERMS = [
  'San Francisco', 'Bay Area', 'Silicon Valley', 'Oakland', 'Berkeley',
  'San Jose', 'San José', 'Palo Alto', 'Stanford', 'Marin County',
  'Sausalito', 'Napa', 'Sonoma', 'Santa Clara', 'San Mateo', 'Alameda',
  'Contra Costa', 'Solano', 'Golden Gate', 'Cupertino', 'Mountain View',
  'Menlo Park', 'Redwood City', 'Sunnyvale', 'Fremont, California',
  'Vallejo', 'Hayward', 'Daly City', 'Emeryville', 'Mission District',
  'Haight-Ashbury', 'Presidio', 'Golden State Warriors', 'Alcatraz', 'Caltrain'
]

describe('region-profile', function() {

  describe('sfba profile', function() {
    const profile = loadProfile('sfba')

    it('sfba profile carries the old reassess.js constants verbatim', function() {
      assert.equal(profile.wikiproject, 'California/San Francisco Bay Area task force')
      assert.deepEqual(profile.anchors,
        ['Q62', 'Q107146', 'Q108058', 'Q108117', 'Q108137',
          'Q108101', 'Q110739', 'Q108083', 'Q108067'])
      assert.deepEqual(profile.untagged_properties, ['P19', 'P20', 'P159', 'P276', 'P937'])
      assert.deepEqual(profile.lead_terms, BAY_AREA_TERMS)
      assert.deepEqual(profile.lead_exclusions, [])
      assert.deepEqual(profile.live_importance, ['top', 'high', 'mid'])
      assert.equal(profile.claim_targets, 'data/wikidata-claim-targets.json')
      assert.equal(profile.wiki_api, 'https://en.wikipedia.org/w/api.php')
    })
  })

  describe('miami profile', function() {
    const profile = loadProfile('miami')

    it('miami profile has three anchors, WikiProject "Miami", and no claim targets', function() {
      assert.equal(profile.name, 'miami')
      assert.equal(profile.label, 'Miami metropolitan area')
      assert.equal(profile.wikiproject, 'Miami')
      assert.equal(profile.wiki_api, 'https://en.wikipedia.org/w/api.php')
      assert.lengthOf(profile.anchors, 3)
      profile.anchors.forEach(qid => assert.match(qid, /^Q\d+$/))
      assert.deepEqual(profile.untagged_properties, ['P19', 'P20', 'P159', 'P276', 'P937'])
      assert.deepEqual(profile.live_importance, ['top', 'high', 'mid'])
      assert.isNull(profile.claim_targets)
      assert.deepEqual(profile.exclude_titles, [])
    })
  })

  describe('loadProfile', function() {
    it('rejects unknown and unsafe names', function() {
      assert.throws(() => loadProfile('nowhere'), /no region profile "nowhere"/)
      assert.throws(() => loadProfile('../x'))
    })

    it('names a missing field', function() {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'region-profile-'))
      fs.writeFileSync(path.join(dir, 'bare.json'), JSON.stringify({
        name: 'bare', label: 'Bare', wikiproject: 'Bare', wiki_api: 'x',
        untagged_properties: [], lead_terms: [], lead_exclusions: [],
        live_importance: []
      }))
      assert.throws(() => loadProfile('bare', { dir }), /missing "anchors"/)
    })
  })

  describe('leadMatcher', function() {
    it('leadMatcher escapes regex characters', function() {
      const matcher = leadMatcher({
        lead_terms: ['St. Louis (city)'],
        lead_exclusions: ['St. Louis (city), Missouri']
      })
      assert.match('born in St. Louis (city) long ago', matcher.termsRe)
      assert.notMatch('StX Louis city', matcher.termsRe)
      assert.match('grew up in St. Louis (city), Missouri', matcher.exclusionsRe)
    })

    it('returns a null exclusions regex when there are no exclusions', function() {
      const matcher = leadMatcher({ lead_terms: ['Napa'], lead_exclusions: [] })
      assert.instanceOf(matcher.termsRe, RegExp)
      assert.isNull(matcher.exclusionsRe)
    })
  })
})
