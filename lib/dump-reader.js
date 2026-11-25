/**
 * Read specific articles out of a Wikimedia multistream dump without
 * downloading the whole thing.
 *
 * Why this exists: the link metric needs each article's raw wikitext, and
 * fetching 18,000 articles through the Action API is the "loop over the API for
 * bulk work" pattern that WMF etiquette tells you not to do. The obvious
 * alternative - the `pagelinks` dump - is useless here, because it is the
 * *rendered* link table and cannot distinguish a navbox link from a prose link
 * (see docs/importance-ranking-methodology.md 4.0 and 4.5).
 *
 * Multistream dumps make a middle path possible. The .xml.bz2 is a
 * concatenation of independent bzip2 streams, each holding ~100 pages, and the
 * companion index file lists `offset:pageid:title` for every page. So a title
 * lookup gives a byte offset, and one HTTP Range request plus one bzip2 block
 * decode yields that article - no 24.7 GB download.
 *
 * Articles cluster into shared blocks, so N titles cost rather fewer than N
 * requests.
 */

const fs = require('fs')
const bz2 = require('seek-bzip')
const { wmFetch } = require('./mw-api')

/**
 * Parse a decompressed multistream index into a title -> offset map.
 * Index lines are `offset:pageid:title`; titles may contain colons, so only
 * the first two fields are split off.
 */
function parseIndex(text) {
  const offsets = new Map()
  for (const line of text.split('\n')) {
    if (!line) continue
    const first = line.indexOf(':')
    if (first < 0) continue
    const second = line.indexOf(':', first + 1)
    if (second < 0) continue
    const offset = Number(line.slice(0, first))
    if (!Number.isFinite(offset)) continue
    offsets.set(line.slice(second + 1), offset)
  }
  return offsets
}

/**
 * Group the requested titles by which bzip2 block holds them, and record each
 * block's end offset so a Range request can be bounded. `allOffsets` must be
 * the sorted, de-duplicated set of every offset in the index - the end of a
 * block is the start of the next one.
 */
function planBlocks(titles, offsets, allOffsets) {
  const byOffset = new Map()
  const missing = []
  for (const title of titles) {
    const offset = offsets.get(title)
    if (offset === undefined) { missing.push(title); continue }
    if (!byOffset.has(offset)) byOffset.set(offset, [])
    byOffset.get(offset).push(title)
  }
  // offset -> position, so bounding a block is O(1). indexOf here would be
  // 16k lookups across 257k offsets on a real dump.
  const positions = new Map()
  allOffsets.forEach((o, i) => positions.set(o, i))
  const blocks = [...byOffset.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, wanted]) => {
      const i = positions.has(start) ? positions.get(start) : -1
      // last block runs to end of file; null means "no upper bound"
      const end = i >= 0 && i + 1 < allOffsets.length ? allOffsets[i + 1] - 1 : null
      return { start, end, titles: wanted }
    })
  return { blocks, missing }
}

/**
 * Pull `<title>` and `<text>` out of the XML fragment a decoded block yields.
 * The fragment is a run of <page> elements without a document wrapper, so a
 * full XML parser is more machinery than the shape warrants.
 */
function extractPages(xml) {
  const pages = new Map()
  const PAGE = /<page>([\s\S]*?)<\/page>/g
  for (const match of xml.matchAll(PAGE)) {
    const body = match[1]
    const title = /<title>([\s\S]*?)<\/title>/.exec(body)
    const text = /<text[^>]*>([\s\S]*?)<\/text>/.exec(body)
    if (!title) continue
    pages.set(decodeEntities(title[1]), text ? decodeEntities(text[1]) : '')
  }
  return pages
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Load and decompress the multistream index from a local .bz2 file. */
function loadIndex(indexPath) {
  const raw = fs.readFileSync(indexPath)
  return parseIndex(bz2.decode(raw).toString('utf8'))
}

/**
 * Read one block from a local dump file. This is the path that matters on
 * Toolforge, where the dumps are already mounted at
 * /public/dumps/public/enwiki/ - no transfer at all. Locally it also serves
 * anyone who has downloaded the dump once.
 */
function readBlock(fd, { start, end }, { fileSize = null } = {}) {
  const last = end === null ? (fileSize === null ? null : fileSize - 1) : end
  const length = last === null ? null : last - start + 1
  if (length === null) throw new Error('readBlock needs fileSize for the final block')
  const buf = Buffer.alloc(length)
  fs.readSync(fd, buf, 0, length, start)
  return bz2.decode(buf).toString('utf8')
}

/**
 * One Range request for one block, decoded to its XML fragment.
 *
 * Rides wmFetch (component 'dump-reader') with its default error handling,
 * so the Wikimedia transport rules hold for dump hosts too: operator
 * User-Agent, 429/Retry-After waits, 5xx retry/backoff, socket timeouts,
 * permanent-4xx throws. A 206 is res.ok, so wmFetch returns it unaided;
 * what the default buys over throwOnHttpError: false is the 5xx retry - a
 * bare 502 from a dump server is transient, not a verdict. wmFetch's own
 * status errors are bare `HTTP <code>` strings, thrown only after its retry
 * and rate-limit budgets are spent; they are re-thrown here with the byte
 * range so a failed read names the block. The check below then classifies
 * the one case wmFetch returns but this caller cannot use: an odd 2xx that
 * is neither a range response (206) nor a complete one (200).
 *
 * wmFetch sends Accept-Encoding: gzip where this module's old raw-fetch
 * version asked for identity. That is fine here on the measured behavior of
 * the one host this is pointed at: dumps.wikimedia.org serves pre-compressed
 * .bz2 files uncompressed, so a Range request returns 206 with the exact
 * requested bytes and no content-encoding (verified live). It is not a
 * general guarantee - were a server to apply transport gzip to a ranged
 * response, the index's byte offsets would address the gzipped form and the
 * block decode would fail loudly.
 */
async function fetchBlock(url, { start, end }) {
  const range = end === null ? `bytes=${start}-` : `bytes=${start}-${end}`
  let res
  try {
    res = await wmFetch(url, {
      component: 'dump-reader',
      headers: { Range: range }
    })
  } catch (error) {
    if (error instanceof Error && /^HTTP \d{3}$/.test(error.message)) {
      throw new Error(`${error.message} fetching ${range}`)
    }
    throw error
  }
  if (res.status !== 206 && res.status !== 200) {
    throw new Error(`HTTP ${res.status} fetching ${range}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return bz2.decode(buf).toString('utf8')
}

module.exports = {
  parseIndex, planBlocks, extractPages, decodeEntities, loadIndex, fetchBlock, readBlock
}
