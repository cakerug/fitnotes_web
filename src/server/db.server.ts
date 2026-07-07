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

// Schema grounding: a real FitNotes export (SQLite 3.x, user_version 22, schema version 4).
// See fixtures/fitnotes-schema.sql for the structure-only schema dump used in tests.
export const EXPECTED_USER_VERSION = 22
export const CORE_TABLES = ['exercise', 'Category', 'Routine'] as const

// KTD4: exhaustive, pinned reference list for the delete guard. Tables/columns
// that reference exercise._id or Category._id, verified against the sample schema.
// The imported FitNotes schema doesn't declare real FK constraints on these
// columns, so SQLite won't block or cascade a delete on its own — without this
// app-level check, deleting a referenced row would silently orphan the
// referencing rows (e.g. training_log entries pointing at a deleted exercise).
export const CATEGORY_REFERENCE_QUERIES = [
  { label: 'exercises', sql: 'SELECT COUNT(*) AS c FROM exercise WHERE category_id = ?' },
] as const

export const EXERCISE_REFERENCE_QUERIES = [
  { label: 'routine section exercises', sql: 'SELECT COUNT(*) AS c FROM RoutineSectionExercise WHERE exercise_id = ?' },
  { label: 'training log entries', sql: 'SELECT COUNT(*) AS c FROM training_log WHERE exercise_id = ?' },
  { label: 'goals', sql: 'SELECT COUNT(*) AS c FROM Goal WHERE exercise_id = ?' },
  { label: 'workout group exercises', sql: 'SELECT COUNT(*) AS c FROM WorkoutGroupExercise WHERE exercise_id = ?' },
  { label: 'exercise graph favourites', sql: 'SELECT COUNT(*) AS c FROM ExerciseGraphFavourite WHERE exercise_id = ?' },
  { label: 'barbells', sql: 'SELECT COUNT(*) AS c FROM Barbell WHERE exercise_id = ?' },
] as const

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

export type ReferenceCheck = { label: string; count: number }

/** KTD4: runs a pinned reference-query list against an id, returning only non-zero hits. */
export function findReferences(
  db: Database.Database,
  queries: ReadonlyArray<{ label: string; sql: string }>,
  id: number,
): Array<ReferenceCheck> {
  return queries
    .map((q) => ({ label: q.label, count: (db.prepare(q.sql).get(id) as { c: number }).c }))
    .filter((r) => r.count > 0)
}

/**
 * KTD4: RepMaxGridFavourite.exercise_ids stores a comma-separated string, not
 * a normal integer FK column, so it needs its own parse-and-check rather than
 * a plain `WHERE exercise_id = ?`.
 */
export function findRepMaxGridReferences(db: Database.Database, exerciseId: number): ReferenceCheck | null {
  const rows = db.prepare('SELECT exercise_ids FROM RepMaxGridFavourite').all() as Array<{
    exercise_ids: string
  }>
  const idString = String(exerciseId)
  const count = rows.filter((r) =>
    r.exercise_ids
      .split(',')
      .map((s) => s.trim())
      .includes(idString),
  ).length
  return count > 0 ? { label: 'rep max grid favourites', count } : null
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

export type EntityCounts = { exercises: number; categories: number; routines: number }

/** Shared by U2's post-import summary and U6's dashboard — same counts, two call sites. */
export function readEntityCounts(db: Database.Database): EntityCounts {
  const exercises = (db.prepare('SELECT COUNT(*) AS c FROM exercise').get() as { c: number }).c
  const categories = (db.prepare('SELECT COUNT(*) AS c FROM Category').get() as { c: number }).c
  const routines = (db.prepare('SELECT COUNT(*) AS c FROM Routine').get() as { c: number }).c
  return { exercises, categories, routines }
}
