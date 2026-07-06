import fs from 'node:fs'
import { WORKING_DB_PATH, getWorkingDb, readEntityCounts, workingDbExists } from '../db.server'
import type { EntityCounts } from '../db.server'

export type DashboardSummary =
  | { status: 'empty' }
  | {
      status: 'ready'
      importedAt: string
      counts: EntityCounts
      latestWorkoutDate: string | null
    }

/**
 * U6: file mtime is a cheap "imported at" proxy — nothing in the schema
 * records import time, and re-deriving one would mean writing into a
 * passthrough table, which KTD1/R2 rules out. Latest training_log.date is
 * the more meaningful staleness signal (does this backup have recent
 * workouts?), not just when the file was touched.
 */
export function getDashboardSummary(): DashboardSummary {
  if (!workingDbExists()) {
    return { status: 'empty' }
  }

  const importedAt = fs.statSync(WORKING_DB_PATH).mtime.toISOString()
  const db = getWorkingDb()
  const counts = readEntityCounts(db)
  const latestWorkoutDate =
    (db.prepare('SELECT MAX(date) AS latest FROM training_log').get() as { latest: string | null }).latest ?? null

  return { status: 'ready', importedAt, counts, latestWorkoutDate }
}
