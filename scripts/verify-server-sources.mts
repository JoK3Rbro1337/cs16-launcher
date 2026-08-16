/**
 * Verification for server-sources.ts's parseAddressList — specifically the
 * trailing-inline-comment stripping added alongside prepping
 * servers/cs16-servers.txt to receive a real curated list. Pure string
 * parsing, no filesystem/network/Electron API actually used, but
 * server-sources.ts's relative imports (-> server-browser.ts ->
 * steam-detect.ts) are extensionless, which plain `node --experimental-
 * strip-types` can't resolve — run under Electron instead, same convention
 * as every other extensionless-import module's verify script in this repo:
 *
 *   ./node_modules/.bin/electron --disable-gpu --no-sandbox \
 *     --disable-software-rasterizer scripts/verify-server-sources.mts
 */

import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

let failures = 0
function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}`)
  }
}

async function main(): Promise<void> {
  await app.whenReady()

  const { parseAddressList } = await import('../electron/modules/server-sources.ts')

  console.log('== plain-text parsing ==')
  {
    const result = parseAddressList('1.2.3.4:27015\n5.6.7.8:27016')
    check('two bare ip:port lines parse to two addresses', result.length === 2)
    check('first address parses correctly', result[0]?.ip === '1.2.3.4' && result[0]?.port === 27015)
  }
  {
    const result = parseAddressList('# a whole-line comment\n1.2.3.4:27015\n\n\n5.6.7.8:27016\n')
    check('whole-line comments and blank lines are ignored', result.length === 2)
  }
  {
    const result = parseAddressList('1.2.3.4:27015 # EU HQ 24/7 dust2\n5.6.7.8:27016# no space before hash')
    check('a trailing inline comment no longer silently drops the line', result.length === 2)
    check('trailing-comment address parses correctly (with space before #)', result[0]?.ip === '1.2.3.4' && result[0]?.port === 27015)
    check('trailing-comment address parses correctly (no space before #)', result[1]?.ip === '5.6.7.8' && result[1]?.port === 27016)
  }
  {
    const result = parseAddressList('1.2.3.4:27015\r\n5.6.7.8:27016\r\n')
    check('CRLF line endings are tolerated', result.length === 2)
  }
  {
    const result = parseAddressList('not-an-address\n1.2.3.4:99999\n1.2.3.4:27015')
    check('a malformed line is dropped, valid ones still parse (no throw)', result.length === 1 && result[0]?.ip === '1.2.3.4' && result[0]?.port === 27015)
  }
  {
    const result = parseAddressList('   \n   \n')
    check('whitespace-only input parses to zero addresses, not a crash', result.length === 0)
  }

  console.log('== JSON array fallback still works ==')
  {
    const result = parseAddressList('["1.2.3.4:27015", "5.6.7.8:27016"]')
    check('JSON array of strings parses', result.length === 2)
  }
  {
    const result = parseAddressList('[{"ip":"1.2.3.4","port":27015}]')
    check('JSON array of {ip,port} objects parses', result.length === 1 && result[0]?.port === 27015)
  }

  console.log('== the real servers/cs16-servers.txt file ==')
  {
    const text = await readFile(join(SCRIPT_DIR, '..', 'servers', 'cs16-servers.txt'), 'utf-8')
    let threw = false
    let result: unknown[] = []
    try {
      result = parseAddressList(text)
    } catch {
      threw = true
    }
    check('parsing the real file never throws', !threw)
    console.log(`  ..   current entry count: ${result.length} (still a placeholder awaiting real addresses)`)
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  app.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
