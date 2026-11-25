// What kind of editor a Wikipedia username names. Shared by the edit
// stream (lib/edit-stream.js), which sets edit.anonymous, and the Discord
// action links (lib/discord-platform.js), which skip Special:Thanks for
// non-registered editors, so the two can never disagree about who counts
// as anonymous.
//
// Wikipedia's data has no "anonymous" field. This rule is our judgment: the
// username is an IP address (logged-out edits before temporary accounts) or
// a temporary-account name.

// EventStreams delivers IPv6 compressed ("2001:db8::1"), so the pattern has
// to accept the "::" elision, not just the full uncompressed form.
function isIpAddress(user) {
  if (typeof user !== 'string') return false
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(user)
  const ipv6 = /^[0-9A-Fa-f]{1,4}(:[0-9A-Fa-f]{0,4}){2,7}$/.test(user)
  return ipv4 || ipv6
}

// Since January 2026 Wikipedia shows logged-out editors as temporary
// accounts ("~2026-42504-55"). Some wikis, such as Czech Wikipedia, use a
// shorter form with only one dash group ("~2026-67040"). Wikimedia
// reserves the leading "~" for temporary accounts.
function isTemporaryAccount(user) {
  return typeof user === 'string' && /^~\d{4}-\d+(-\d+)?$/.test(user)
}

function isAnonymous(user) {
  return isIpAddress(user) || isTemporaryAccount(user)
}

module.exports = {
  isIpAddress,
  isTemporaryAccount,
  isAnonymous
}
