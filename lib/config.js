const fs = require('fs')
const path = require('path')

const SECRETS = [
  { env: 'SFEDITS_BLUESKY_PASSWORD',       stanza: c => c.accounts?.[0]?.bluesky,  set: (c, v) => { c.accounts[0].bluesky.password = v } },
  { env: 'SFEDITS_MASTODON_ACCESS_TOKEN',  stanza: c => c.accounts?.[0]?.mastodon, set: (c, v) => { c.accounts[0].mastodon.access_token = v } },
  { env: 'SFEDITS_DISCORD_WEBHOOK_URL',    stanza: c => c.accounts?.[0]?.discord,  set: (c, v) => { c.accounts[0].discord.webhook_url = v } },
  { env: 'SFEDITS_INVITE_CODES',           stanza: c => c.web,                     set: (c, v) => { c.web.invite_codes = v.split(',').map(s => s.trim()).filter(Boolean) } }
]

// Secrets for accounts after the first: SFEDITS_<ID>_<SUFFIX> lands on the
// account whose id, upper-cased, is <ID>.
const ACCOUNT_SECRETS = [
  { type: 'bluesky',  suffix: 'BLUESKY_PASSWORD',      field: 'password' },
  { type: 'mastodon', suffix: 'MASTODON_ACCESS_TOKEN', field: 'access_token' },
  { type: 'discord',  suffix: 'DISCORD_WEBHOOK_URL',   field: 'webhook_url' }
]

const ACCOUNT_ID_RE = /^[a-z][a-z0-9]*$/
const ACCOUNT_SECRET_RE = /^SFEDITS_([A-Z][A-Z0-9]*)_(BLUESKY_PASSWORD|MASTODON_ACCESS_TOKEN|DISCORD_WEBHOOK_URL)$/

function deepMerge(base, overlay) {
  if (typeof overlay !== 'object' || overlay === null) return overlay
  if (Array.isArray(overlay)) {
    if (!Array.isArray(base)) base = []
    const out = []
    for (let i = 0; i < overlay.length; i++) {
      // Only recurse if BOTH base[i] and overlay[i] are plain objects
      if (base[i] && typeof base[i] === 'object' && !Array.isArray(base[i]) &&
          overlay[i] && typeof overlay[i] === 'object' && !Array.isArray(overlay[i])) {
        out[i] = deepMerge(base[i], overlay[i])
      } else {
        out[i] = overlay[i]
      }
    }
    // Truncate to overlay length so overlay can shorten/replace an array.
    // Note: an `accounts` array in the overlay replaces the base array wholesale —
    // any account not listed in the overlay is dropped, even if it was in the base.
    return out
  }
  if (Array.isArray(base)) base = {}
  if (typeof base !== 'object' || base === null) base = {}
  const out = { ...base }
  for (const [k, v] of Object.entries(overlay)) out[k] = deepMerge(base[k], v)
  return out
}

function readJsonFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  try {
    return JSON.parse(content)
  } catch (e) {
    throw new Error(`${filePath} is not valid JSON: ${e.message}`)
  }
}

function resolveRanges(config, baseDir) {
  for (const account of config.accounts || []) {
    if (typeof account.ranges === 'string') {
      account.ranges = readJsonFile(path.resolve(baseDir, account.ranges))
    }
  }
  return config
}

// Accounts after the first carry an id and take their secrets from
// SFEDITS_<ID>_* env vars. Unlike accounts[0], a config problem here
// disables just that account instead of throwing: one bad city must not
// take down the accounts that are fine.
function resolveAccountSecrets(config, env) {
  const accounts = config.accounts || []
  const idOf = i => (typeof accounts[i]?.id === 'string' ? accounts[i].id : null)
  const reasons = new Array(accounts.length)

  // id checks: present, well-formed, unique (a later duplicate is the one disabled)
  const seenIds = new Set()
  if (idOf(0) !== null) seenIds.add(idOf(0))
  for (let i = 1; i < accounts.length; i++) {
    const id = idOf(i)
    if (id === null) {
      reasons[i] = 'needs an "id" (accounts after the first take their secrets from SFEDITS_<ID>_* env vars)'
    } else if (!ACCOUNT_ID_RE.test(id)) {
      reasons[i] = `id "${id}" must match /^[a-z][a-z0-9]*$/`
    } else if (seenIds.has(id)) {
      reasons[i] = `duplicate account id "${id}"`
    } else {
      seenIds.add(id)
    }
  }

  // SFEDITS_<ID>_* secrets land on the valid account with that id
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value === '') continue
    const match = ACCOUNT_SECRET_RE.exec(key)
    if (!match) continue
    const id = match[1].toLowerCase()
    const spec = ACCOUNT_SECRETS.find(s => s.suffix === match[2])
    const target = accounts.findIndex((a, i) => i >= 1 && !reasons[i] && idOf(i) === id)
    if (target === -1) {
      console.error(`[config] ${key} is set but no account has id "${id}"`)
      continue
    }
    if (!accounts[target][spec.type]) {
      reasons[target] = `${key} is set but the config has no stanza for it`
      continue
    }
    accounts[target][spec.type][spec.field] = value
  }

  // every remaining account needs the secret for each delivery it makes
  for (let i = 1; i < accounts.length; i++) {
    if (reasons[i]) continue
    for (const delivery of accounts[i].deliveries || []) {
      const spec = ACCOUNT_SECRETS.find(s => s.type === delivery.type)
      if (!spec) continue
      if (!accounts[i][spec.type]?.[spec.field]) {
        reasons[i] = `delivers to ${spec.type} but SFEDITS_${accounts[i].id.toUpperCase()}_${spec.suffix} is not set`
        break
      }
    }
  }

  const disabledAccounts = []
  const enabled = []
  for (let i = 0; i < accounts.length; i++) {
    if (reasons[i]) disabledAccounts.push({ id: idOf(i), index: i, reason: reasons[i] })
    else enabled.push(accounts[i])
  }
  config.accounts = enabled
  config.disabledAccounts = disabledAccounts
  for (const { id, index, reason } of disabledAccounts) {
    console.error(`[config] account "${id ?? index}" disabled: ${reason}. Other accounts continue.`)
  }
}

function loadConfig({ baseDir = process.cwd(), env = process.env } = {}) {
  const basePath = path.join(baseDir, 'config.base.json')
  const baseExists = fs.existsSync(basePath)

  // If config.base.json exists, reject SFEDITS_CONFIG (deprecated, new system uses base + env vars)
  if (baseExists && env.SFEDITS_CONFIG) {
    throw new Error('SFEDITS_CONFIG is no longer supported. Config now comes from ' +
      'config.base.json plus the SFEDITS_* secret env vars — see docs/deploy-toolforge.md.')
  }

  // Toolforge still uses SFEDITS_CONFIG as a fallback until LUI-108 migration completes
  let config
  if (baseExists) {
    config = readJsonFile(basePath)
  } else if (env.SFEDITS_CONFIG) {
    console.log('loaded config from SFEDITS_CONFIG environment variable')
    try {
      config = JSON.parse(env.SFEDITS_CONFIG)
    } catch (e) {
      throw new Error(`SFEDITS_CONFIG is not valid JSON: ${e.message}`)
    }
    return resolveRanges(config, process.cwd())
  } else {
    throw new Error(`missing ${basePath} and SFEDITS_CONFIG not set`)
  }

  const localPath = path.join(baseDir, 'config.json')
  if (fs.existsSync(localPath)) {
    config = deepMerge(config, readJsonFile(localPath))
  }

  for (const s of SECRETS) {
    const value = env[s.env]
    if (value === undefined || value === '') continue
    if (!s.stanza(config)) throw new Error(`${s.env} is set but the config has no stanza for it`)
    s.set(config, value)
  }
  resolveAccountSecrets(config, env)
  return resolveRanges(config, baseDir)
}

module.exports = { loadConfig }
