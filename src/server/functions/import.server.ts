import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import {
  DATA_DIR,
  WORKING_DB_PATH,
  ORIGINAL_IMPORT_DB_PATH,
  workingDbExists,
  validateBackupFile,
  closeWorkingDb,
  getWorkingDb,
  readEntityCounts,
} from '../db.server'

// Personal-use ceiling. TanStack Start server functions buffer the full
// request body with no framework-level limit (Sources: router#3953), so this
// app enforces its own — see Planning Contract > Assumptions.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

export type ImportResult =
  | { status: 'success'; counts: { exercises: number; categories: number; routines: number } }
  | { status: 'confirmation-required' }
  | { status: 'error'; reason: string; message: string }

/**
 * KTD1/KTD9: validates the uploaded backup, then atomically writes it into
 * place as both the working DB (editable) and the original-import copy
 * (read-only baseline for U5's export verification).
 */
export function importBackup(bytes: Buffer, confirmOverwrite: boolean): ImportResult {
  if (bytes.byteLength === 0) {
    return { status: 'error', reason: 'empty-file', message: 'The uploaded file is empty.' }
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return {
      status: 'error',
      reason: 'too-large',
      message: `This file is larger than the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB personal-backup ceiling this app expects.`,
    }
  }

  if (workingDbExists() && !confirmOverwrite) {
    return { status: 'confirmation-required' }
  }

  fs.mkdirSync(DATA_DIR, { recursive: true })
  const tempPath = path.join(DATA_DIR, `.import-tmp-${process.pid}-${Date.now()}.fitnotes`)
  fs.writeFileSync(tempPath, bytes)

  try {
    const validation = validateBackupFile(tempPath)
    if (!validation.valid) {
      return { status: 'error', reason: validation.reason, message: describeValidationError(validation) }
    }

    // Close any open handle on the previous working DB before replacing its file.
    closeWorkingDb()

    // Write-then-rename keeps each replacement atomic; if a later step fails,
    // earlier files that already landed stay valid rather than half-written.
    atomicReplace(tempPath, WORKING_DB_PATH)
    atomicReplace(tempPath, ORIGINAL_IMPORT_DB_PATH)

    // KTD1: set WAL mode on the working DB immediately, not lazily on first
    // CRUD call — a working DB that's never opened until U3 stays in the
    // source file's original journal mode (typically `delete`) until then.
    getWorkingDb()

    return { status: 'success', counts: readImportCounts() }
  } finally {
    fs.rmSync(tempPath, { force: true })
  }
}

function atomicReplace(sourcePath: string, destPath: string): void {
  const stagingPath = `${destPath}.new`
  fs.copyFileSync(sourcePath, stagingPath)
  fs.renameSync(stagingPath, destPath)
}

function describeValidationError(
  validation: Extract<ReturnType<typeof validateBackupFile>, { valid: false }>,
): string {
  switch (validation.reason) {
    case 'not-a-sqlite-file':
      return 'This file is not a readable SQLite database.'
    case 'user-version-mismatch':
      return `This backup's schema version (${validation.foundVersion}) doesn't match what this app expects — it may be from a different FitNotes app version.`
    case 'missing-table':
      return `This file is missing the "${validation.table}" table — it doesn't look like a FitNotes backup.`
    default:
      return 'This file could not be validated as a FitNotes backup.'
  }
}

function readImportCounts() {
  const db = new Database(WORKING_DB_PATH, { readonly: true })
  try {
    return readEntityCounts(db)
  } finally {
    db.close()
  }
}
