/**
 * Region profiles: the per-region constants the reassess pipeline needs
 * (WikiProject, anchor QIDs, lead terms), moved out of scripts/reassess.js
 * and scripts/reassess-untagged.js into data-only JSON under regions/ so a
 * second region can run the same pipeline without forking it.
 *
 * This module owns loading and the lead-term regexes. The reassess scripts
 * load their region through setRegion(loadProfile(<name>)) at startup, and
 * rank.js takes a profile directly, so every per-region constant they use
 * comes from a profile file under regions/.
 */

const fs = require('fs')
const path = require('path')

const DEFAULT_DIR = path.join(__dirname, '..', 'regions')

/** The profile name becomes a filename, so this is the path-safety boundary. */
const NAME = /^[a-z][a-z0-9-]*$/

/** Fields every profile must carry; claim_targets and exclude_titles default. */
const REQUIRED_FIELDS = [
  'name', 'label', 'wikiproject', 'wiki_api', 'anchors',
  'untagged_properties', 'lead_terms', 'lead_exclusions', 'live_importance'
]

/** Required fields that must be lists of values, not single values. */
const LIST_FIELDS = [
  'anchors', 'untagged_properties', 'lead_terms', 'lead_exclusions',
  'live_importance'
]

/**
 * Escape every regex metacharacter in a term so it matches literally. The
 * same idiom as the lead regex in scripts/reassess.js:71-72, kept identical
 * so profile terms behave exactly like the in-file list they replace.
 */
function escapeRegExp(term) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Load regions/<name>.json and check it is complete.
 *
 * @param {string} name - profile name, e.g. "sfba"
 * @param {Object} [options]
 * @param {string} [options.dir] - profile directory, defaults to <repo>/regions
 * @returns {Object} the profile, with claim_targets (null) and exclude_titles
 *   ([]) defaulted when absent
 * @throws {Error} on an invalid or unknown name, a name field that does not
 *   match the filename, a missing or non-list required field, or an empty
 *   lead_terms list
 */
function loadProfile(name, { dir = DEFAULT_DIR } = {}) {
  if (typeof name !== 'string' || !NAME.test(name)) {
    throw new Error(`invalid region name "${name}"`)
  }

  const file = path.join(dir, `${name}.json`)
  if (!fs.existsSync(file)) {
    throw new Error(`no region profile "${name}"`)
  }

  const profile = JSON.parse(fs.readFileSync(file, 'utf8'))
  // The name picks the cache directory (data/reassess/<name>/), so a stale
  // name copied along with the file would read and overwrite ANOTHER region's
  // caches, silently. Catch it at load time.
  if (profile.name !== name) {
    throw new Error(`region profile "${name}" has name "${profile.name}" - the name field must match the filename`)
  }
  for (const field of REQUIRED_FIELDS) {
    // JSON null reads as "the field is absent", not as a value that satisfies
    if (profile[field] === undefined || profile[field] === null) {
      throw new Error(`region profile "${name}" is missing "${field}"`)
    }
  }
  for (const field of LIST_FIELDS) {
    if (!Array.isArray(profile[field])) {
      throw new Error(`region profile "${name}" field "${field}" must be an array`)
    }
  }
  if (profile.lead_terms.length === 0) {
    // leadMatcher would join zero terms into a match-everything regex.
    throw new Error(`region profile "${name}" has empty "lead_terms" - every lead would match`)
  }

  return {
    claim_targets: null,
    exclude_titles: [],
    ...profile
  }
}

/**
 * The lead regexes for a profile: lead_terms mark a defining regional
 * connection early in the lead, lead_exclusions retract it (an Ohio
 * "Miami" is not a South Florida "Miami"). Both match literally.
 *
 * @param {Object} profile - from loadProfile()
 * @returns {{termsRe: RegExp, exclusionsRe: RegExp|null}} exclusionsRe is
 *   null when the profile has no exclusions
 */
function leadMatcher(profile) {
  const termsRe = new RegExp(`(${profile.lead_terms.map(escapeRegExp).join('|')})`)
  const exclusionsRe = profile.lead_exclusions.length > 0
    ? new RegExp(`(${profile.lead_exclusions.map(escapeRegExp).join('|')})`)
    : null
  return { termsRe, exclusionsRe }
}

module.exports = {
  loadProfile,
  leadMatcher,
  escapeRegExp,
  REQUIRED_FIELDS
}
