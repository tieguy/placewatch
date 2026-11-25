/**
 * Editor identity module tests
 *
 * A Wikipedia username can name three kinds of editor: a named account,
 * an IP address (logged-out edits before temporary accounts), or a
 * temporary account ("~2026-42504-55") — the logged-out form since
 * January 2026. The isAnonymous rule decides which edits count as
 * anonymous, so every consumer classifies editors the same way.
 */
const { describe, it } = require('mocha')
const { assert } = require('chai')
const { isIpAddress, isTemporaryAccount, isAnonymous } = require('../lib/editor-identity')

describe('editor-identity', function() {

  describe('isTemporaryAccount', function() {
    it('recognizes the standard temporary-account form', function() {
      assert.isTrue(isTemporaryAccount('~2026-42504-55'))
    })

    it('recognizes the short single-dash form (Czech Wikipedia)', function() {
      assert.isTrue(isTemporaryAccount('~2026-67040'))
    })

    it('does not classify other tilde-prefixed or named users as temporary', function() {
      for (const user of ['~Tilde', '~Foo', 'Patandor', 'AUC2012', '1.2.3']) {
        assert.isFalse(isTemporaryAccount(user), user)
      }
    })
  })

  describe('isIpAddress', function() {
    it('recognizes IPv4 and IPv6 addresses', function() {
      assert.isTrue(isIpAddress('192.0.2.1'))
      assert.isTrue(isIpAddress('2001:db8::1'))
      assert.isTrue(isIpAddress('2601:646:8080:1::1'))
    })

    it('does not classify named or partial-numeric users as IPs', function() {
      for (const user of ['Patandor', 'AUC2012', '1.2.3', '~2026-67040']) {
        assert.isFalse(isIpAddress(user), user)
      }
    })
  })

  describe('isAnonymous', function() {
    it('is true for IP editors', function() {
      assert.isTrue(isAnonymous('192.0.2.1'))
      assert.isTrue(isAnonymous('2601:646:8080:1::1'))
    })

    it('is true for temporary-account editors', function() {
      assert.isTrue(isAnonymous('~2026-42504-55'))
      assert.isTrue(isAnonymous('~2026-67040'))
    })

    it('is false for named editors', function() {
      for (const user of ['Patandor', 'AUC2012', 'NotAnIP']) {
        assert.isFalse(isAnonymous(user), user)
      }
    })
  })
})
