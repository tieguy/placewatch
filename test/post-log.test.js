const { describe, it, beforeEach, afterEach } = require('mocha')
const { assert } = require('chai')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { recordPost, loadActive, updateEntries, entryKey } = require('../lib/post-log')

describe('post-log account field (Task: posted log records the account)', function() {
  let logFile

  beforeEach(function() {
    logFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'postlog-account-')), 'posted-log.jsonl')
  })

  afterEach(function() {
    fs.rmSync(path.dirname(logFile), { recursive: true, force: true })
  })

  function readLines() {
    return fs.readFileSync(logFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
  }

  it('recordPost writes account when given', function() {
    const entry = recordPost({
      diffUrl: 'https://en.wikipedia.org/w/index.php?diff=111&oldid=110',
      page: 'Cat',
      deliveries: [{ type: 'discord', postId: 'msg-1', deleted: false }],
      account: 'miami'
    }, logFile)

    assert.equal(entry.account, 'miami')
    assert.equal(readLines()[0].account, 'miami')
  })

  it('recordPost omits account when not given', function() {
    const entry = recordPost({
      diffUrl: 'https://en.wikipedia.org/w/index.php?diff=112&oldid=110',
      page: 'Cat',
      deliveries: [{ type: 'discord', postId: 'msg-2', deleted: false }],
      account: null
    }, logFile)

    assert.notProperty(entry, 'account')
    assert.notProperty(readLines()[0], 'account')
  })

  it('entryKey includes the account only when present', function() {
    assert.equal(
      entryKey({ host: 'en.wikipedia.org', revId: 1 }),
      'en.wikipedia.org:1')
    assert.equal(
      entryKey({ host: 'en.wikipedia.org', revId: 1, account: 'miami' }),
      'en.wikipedia.org:1:miami')
  })

  it("updateEntries keeps two accounts' entries for one revision apart", function() {
    const diffUrl = 'https://en.wikipedia.org/w/index.php?diff=555&oldid=554'
    recordPost({
      diffUrl, page: 'Cat',
      deliveries: [{ type: 'discord', postId: 'sf-msg', deleted: false }],
      account: null
    }, logFile)
    recordPost({
      diffUrl, page: 'Cat',
      deliveries: [{ type: 'discord', postId: 'miami-msg', deleted: false }],
      account: 'miami'
    }, logFile)

    const miamiEntry = loadActive(30, logFile).find(e => e.account === 'miami')
    updateEntries([{ ...miamiEntry, status: 'deleted' }], logFile)

    const lines = readLines()
    assert.lengthOf(lines, 2)
    const sf = lines.find(e => e.account === undefined)
    const miami = lines.find(e => e.account === 'miami')
    assert.equal(sf.status, 'active', 'the SF entry must be untouched')
    assert.equal(miami.status, 'deleted', 'only the miami entry is updated')
  })
})
