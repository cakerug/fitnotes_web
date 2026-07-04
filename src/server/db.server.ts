import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

// KTD1/KTD9: the working DB is an in-place edited copy of the imported backup,
// and the original-import copy is a read-only baseline never opened for writes.
// Overridable so tests operate on a throwaway directory instead of the real
// working DB — never let `npm test` touch someone's actual fitness data.
export const DATA_DIR = process.env.FITNOTES_DATA_DIR
  ? path.resolve(process.env.FITNOTES_DATA_DIR)
  : path.resolve(process.cwd(), 'data')
export const WORKING_DB_PATH = path.join(DATA_DIR, 'working.fitnotes')
export const ORIGINAL_IMPORT_DB_PATH = path.join(DATA_DIR, 'original-import.fitnotes')

// Schema grounding: FitNotes_Backup_2024-05-29.fitnotes (SQLite 3.x, user_version 22, schema version 4).
export const EXPECTED_USER_VERSION = 22
export const CORE_TABLES = ['exercise', 'Category', 'Routine'] as const

let workingDb: Database.Database | null = null

/** Shared connection to the working DB (KTD1), used by U3+ CRUD. WAL mode per KTD1. */
export function getWorkingDb(): Database.Database {
  if (!workingDb) {
    workingDb = new Database(WORKING_DB_PATH)
    workingDb.pragma('journal_mode = WAL')
  }
  return workingDb
}

/** Closes the shared connection so the underlying file can be safely replaced (U2 re-import). */
export function closeWorkingDb(): void {
  workingDb?.close()
  workingDb = null
}

export function workingDbExists(): boolean {
  return fs.existsSync(WORKING_DB_PATH)
}

export type BackupValidation =
  | { valid: true }
  | { valid: false; reason: 'not-a-sqlite-file' | 'empty-file' }
  | { valid: false; reason: 'user-version-mismatch'; foundVersion: number }
  | { valid: false; reason: 'missing-table'; table: string }

/** KTD1: validates a candidate backup file's schema version and core tables before import. */
export function validateBackupFile(filePath: string): BackupValidation {
  let db: Database.Database
  try {
    db = new Database(filePath, { readonly: true, fileMustExist: true })
  } catch {
    return { valid: false, reason: 'not-a-sqlite-file' }
  }

  try {
    // better-sqlite3 doesn't throw on `new Database()` for a non-SQLite file —
    // it only fails lazily on the first real read, which this pragma is.
    let userVersion: number
    try {
      userVersion = db.pragma('user_version', { simple: true }) as number
    } catch {
      return { valid: false, reason: 'not-a-sqlite-file' }
    }
    if (userVersion !== EXPECTED_USER_VERSION) {
      return { valid: false, reason: 'user-version-mismatch', foundVersion: userVersion }
    }

    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
      name: string
    }>
    const tableNames = new Set(rows.map((r) => r.name))
    for (const table of CORE_TABLES) {
      if (!tableNames.has(table)) {
        return { valid: false, reason: 'missing-table', table }
      }
    }

    return { valid: true }
  } finally {
    db.close()
  }
}

/** Runs PRAGMA integrity_check against a DB file. Used by U5's pre-export verification. */
export function integrityCheck(filePath: string): boolean {
  const db = new Database(filePath, { readonly: true, fileMustExist: true })
  try {
    const result = db.pragma('integrity_check', { simple: true }) as string
    return result === 'ok'
  } finally {
    db.close()
  }
}
