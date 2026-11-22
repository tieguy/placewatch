/**
 * Region profiles: the per-region constants the reassess pipeline needs
 * (WikiProject, anchor QIDs, lead terms), moved out of scripts/reassess.js
 * and scripts/reassess-untagged.js into data-only JSON under regions/ so a
 * second region can run the same pipeline without forking it.
 *
 * This module owns loading and the lead-term regexes. The reassess scripts
 * still carry their in-file constants; wiring them to profiles is the next
 * task, and until then nothing here is on their path.
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
 * @throws {Error} on an invalid or unknown name, or a missing required field
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
  for (const field of REQUIRED_FIELDS) {
    if (profile[field] === undefined) {
      throw new Error(`region profile "${name}" is missing "${field}"`)
    }
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
