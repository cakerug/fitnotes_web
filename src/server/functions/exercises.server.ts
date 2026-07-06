import { EXERCISE_REFERENCE_QUERIES, findReferences, findRepMaxGridReferences, getWorkingDb } from '../db.server'
import type { ReferenceCheck } from '../db.server'

// KTD5: exercise editable field scope. `_id` fields are never editable, and
// technical fields (exercise_type_id, default_rest_time, default_graph_id,
// weight_unit_id, is_favourite) are preserved but not exposed for editing.
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
}

export function createExercise(input: ExerciseInput): ExerciseDTO {
  const db = getWorkingDb()
  const name = input.name.trim()
  if (!name) throw new Error('Exercise name is required.')

  const create = db.transaction(() => {
    const result = db
      .prepare(
        'INSERT INTO exercise (name, category_id, notes, weight_increment, exercise_type_id, weight_unit_id, is_favourite) VALUES (?, ?, ?, ?, 0, 0, 0)',
      )
      .run(name, input.categoryId, input.notes ?? null, input.weightIncrement ?? null)
    return db.prepare('SELECT * FROM exercise WHERE _id = ?').get(result.lastInsertRowid) as ExerciseRow
  })

  return toDTO(create())
}

export function updateExercise(input: ExerciseInput & { id: number }): ExerciseDTO {
  const db = getWorkingDb()
  const name = input.name.trim()
  if (!name) throw new Error('Exercise name is required.')

  db.prepare('UPDATE exercise SET name = ?, category_id = ?, notes = ?, weight_increment = ? WHERE _id = ?').run(
    name,
    input.categoryId,
    input.notes ?? null,
    input.weightIncrement ?? null,
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
