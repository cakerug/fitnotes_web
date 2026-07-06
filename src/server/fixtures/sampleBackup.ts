import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { EXPECTED_USER_VERSION } from '../db.server'

const SCHEMA_PATH = path.join(import.meta.dirname, 'fitnotes-schema.sql')

/**
 * Builds a synthetic FitNotes backup file for tests: same table shape as a
 * real export (see fitnotes-schema.sql), seeded with a handful of
 * deterministic fake rows instead of a real user's data. Replaces the old
 * approach of reading a real personal backup off disk, which can't be
 * committed (see .gitignore's `*.fitnotes` rule) and isn't reproducible
 * outside the machine that happened to have one.
 *
 * Seeds just enough for existing test assumptions: a category with an
 * assigned exercise (category delete-block), an exercise with training-log
 * history (exercise delete-block), and a routine section referenced by a
 * WorkoutGroup (section delete-block).
 */
export function buildSampleBackupBytes(): Buffer {
  const tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fitnotes-fixture-')), 'sample.fitnotes')
  const db = new Database(tmpFile)
  try {
    db.pragma(`user_version = ${EXPECTED_USER_VERSION}`)
    db.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'))

    db.exec(`
      INSERT INTO Category (_id, name, colour, sort_order) VALUES
        (1, 'Legs', 100, 0),
        (2, 'Arms', 200, 1);

      INSERT INTO exercise (_id, name, category_id) VALUES
        (1, 'Squat', 1),
        (2, 'Lunge', 1),
        (3, 'Curl', 2);

      INSERT INTO training_log (_id, exercise_id, date, metric_weight, reps) VALUES
        (1, 1, '2024-01-01', 100, 5);

      INSERT INTO Routine (_id, name, notes) VALUES
        (1, 'Sample Routine', NULL);

      INSERT INTO RoutineSection (_id, routine_id, name, sort_order) VALUES
        (1, 1, 'Main', 0);

      INSERT INTO WorkoutGroup (_id, name, date, colour, routine_section_id) VALUES
        (1, 'Sample Workout', '2024-01-01', 0, 1);
    `)
  } finally {
    db.close()
  }

  const bytes = fs.readFileSync(tmpFile)
  fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true })
  return bytes
}
