import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Database from 'better-sqlite3'
import { buildSampleBackupBytes } from '../fixtures/sampleBackup'

// Point DATA_DIR at a throwaway temp directory before importing the module
// under test, so these tests never touch a real working DB (see db.server.ts).
let testDataDir: string
let importBackup: typeof import('./import.server').importBackup
let dbPaths: typeof import('../db.server')

beforeEach(async () => {
  testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitnotes-import-test-'))
  process.env.FITNOTES_DATA_DIR = testDataDir
  // Reset vitest's module registry so DATA_DIR (a module-level const) is
  // re-evaluated against the fresh env var on the next import.
  vi.resetModules()
  ;({ importBackup } = await import('./import.server'))
  dbPaths = await import('../db.server')
})

afterEach(() => {
  dbPaths.closeWorkingDb()
  fs.rmSync(testDataDir, { recursive: true, force: true })
  delete process.env.FITNOTES_DATA_DIR
})

function buildMinimalValidBackup(overrides?: { userVersion?: number; omitTable?: string }): Buffer {
  const tmpFile = path.join(testDataDir, `source-${Math.random()}.fitnotes`)
  const db = new Database(tmpFile)
  db.pragma(`user_version = ${overrides?.userVersion ?? 22}`)
  const tables = ['exercise', 'Category', 'Routine'].filter((t) => t !== overrides?.omitTable)
  for (const table of tables) {
    db.exec(`CREATE TABLE ${table} (_id INTEGER PRIMARY KEY)`)
  }
  db.exec('CREATE TABLE training_log (_id INTEGER PRIMARY KEY, exercise_id INTEGER)')
  db.close()
  const bytes = fs.readFileSync(tmpFile)
  fs.rmSync(tmpFile)
  return bytes
}

describe('importBackup', () => {
  it('happy path: imports the sample backup fixture and reports counts', () => {
    const bytes = buildSampleBackupBytes()
    const result = importBackup(bytes, false)

    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('unreachable')
    expect(result.counts.exercises).toBeGreaterThan(0)
    expect(result.counts.categories).toBeGreaterThan(0)
    expect(result.counts.routines).toBeGreaterThan(0)
    expect(fs.existsSync(dbPaths.WORKING_DB_PATH)).toBe(true)
  })

  it('happy path: sets WAL journal mode on the working DB immediately (KTD1)', () => {
    const bytes = buildSampleBackupBytes()
    importBackup(bytes, false)

    const db = new Database(dbPaths.WORKING_DB_PATH, { readonly: true })
    const journalMode = db.pragma('journal_mode', { simple: true })
    db.close()
    expect(journalMode).toBe('wal')
  })

  it('edge case: rejects a non-SQLite file without creating a working DB', () => {
    const result = importBackup(Buffer.from('not a sqlite file'), false)

    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('unreachable')
    expect(result.reason).toBe('not-a-sqlite-file')
    expect(fs.existsSync(dbPaths.WORKING_DB_PATH)).toBe(false)
  })

  it('edge case: rejects a file with a mismatched user_version', () => {
    const bytes = buildMinimalValidBackup({ userVersion: 99 })
    const result = importBackup(bytes, false)

    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('unreachable')
    expect(result.reason).toBe('user-version-mismatch')
  })

  it('edge case: rejects a file missing an expected core table', () => {
    const bytes = buildMinimalValidBackup({ omitTable: 'Routine' })
    const result = importBackup(bytes, false)

    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('unreachable')
    expect(result.reason).toBe('missing-table')
  })

  it('edge case: re-importing over an existing working DB requires confirmation, then replaces it', () => {
    const first = buildMinimalValidBackup()
    const firstResult = importBackup(first, false)
    expect(firstResult.status).toBe('success')

    const second = buildMinimalValidBackup()
    const needsConfirm = importBackup(second, false)
    expect(needsConfirm.status).toBe('confirmation-required')

    const confirmed = importBackup(second, true)
    expect(confirmed.status).toBe('success')
  })

  it('error path: a validation failure leaves an existing working DB untouched', () => {
    const valid = buildMinimalValidBackup()
    importBackup(valid, false)
    const workingBytesBefore = fs.readFileSync(dbPaths.WORKING_DB_PATH)

    const invalid = Buffer.from('garbage')
    const result = importBackup(invalid, true)

    expect(result.status).toBe('error')
    const workingBytesAfter = fs.readFileSync(dbPaths.WORKING_DB_PATH)
    expect(workingBytesAfter).toEqual(workingBytesBefore)
  })

  it('integration: the original-import copy is byte-identical to the uploaded file', () => {
    const bytes = buildSampleBackupBytes()
    importBackup(bytes, false)

    const originalCopyBytes = fs.readFileSync(dbPaths.ORIGINAL_IMPORT_DB_PATH)
    expect(originalCopyBytes.equals(bytes)).toBe(true)
  })
})
