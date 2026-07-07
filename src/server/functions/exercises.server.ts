import { EXERCISE_REFERENCE_QUERIES, findReferences, findRepMaxGridReferences, getWorkingDb } from '../db.server'
import type { ReferenceCheck } from '../db.server'
import { createCategory } from './categories.server'
import { hexToCategoryColor } from '../../lib/categoryColors'

// KTD5: exercise editable field scope. `_id` fields are never editable.
// exercise_type_id is now user-editable (see src/lib/exerciseTypes.ts for
// what its values mean); the remaining technical fields (default_rest_time,
// default_graph_id, weight_unit_id, is_favourite) are still preserved as
// imported but not exposed for editing.
export type ExerciseDTO = {
  id: number
  name: string
  categoryId: number
  notes: string | null
  weightIncrement: number | null
  exerciseTypeId: number
  defaultRestTime: number | null
  defaultGraphId: number | null
  weightUnitId: number
  isFavourite: boolean
}

export type DeleteResult = { status: 'success' } | { status: 'blocked'; references: Array<ReferenceCheck> }

type ExerciseRow = {
  _id: number
  name: string
  category_id: number
  notes: string | null
  weight_increment: number | null
  exercise_type_id: number
  default_rest_time: number | null
  default_graph_id: number | null
  weight_unit_id: number
  is_favourite: number
}

function toDTO(row: ExerciseRow): ExerciseDTO {
  return {
    id: row._id,
    name: row.name,
    categoryId: row.category_id,
    notes: row.notes,
    weightIncrement: row.weight_increment,
    exerciseTypeId: row.exercise_type_id,
    defaultRestTime: row.default_rest_time,
    defaultGraphId: row.default_graph_id,
    weightUnitId: row.weight_unit_id,
    isFavourite: row.is_favourite !== 0,
  }
}

export function listExercises(filter?: { search?: string; categoryId?: number }): Array<ExerciseDTO> {
  const db = getWorkingDb()
  const clauses: Array<string> = []
  const params: Array<string | number> = []

  if (filter?.search?.trim()) {
    clauses.push('name LIKE ?')
    params.push(`%${filter.search.trim()}%`)
  }
  if (filter?.categoryId !== undefined) {
    clauses.push('category_id = ?')
    params.push(filter.categoryId)
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = db.prepare(`SELECT * FROM exercise ${where} ORDER BY name ASC`).all(...params) as Array<ExerciseRow>
  return rows.map(toDTO)
}

export function getExercise(id: number): ExerciseDTO {
  const db = getWorkingDb()
  const row = db.prepare('SELECT * FROM exercise WHERE _id = ?').get(id) as ExerciseRow | undefined
  if (!row) throw new Error(`Exercise ${id} not found.`)
  return toDTO(row)
}

export type ExerciseInput = {
  name: string
  categoryId: number
  notes?: string | null
  weightIncrement?: number | null
  /** Defaults to 0 (Weight & Reps, FitNotes' own default) on create; left untouched on update if omitted. */
  exerciseTypeId?: number
}

export function createExercise(input: ExerciseInput): ExerciseDTO {
  const db = getWorkingDb()
  const name = input.name.trim()
  if (!name) throw new Error('Exercise name is required.')

  const create = db.transaction(() => {
    const result = db
      .prepare(
        'INSERT INTO exercise (name, category_id, notes, weight_increment, exercise_type_id, weight_unit_id, is_favourite) VALUES (?, ?, ?, ?, ?, 0, 0)',
      )
      .run(name, input.categoryId, input.notes ?? null, input.weightIncrement ?? null, input.exerciseTypeId ?? 0)
    return db.prepare('SELECT * FROM exercise WHERE _id = ?').get(result.lastInsertRowid) as ExerciseRow
  })

  return toDTO(create())
}

export function updateExercise(input: ExerciseInput & { id: number }): ExerciseDTO {
  const db = getWorkingDb()
  const name = input.name.trim()
  if (!name) throw new Error('Exercise name is required.')

  // exercise_type_id uses COALESCE so an omitted value leaves the existing type untouched
  // rather than resetting it to 0 — callers that don't manage this field (e.g. older tests)
  // must not silently wipe it.
  db.prepare(
    'UPDATE exercise SET name = ?, category_id = ?, notes = ?, weight_increment = ?, exercise_type_id = COALESCE(?, exercise_type_id) WHERE _id = ?',
  ).run(
    name,
    input.categoryId,
    input.notes ?? null,
    input.weightIncrement ?? null,
    input.exerciseTypeId ?? null,
    input.id,
  )
  return getExercise(input.id)
}

export type ExerciseLogStatsDTO = { exerciseId: number; loggedCount: number; lastLoggedDate: string | null }

/** `date` is stored as ISO text (YYYY-MM-DD), so MAX() sorts it correctly as a string. */
export function listExerciseLogStats(): Array<ExerciseLogStatsDTO> {
  const db = getWorkingDb()
  const rows = db
    .prepare(
      'SELECT exercise_id, COUNT(*) AS logged_count, MAX(date) AS last_logged_date FROM training_log GROUP BY exercise_id',
    )
    .all() as Array<{ exercise_id: number; logged_count: number; last_logged_date: string | null }>
  return rows.map((r) => ({
    exerciseId: r.exercise_id,
    loggedCount: r.logged_count,
    lastLoggedDate: r.last_logged_date,
  }))
}

/** KTD4 + KTD8: check-then-delete against the full pinned reference list, in one transaction. */
export function deleteExercise(id: number): DeleteResult {
  const db = getWorkingDb()
  const doDelete = db.transaction((exerciseId: number): DeleteResult => {
    const references = findReferences(db, EXERCISE_REFERENCE_QUERIES, exerciseId)
    const repMaxGridRef = findRepMaxGridReferences(db, exerciseId)
    if (repMaxGridRef) references.push(repMaxGridRef)

    if (references.length > 0) {
      return { status: 'blocked', references }
    }
    db.prepare('DELETE FROM exercise WHERE _id = ?').run(exerciseId)
    return { status: 'success' }
  })
  return doDelete(id)
}

export const UNUSED_CATEGORY_NAME = 'Unused'
const UNUSED_CATEGORY_COLOUR = hexToCategoryColor('#757575')

type UnusedCandidate = { id: number; name: string; categoryName: string }

function findUnusedCategoryId(db: ReturnType<typeof getWorkingDb>): number | null {
  const row = db.prepare('SELECT _id FROM Category WHERE name = ?').get(UNUSED_CATEGORY_NAME) as
    { _id: number } | undefined
  return row?._id ?? null
}

/** Exercises with no training-log entries, excluding any already sitting in the Unused category. */
function listUnusedCandidates(
  db: ReturnType<typeof getWorkingDb>,
  unusedCategoryId: number | null,
): Array<UnusedCandidate> {
  const excludeClause = unusedCategoryId !== null ? 'AND e.category_id != ?' : ''
  const params = unusedCategoryId !== null ? [unusedCategoryId] : []
  const rows = db
    .prepare(
      `SELECT e._id AS id, e.name AS name, c.name AS category_name
       FROM exercise e
       JOIN Category c ON c._id = e.category_id
       WHERE NOT EXISTS (SELECT 1 FROM training_log t WHERE t.exercise_id = e._id) ${excludeClause}`,
    )
    .all(...params) as Array<{ id: number; name: string; category_name: string }>
  return rows.map((r) => ({ id: r.id, name: r.name, categoryName: r.category_name }))
}

/** Preview count for the confirm dialog: how many exercises `moveUnusedExercisesToCategory` would touch. */
export function countUnusedExercises(): number {
  const db = getWorkingDb()
  return listUnusedCandidates(db, findUnusedCategoryId(db)).length
}

/**
 * Moves every exercise with no training-log entries into the "Unused" category
 * (created on first use), prefixing its name with its prior category's name so
 * the original grouping isn't lost, e.g. "Abs - Incline Crunch" for an
 * "Incline Crunch" exercise previously filed under "Abs".
 */
export function moveUnusedExercisesToCategory(): { movedCount: number } {
  const db = getWorkingDb()
  const move = db.transaction((): { movedCount: number } => {
    const existingUnusedId = findUnusedCategoryId(db)
    const candidates = listUnusedCandidates(db, existingUnusedId)
    if (candidates.length === 0) return { movedCount: 0 }

    const unusedId =
      existingUnusedId ?? createCategory({ name: UNUSED_CATEGORY_NAME, colour: UNUSED_CATEGORY_COLOUR }).id

    const rename = db.prepare('UPDATE exercise SET name = ?, category_id = ? WHERE _id = ?')
    for (const candidate of candidates) {
      rename.run(`${candidate.categoryName} - ${candidate.name}`, unusedId, candidate.id)
    }
    return { movedCount: candidates.length }
  })
  return move()
}
