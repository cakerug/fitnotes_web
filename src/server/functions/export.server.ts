import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import {
  CORE_TABLES,
  DATA_DIR,
  ORIGINAL_IMPORT_DB_PATH,
  WORKING_DB_PATH,
  getWorkingDb,
  integrityCheck,
} from '../db.server'

// Tables this app edits (U3/U4). Everything else in the schema is passthrough
// data (R2) and must have identical row counts to the KTD9 baseline — a
// mismatch means something wrote where it shouldn't have.
const MANAGED_TABLES = [
  'Category',
  'exercise',
  'Routine',
  'RoutineSection',
  'RoutineSectionExercise',
  'RoutineSectionExerciseSet',
  'WorkoutGroup',
  'WorkoutGroupExercise',
] as const

export type ExportResult =
  { status: 'success'; filePath: string } | { status: 'error'; reason: string; message: string }

/**
 * KTD1/KTD9: copies the working DB to a temp file (never the live file, to
 * avoid reading mid-write from a concurrent request), then runs three
 * pre-export checks before handing it back — this is the one moment a bad
 * file leaves the app's control and can overwrite real Android data.
 */
export function prepareExport(): ExportResult {
  if (!fs.existsSync(WORKING_DB_PATH)) {
    return {
      status: 'error',
      reason: 'no-working-db',
      message: 'No working database exists yet — import a backup first.',
    }
  }

  // KTD1: the working DB runs in WAL mode, so recent writes can still be
  // sitting in a separate `-wal` file rather than the main file this copies.
  // Checkpoint first or a plain file copy silently misses them.
  getWorkingDb().pragma('wal_checkpoint(TRUNCATE)')

  const tempExportPath = path.join(DATA_DIR, `.export-tmp-${process.pid}-${Date.now()}.fitnotes`)
  fs.copyFileSync(WORKING_DB_PATH, tempExportPath)

  const validation = validateExportCandidate(tempExportPath)
  if (validation.status === 'error') {
    cleanupExportFile(tempExportPath)
    return validation
  }

  return { status: 'success', filePath: tempExportPath }
}

/**
 * The temp copy retains WAL mode from the working DB, so opening it for
 * validation (even readonly) can leave `-wal`/`-shm` sidecar files behind —
 * remove those alongside the main file or they orphan in `data/` forever.
 */
export function cleanupExportFile(filePath: string): void {
  fs.rmSync(filePath, { force: true })
  fs.rmSync(`${filePath}-wal`, { force: true })
  fs.rmSync(`${filePath}-shm`, { force: true })
}

function validateExportCandidate(
  filePath: string,
): { status: 'success' } | { status: 'error'; reason: string; message: string } {
  if (!integrityCheck(filePath)) {
    return {
      status: 'error',
      reason: 'integrity-check-failed',
      message:
        'The working database failed a SQLite integrity check — export blocked to avoid handing back a corrupted file.',
    }
  }

  const db = new Database(filePath, { readonly: true })
  try {
    const tableNames = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
        (r) => r.name,
      ),
    )

    for (const table of CORE_TABLES) {
      if (!tableNames.has(table)) {
        return { status: 'error', reason: 'missing-table', message: `Export is missing the "${table}" table.` }
      }
    }

    const mismatches = findPassthroughRowMismatches(db, tableNames)
    if (mismatches.length > 0) {
      return {
        status: 'error',
        reason: 'row-count-mismatch',
        message: `Export blocked — these tables changed row count unexpectedly, which this app should never do: ${mismatches.join(', ')}.`,
      }
    }

    return { status: 'success' }
  } finally {
    db.close()
  }
}

function findPassthroughRowMismatches(candidateDb: Database.Database, tableNames: Set<string>): Array<string> {
  const baselineDb = new Database(ORIGINAL_IMPORT_DB_PATH, { readonly: true })
  try {
    const mismatches: Array<string> = []
    for (const table of tableNames) {
      if (table === 'sqlite_sequence' || (MANAGED_TABLES as ReadonlyArray<string>).includes(table)) continue
      const candidateCount = (candidateDb.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number }).c
      const baselineCount = (baselineDb.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number }).c
      if (candidateCount !== baselineCount) mismatches.push(table)
    }
    return mismatches
  } finally {
    baselineDb.close()
  }
}
