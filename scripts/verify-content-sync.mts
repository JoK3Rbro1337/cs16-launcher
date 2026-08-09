/**
 * Sandbox-safe regression test for the userconfig.cfg/autoexec.cfg
 * managed-block exec-cycle bug (see CLAUDE.md's "userconfig.cfg is a leaf of
 * the exec graph" rule). Every fixture lives under a throwaway
 * `mkdtemp(tmpdir())` directory standing in for a game install root — never
 * the real install, per this repo's sandbox-only testing rule. Run with
 * `node scripts/verify-content-sync.mts`.
 *
 * Reproduces the real incident: a config-slot variant's .cfg ends with the
 * GoldSrc-standard `exec userconfig.cfg` trailer (written by the engine
 * itself whenever it saves settings), and the launcher's managed block in
 * userconfig.cfg execs that variant back — closing the graph into a cycle
 * that hangs the engine at startup (black screen, 100% CPU, unresponsive
 * window, confirmed via gdb backtrace). Asserts syncManagedExecTargets
 * refuses to write it, and that a genuinely safe write still works.
 */

import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncManagedExecTargets, findManagedExecCycle, ManagedExecCycleError } from '../electron/modules/content-sync.ts'

let failures = 0

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}`)
  }
}

async function freshSandbox(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  await mkdir(join(dir, 'cstrike'), { recursive: true })
  return dir
}

async function writeCfg(contentDir: string, name: string, text: string): Promise<void> {
  await writeFile(join(contentDir, 'cstrike', name), text)
}

async function readCfgIfExists(contentDir: string, name: string): Promise<string | null> {
  try {
    return await readFile(join(contentDir, 'cstrike', name), 'utf-8')
  } catch {
    return null
  }
}

async function expectCycleError(contentDir: string, execPaths: string[]): Promise<ManagedExecCycleError | null> {
  try {
    await syncManagedExecTargets(contentDir, execPaths)
    return null
  } catch (err) {
    return err instanceof ManagedExecCycleError ? err : null
  }
}

async function main(): Promise<void> {
  console.log('== direct cycle: variant execs userconfig.cfg back (the reported incident) ==')
  {
    const dir = await freshSandbox('content-sync-verify-direct-')
    await writeCfg(dir, 'my-config.cfg', ['name "player"', 'exec controller.cfg', 'exec userconfig.cfg', ''].join('\n'))

    const cycle = await findManagedExecCycle(dir, ['my-config.cfg'])
    check('findManagedExecCycle detects it', cycle !== null)
    check('cycle chain includes userconfig.cfg and my-config.cfg', !!cycle && cycle.includes('userconfig.cfg') && cycle.includes('my-config.cfg'))

    const err = await expectCycleError(dir, ['my-config.cfg'])
    check('syncManagedExecTargets refuses (throws ManagedExecCycleError)', err !== null)
    check('neither managed target was created', (await readCfgIfExists(dir, 'userconfig.cfg')) === null && (await readCfgIfExists(dir, 'autoexec.cfg')) === null)

    await rm(dir, { recursive: true, force: true })
  }

  console.log('\n== transitive cycle through an intermediate file ==')
  {
    const dir = await freshSandbox('content-sync-verify-transitive-')
    await writeCfg(dir, 'a.cfg', 'exec b.cfg\n')
    await writeCfg(dir, 'b.cfg', 'exec userconfig.cfg\n')

    const err = await expectCycleError(dir, ['a.cfg'])
    check('a.cfg -> b.cfg -> userconfig.cfg -> a.cfg is caught', err !== null)
    check('cycle chain names all three hops', !!err && ['a.cfg', 'b.cfg', 'userconfig.cfg'].every((n) => err.cyclePath.includes(n)))

    await rm(dir, { recursive: true, force: true })
  }

  console.log('\n== self-cycle (a variant that execs itself) ==')
  {
    const dir = await freshSandbox('content-sync-verify-self-')
    await writeCfg(dir, 'loopy.cfg', 'exec loopy.cfg\n')

    const err = await expectCycleError(dir, ['loopy.cfg'])
    check('self-referencing exec is caught', err !== null)

    await rm(dir, { recursive: true, force: true })
  }

  console.log('\n== safe writes still work ==')
  {
    const dir = await freshSandbox('content-sync-verify-safe-')
    await writeCfg(dir, 'clean.cfg', 'sensitivity "2.0"\n')

    const cycle = await findManagedExecCycle(dir, ['clean.cfg'])
    check('no cycle detected for an acyclic exec-cfg', cycle === null)

    await syncManagedExecTargets(dir, ['clean.cfg'])
    const userconfig = await readCfgIfExists(dir, 'userconfig.cfg')
    const autoexec = await readCfgIfExists(dir, 'autoexec.cfg')
    check('userconfig.cfg gets the exec line', !!userconfig && userconfig.includes('exec clean.cfg'))
    check('autoexec.cfg gets the same exec line', !!autoexec && autoexec.includes('exec clean.cfg'))

    await rm(dir, { recursive: true, force: true })
  }

  console.log('\n== unresolvable exec target is a safe dead end, not a crash ==')
  {
    const dir = await freshSandbox('content-sync-verify-missing-')
    await writeCfg(dir, 'a.cfg', 'exec does-not-exist.cfg\n')

    const cycle = await findManagedExecCycle(dir, ['a.cfg'])
    check('missing file is treated as a leaf (no false positive)', cycle === null)
    await syncManagedExecTargets(dir, ['a.cfg'])
    check('write proceeds normally', (await readCfgIfExists(dir, 'userconfig.cfg'))?.includes('exec a.cfg') ?? false)

    await rm(dir, { recursive: true, force: true })
  }

  console.log("\n== recovers cleanly after the underlying variant is fixed (point 7's workaround scenario) ==")
  {
    const dir = await freshSandbox('content-sync-verify-recover-')
    // Simulate the state described in the bug report: userconfig.cfg still
    // has the launcher's managed block (marker intact), and the variant it
    // pointed at used to close a cycle back into userconfig.cfg.
    const cyclicVariant = ['name "player"', 'exec controller.cfg', 'exec userconfig.cfg', ''].join('\n')
    await writeCfg(dir, 'my-config.cfg', cyclicVariant)
    const beforeErr = await expectCycleError(dir, ['my-config.cfg'])
    check('first sync attempt refuses as expected', beforeErr !== null)
    check('userconfig.cfg still does not exist (never written)', (await readCfgIfExists(dir, 'userconfig.cfg')) === null)

    // Now the variant is fixed upstream (its exec-userconfig trailer removed,
    // matching what a curator/engine-save would produce for a leaf cfg).
    await writeCfg(dir, 'my-config.cfg', 'name "player"\n')
    await syncManagedExecTargets(dir, ['my-config.cfg'])
    const userconfig = await readCfgIfExists(dir, 'userconfig.cfg')
    check('next sync writes a clean managed block once the cycle is gone', !!userconfig && userconfig.includes('exec my-config.cfg'))

    await rm(dir, { recursive: true, force: true })
  }

  console.log('\n== a player\'s own lines outside the managed block survive a refused sync ==')
  {
    const dir = await freshSandbox('content-sync-verify-untouched-')
    const playerLine = 'bind "f5" "screenshot"'
    await writeCfg(
      dir,
      'userconfig.cfg',
      [playerLine, '// === 16X LAUNCHER MANAGED BLOCK — DO NOT EDIT BELOW THIS LINE ===', 'exec old-variant.cfg', '// === 16X LAUNCHER MANAGED BLOCK — END ===', ''].join(
        '\n'
      )
    )
    await writeCfg(dir, 'my-config.cfg', 'exec userconfig.cfg\n')

    const before = await readCfgIfExists(dir, 'userconfig.cfg')
    const err = await expectCycleError(dir, ['my-config.cfg'])
    const after = await readCfgIfExists(dir, 'userconfig.cfg')
    check('refused sync throws', err !== null)
    check('userconfig.cfg is byte-for-byte unchanged on refusal', before === after)
    check("player's own line is intact", !!after && after.includes(playerLine))

    await rm(dir, { recursive: true, force: true })
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
