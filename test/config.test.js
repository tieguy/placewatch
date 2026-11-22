const { describe, it, beforeEach, afterEach } = require('mocha')
const { assert } = require('chai')
const sinon = require('sinon')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadConfig } = require('../lib/config')

describe('lib/config', function() {
  let dir

  beforeEach(function() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'))
  })

  afterEach(function() {
    sinon.restore()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('loads config.base.json from an explicit baseDir', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify({ nick: 'testbot', accounts: [] }))
    const config = loadConfig({ baseDir: dir, env: {} })
    assert.equal(config.nick, 'testbot')
  })

  it('throws a clear error when config.base.json is missing', function() {
    assert.throws(
      () => loadConfig({ baseDir: dir, env: {} }),
      /missing.*config\.base\.json/
    )
  })

  it('local config.json overlay overrides scalar values from base and deep-merges objects', function() {
    const base = {
      nick: 'basebot',
      accounts: [{
        collapse: { window_minutes: 15, enabled: true }
      }]
    }
    const overlay = {
      nick: 'overlaybot',
      accounts: [{
        collapse: { enabled: false }
      }]
    }
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(base))
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(overlay))

    const config = loadConfig({ baseDir: dir, env: {} })
    assert.equal(config.nick, 'overlaybot')
    assert.equal(config.accounts[0].collapse.window_minutes, 15)
    assert.equal(config.accounts[0].collapse.enabled, false)
  })

  it('overlay leaves base untouched where the overlay is silent', function() {
    const base = {
      nick: 'basebot',
      web: { max_articles: 5000 }
    }
    const overlay = {
      nick: 'overlaybot'
    }
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(base))
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(overlay))

    const config = loadConfig({ baseDir: dir, env: {} })
    assert.equal(config.nick, 'overlaybot')
    assert.equal(config.web.max_articles, 5000)
  })

  it('SFEDITS_BLUESKY_PASSWORD lands at accounts[0].bluesky.password', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify({
      accounts: [{ bluesky: { identifier: 'test.bsky.social' } }]
    }))

    const config = loadConfig({ baseDir: dir, env: { SFEDITS_BLUESKY_PASSWORD: 'secret123' } })
    assert.equal(config.accounts[0].bluesky.password, 'secret123')
    assert.equal(config.accounts[0].bluesky.identifier, 'test.bsky.social')
  })

  it('SFEDITS_MASTODON_ACCESS_TOKEN lands at accounts[0].mastodon.access_token', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify({
      accounts: [{ mastodon: { instance: 'mastodon.social' } }]
    }))

    const config = loadConfig({ baseDir: dir, env: { SFEDITS_MASTODON_ACCESS_TOKEN: 'token456' } })
    assert.equal(config.accounts[0].mastodon.access_token, 'token456')
    assert.equal(config.accounts[0].mastodon.instance, 'mastodon.social')
  })

  it('SFEDITS_DISCORD_WEBHOOK_URL lands at accounts[0].discord.webhook_url', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify({
      accounts: [{ discord: { } }]
    }))

    const config = loadConfig({ baseDir: dir, env: { SFEDITS_DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123' } })
    assert.equal(config.accounts[0].discord.webhook_url, 'https://discord.com/api/webhooks/123')
  })

  it('SFEDITS_INVITE_CODES="a,b" lands as [\'a\',\'b\'] at web.invite_codes', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify({
      web: {}
    }))

    const config = loadConfig({ baseDir: dir, env: { SFEDITS_INVITE_CODES: 'a,b' } })
    assert.deepEqual(config.web.invite_codes, ['a', 'b'])
  })

  it('trims whitespace in invite codes and filters empty strings', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify({
      web: {}
    }))

    const config = loadConfig({ baseDir: dir, env: { SFEDITS_INVITE_CODES: ' a , b , ' } })
    assert.deepEqual(config.web.invite_codes, ['a', 'b'])
  })

  it('throws when a secret env var is set but its stanza is absent from the composed config', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify({
      accounts: [{}]
    }))

    assert.throws(
      () => loadConfig({ baseDir: dir, env: { SFEDITS_BLUESKY_PASSWORD: 'secret' } }),
      /SFEDITS_BLUESKY_PASSWORD is set but the config has no stanza for it/
    )
  })

  it('rejects SFEDITS_CONFIG with an error telling the operator it is no longer supported', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify({ accounts: [] }))

    assert.throws(
      () => loadConfig({ baseDir: dir, env: { SFEDITS_CONFIG: '{}' } }),
      /SFEDITS_CONFIG is no longer supported/
    )
  })

  it('env secrets override values set by base/local for the same path', function() {
    const base = {
      accounts: [{ discord: { webhook_url: 'base-url' } }]
    }
    const overlay = {
      accounts: [{ discord: { webhook_url: 'overlay-url' } }]
    }
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(base))
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(overlay))

    const config = loadConfig({
      baseDir: dir,
      env: { SFEDITS_DISCORD_WEBHOOK_URL: 'env-url' }
    })
    assert.equal(config.accounts[0].discord.webhook_url, 'env-url')
  })

  it('passes a topic_store stanza through untouched', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify({
      accounts: [],
      topic_store: {
        host: 'tools.db.svc.wikimedia.cloud',
        database: 's51234__sfedits'
      }
    }))

    const config = loadConfig({ baseDir: dir, env: {} })
    assert.equal(config.topic_store.host, 'tools.db.svc.wikimedia.cloud')
    assert.equal(config.topic_store.database, 's51234__sfedits')
  })

  it('overlay with shorter array replaces base array completely', function() {
    const base = {
      accounts: [{
        watchlist_source: {
          importance: ['Top', 'High', 'Mid']
        }
      }]
    }
    const overlay = {
      accounts: [{
        watchlist_source: {
          importance: ['Top']
        }
      }]
    }
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(base))
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(overlay))

    const config = loadConfig({ baseDir: dir, env: {} })
    assert.deepEqual(config.accounts[0].watchlist_source.importance, ['Top'])
  })

  it('overlay can replace scalar array elements with different types', function() {
    const base = {
      accounts: [{
        wikidata_claims: {
          properties: ['P19', 'P20', 'P39']
        }
      }]
    }
    const overlay = {
      accounts: [{
        wikidata_claims: {
          properties: ['P131']
        }
      }]
    }
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(base))
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(overlay))

    const config = loadConfig({ baseDir: dir, env: {} })
    assert.deepEqual(config.accounts[0].wikidata_claims.properties, ['P131'])
  })

  it('resolves account ranges file references relative to the config file', function() {
    fs.writeFileSync(path.join(dir, 'ranges.json'), JSON.stringify({ 'Some Org': ['192.0.2.0/24'] }))
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify({
      accounts: [{ ranges: './ranges.json' }]
    }))

    const config = loadConfig({ baseDir: dir, env: {} })
    assert.deepEqual(config.accounts[0].ranges, { 'Some Org': ['192.0.2.0/24'] })
  })

  it('throws a clear error for invalid JSON in config.base.json', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), 'not json{')

    assert.throws(
      () => loadConfig({ baseDir: dir, env: {} }),
      /config\.base\.json is not valid JSON/
    )
  })

  it('throws a clear error for invalid JSON in config.json', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify({ accounts: [] }))
    fs.writeFileSync(path.join(dir, 'config.json'), 'not json{')

    assert.throws(
      () => loadConfig({ baseDir: dir, env: {} }),
      /config\.json is not valid JSON/
    )
  })

  it('overlay introducing a nested object subtree absent from base merges cleanly', function() {
    const base = {
      accounts: [{
        name: 'base-account'
      }]
    }
    const overlay = {
      accounts: [{
        name: 'base-account',
        new_section: {
          enabled: true,
          setting: 'value'
        }
      }]
    }
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(base))
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(overlay))

    const config = loadConfig({ baseDir: dir, env: {} })
    assert.equal(config.accounts[0].new_section.enabled, true)
    assert.equal(config.accounts[0].new_section.setting, 'value')
  })

  it('overlay object at a path where base has a scalar replaces it', function() {
    const base = {
      accounts: [{
        watchlist: 'simple-string'
      }]
    }
    const overlay = {
      accounts: [{
        watchlist: {
          source: 'api',
          enabled: true
        }
      }]
    }
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(base))
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(overlay))

    const config = loadConfig({ baseDir: dir, env: {} })
    assert.equal(config.accounts[0].watchlist.source, 'api')
    assert.equal(config.accounts[0].watchlist.enabled, true)
  })

  it('regression: overlay with pii_blocking object absent from base does not crash', function() {
    const base = {
      accounts: [{
        name: 'main'
      }]
    }
    const overlay = {
      accounts: [{
        pii_blocking: {
          enabled: false
        }
      }]
    }
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(base))
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(overlay))

    const config = loadConfig({ baseDir: dir, env: {} })
    assert.equal(config.accounts[0].pii_blocking.enabled, false)
  })

  const two = (miami = { id: 'miami', bluesky: { identifier: 'mia.bsky.social' }, deliveries: [{ type: 'bluesky' }] }) =>
    ({ accounts: [{ bluesky: { identifier: 'sf.bsky.social' }, deliveries: [{ type: 'bluesky' }] }, miami] })

  it('SFEDITS_MIAMI_BLUESKY_PASSWORD lands on the account with id "miami"', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(two()))

    const config = loadConfig({ baseDir: dir, env: { SFEDITS_MIAMI_BLUESKY_PASSWORD: 'm', SFEDITS_BLUESKY_PASSWORD: 's' } })
    assert.equal(config.accounts[1].bluesky.password, 'm')
    assert.equal(config.accounts[0].bluesky.password, 's')
    assert.deepEqual(config.disabledAccounts, [])
  })

  it('a second account without an id is disabled, not fatal', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(two({ bluesky: { identifier: 'x' } })))
    sinon.stub(console, 'error')

    const config = loadConfig({ baseDir: dir, env: {} })
    assert.equal(config.accounts.length, 1)
    assert.equal(config.disabledAccounts[0].id, null)
    assert.equal(config.disabledAccounts[0].index, 1)
    assert.match(config.disabledAccounts[0].reason, /needs an "id"/)
  })

  it('malformed and duplicate ids disable the account', function() {
    sinon.stub(console, 'error')

    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(
      two({ id: 'Miami', bluesky: { identifier: 'x', password: 'inline' }, deliveries: [{ type: 'bluesky' }] })
    ))
    let config = loadConfig({ baseDir: dir, env: {} })
    assert.equal(config.accounts.length, 1)
    assert.equal(config.disabledAccounts[0].id, 'Miami')
    assert.match(config.disabledAccounts[0].reason, /must match/)

    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(
      two({ id: 'mia-mi', bluesky: { identifier: 'x', password: 'inline' }, deliveries: [{ type: 'bluesky' }] })
    ))
    config = loadConfig({ baseDir: dir, env: {} })
    assert.equal(config.accounts.length, 1)
    assert.equal(config.disabledAccounts[0].id, 'mia-mi')
    assert.match(config.disabledAccounts[0].reason, /must match/)

    const first = { id: 'miami', bluesky: { identifier: 'a.bsky.social', password: 'inline' }, deliveries: [{ type: 'bluesky' }] }
    const third = { id: 'miami', bluesky: { identifier: 'b.bsky.social', password: 'inline' }, deliveries: [{ type: 'bluesky' }] }
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify({
      accounts: [{ bluesky: { identifier: 'sf.bsky.social' }, deliveries: [{ type: 'bluesky' }] }, first, third]
    }))
    config = loadConfig({ baseDir: dir, env: {} })
    assert.equal(config.accounts.length, 2)
    assert.equal(config.accounts[1].id, 'miami')
    assert.equal(config.disabledAccounts[0].id, 'miami')
    assert.equal(config.disabledAccounts[0].index, 2)
    assert.match(config.disabledAccounts[0].reason, /duplicate account id "miami"/)
    assert.equal(console.error.callCount, 3)
  })

  it('a prefixed secret with no matching account is a warning, not an error', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify({
      accounts: [{ bluesky: { identifier: 'sf.bsky.social' } }]
    }))
    const error = sinon.stub(console, 'error')

    const config = loadConfig({ baseDir: dir, env: { SFEDITS_MIAMI_BLUESKY_PASSWORD: 'm' } })
    assert.deepEqual(config.disabledAccounts, [])
    assert.equal(error.callCount, 1)
    assert.match(error.getCall(0).args[0], /SFEDITS_MIAMI_BLUESKY_PASSWORD is set but no account has id "miami"/)
  })

  it('a prefixed secret whose account lacks the stanza disables that account', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(
      two({ id: 'miami', discord: {}, deliveries: [{ type: 'discord' }] })
    ))
    sinon.stub(console, 'error')

    const config = loadConfig({ baseDir: dir, env: { SFEDITS_MIAMI_BLUESKY_PASSWORD: 'm' } })
    assert.equal(config.accounts.length, 1)
    assert.equal(config.disabledAccounts[0].id, 'miami')
    assert.match(config.disabledAccounts[0].reason, /SFEDITS_MIAMI_BLUESKY_PASSWORD is set but the config has no stanza for it/)
  })

  it('a second account whose delivery has no secret is disabled, and the first account still loads', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(two()))
    const error = sinon.stub(console, 'error')

    const config = loadConfig({ baseDir: dir, env: {} })
    assert.equal(config.accounts.length, 1)
    assert.equal(config.accounts[0].bluesky.identifier, 'sf.bsky.social')
    assert.equal(config.disabledAccounts[0].id, 'miami')
    assert.equal(config.disabledAccounts[0].index, 1)
    assert.match(config.disabledAccounts[0].reason, /delivers to bluesky but SFEDITS_MIAMI_BLUESKY_PASSWORD is not set/)
    assert.equal(error.callCount, 1)
    assert.match(error.getCall(0).args[0], /\[config\] account "miami" disabled: .*Other accounts continue\./)
  })

  it('an inline secret satisfies the second account', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(
      two({ id: 'miami', bluesky: { identifier: 'x', password: 'inline' }, deliveries: [{ type: 'bluesky' }] })
    ))
    const error = sinon.stub(console, 'error')

    const config = loadConfig({ baseDir: dir, env: {} })
    assert.equal(config.accounts.length, 2)
    assert.equal(config.accounts[1].bluesky.password, 'inline')
    assert.deepEqual(config.disabledAccounts, [])
    assert.equal(error.callCount, 0)
  })

  it('accounts[0] without its secrets still loads (SF unchanged)', function() {
    fs.writeFileSync(path.join(dir, 'config.base.json'), JSON.stringify(two()))
    sinon.stub(console, 'error')

    const config = loadConfig({ baseDir: dir, env: { SFEDITS_MIAMI_BLUESKY_PASSWORD: 'm' } })
    assert.equal(config.accounts.length, 2)
    assert.equal(config.accounts[0].bluesky.password, undefined)
    assert.equal(config.accounts[1].bluesky.password, 'm')
    assert.deepEqual(config.disabledAccounts, [])
  })
})
