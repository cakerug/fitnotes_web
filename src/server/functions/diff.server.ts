import Database from 'better-sqlite3'
import { ORIGINAL_IMPORT_DB_PATH, getWorkingDb, workingDbExists } from '../db.server'
import fs from 'node:fs'

export type EntityDiff = {
  added: Array<string>
  removed: Array<string>
  modified: Array<string>
}

export type StructureDiff = { added: number; modified: number; removed: number }

export type ExportDiffSummary =
  | { status: 'unavailable' }
  | {
      status: 'ready'
      hasChanges: boolean
      categories: EntityDiff
      exercises: EntityDiff
      routines: EntityDiff
      routineStructure: StructureDiff
    }

type Row = Record<string, unknown>

function rowsById(db: Database.Database, table: string): Map<number, Row> {
  const rows = db.prepare(`SELECT * FROM "${table}"`).all() as Array<Row>
  return new Map(rows.map((r) => [r._id as number, r]))
}

function rowsEqual(a: Row, b: Row): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (a[key] !== b[key]) return false
  }
  return true
}

/** Row-by-row comparison against the KTD9 baseline — nothing in the schema tracks edit history. */
function diffTable(
  workingDb: Database.Database,
  baselineDb: Database.Database,
  table: string,
  nameColumn?: string,
): EntityDiff {
  const working = rowsById(workingDb, table)
  const baseline = rowsById(baselineDb, table)

  const added: Array<string> = []
  const removed: Array<string> = []
  const modified: Array<string> = []

  for (const [id, row] of working) {
    const baselineRow = baseline.get(id)
    const label = nameColumn ? String(row[nameColumn]) : `#${id}`
    if (!baselineRow) {
      added.push(label)
    } else if (!rowsEqual(row, baselineRow)) {
      modified.push(label)
    }
  }
  for (const [id, row] of baseline) {
    if (!working.has(id)) {
      removed.push(nameColumn ? String(row[nameColumn]) : `#${id}`)
    }
  }

  return { added, removed, modified }
}

function structureCounts(diff: EntityDiff): StructureDiff {
  return { added: diff.added.length, modified: diff.modified.length, removed: diff.removed.length }
}

function addStructureCounts(a: StructureDiff, b: StructureDiff): StructureDiff {
  return { added: a.added + b.added, modified: a.modified + b.modified, removed: a.removed + b.removed }
}

/** Diffs the working DB against the frozen import-time baseline, table by table. */
export function getExportDiffSummary(): ExportDiffSummary {
  if (!workingDbExists() || !fs.existsSync(ORIGINAL_IMPORT_DB_PATH)) {
    return { status: 'unavailable' }
  }

  const workingDb = getWorkingDb()
  const baselineDb = new Database(ORIGINAL_IMPORT_DB_PATH, { readonly: true })
  try {
    const categories = diffTable(workingDb, baselineDb, 'Category', 'name')
    const exercises = diffTable(workingDb, baselineDb, 'exercise', 'name')
    const routines = diffTable(workingDb, baselineDb, 'Routine', 'name')

    const routineStructure = [
      diffTable(workingDb, baselineDb, 'RoutineSection'),
      diffTable(workingDb, baselineDb, 'RoutineSectionExercise'),
      diffTable(workingDb, baselineDb, 'RoutineSectionExerciseSet'),
    ]
      .map(structureCounts)
      .reduce(addStructureCounts, { added: 0, modified: 0, removed: 0 })

    const hasChanges =
      [categories, exercises, routines].some((d) => d.added.length + d.removed.length + d.modified.length > 0) ||
      routineStructure.added + routineStructure.modified + routineStructure.removed > 0

    return { status: 'ready', hasChanges, categories, exercises, routines, routineStructure }
  } finally {
    baselineDb.close()
  }
}
