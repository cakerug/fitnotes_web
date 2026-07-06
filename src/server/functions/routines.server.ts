import { ROUTINE_SECTION_REFERENCE_QUERIES, findReferences, getWorkingDb, type ReferenceCheck } from '../db.server'

export type SetDTO = {
  id: number
  metricWeight: number
  reps: number
  sortOrder: number
  distance: number
  durationSeconds: number
  unit: number
}

export type SectionExerciseDTO = {
  id: number
  exerciseId: number
  exerciseName: string
  sortOrder: number
  sets: Array<SetDTO>
}

export type SectionDTO = {
  id: number
  name: string
  sortOrder: number
  exercises: Array<SectionExerciseDTO>
}

export type RoutineDTO = {
  id: number
  name: string
  notes: string | null
  sections: Array<SectionDTO>
}

export type RoutineSummaryDTO = {
  id: number
  name: string
  notes: string | null
  sectionCount: number
}

export type DeleteResult = { status: 'success' } | { status: 'blocked'; references: Array<ReferenceCheck> }

export function listRoutines(): Array<RoutineSummaryDTO> {
  const db = getWorkingDb()
  const rows = db
    .prepare(
      `SELECT r._id, r.name, r.notes, COUNT(rs._id) AS sectionCount
       FROM Routine r
       LEFT JOIN RoutineSection rs ON rs.routine_id = r._id
       GROUP BY r._id
       ORDER BY r.name ASC`,
    )
    .all() as Array<{ _id: number; name: string; notes: string | null; sectionCount: number }>
  return rows.map((r) => ({ id: r._id, name: r.name, notes: r.notes, sectionCount: r.sectionCount }))
}

export function getRoutine(id: number): RoutineDTO {
  const db = getWorkingDb()
  const routine = db.prepare('SELECT * FROM Routine WHERE _id = ?').get(id) as
    { _id: number; name: string; notes: string | null } | undefined
  if (!routine) throw new Error(`Routine ${id} not found.`)

  const sections = db
    .prepare('SELECT * FROM RoutineSection WHERE routine_id = ? ORDER BY sort_order ASC')
    .all(id) as Array<{ _id: number; name: string; sort_order: number }>

  const sectionDTOs: Array<SectionDTO> = sections.map((section) => {
    const exercises = db
      .prepare(
        `SELECT rse._id, rse.exercise_id, rse.sort_order, e.name AS exercise_name
         FROM RoutineSectionExercise rse
         JOIN exercise e ON e._id = rse.exercise_id
         WHERE rse.routine_section_id = ?
         ORDER BY rse.sort_order ASC`,
      )
      .all(section._id) as Array<{
      _id: number
      exercise_id: number
      sort_order: number
      exercise_name: string
    }>

    const exerciseDTOs: Array<SectionExerciseDTO> = exercises.map((ex) => {
      const sets = db
        .prepare(
          'SELECT * FROM RoutineSectionExerciseSet WHERE routine_section_exercise_id = ? ORDER BY sort_order ASC',
        )
        .all(ex._id) as Array<{
        _id: number
        metric_weight: number
        reps: number
        sort_order: number
        distance: number
        duration_seconds: number
        unit: number
      }>
      return {
        id: ex._id,
        exerciseId: ex.exercise_id,
        exerciseName: ex.exercise_name,
        sortOrder: ex.sort_order,
        sets: sets.map((s) => ({
          id: s._id,
          metricWeight: s.metric_weight,
          reps: s.reps,
          sortOrder: s.sort_order,
          distance: s.distance,
          durationSeconds: s.duration_seconds,
          unit: s.unit,
        })),
      }
    })

    return { id: section._id, name: section.name, sortOrder: section.sort_order, exercises: exerciseDTOs }
  })

  return { id: routine._id, name: routine.name, notes: routine.notes, sections: sectionDTOs }
}

export function createRoutine(input: { name: string; notes?: string | null }): RoutineSummaryDTO {
  const db = getWorkingDb()
  const name = input.name.trim()
  if (!name) throw new Error('Routine name is required.')
  const result = db.prepare('INSERT INTO Routine (name, notes) VALUES (?, ?)').run(name, input.notes ?? null)
  return { id: Number(result.lastInsertRowid), name, notes: input.notes ?? null, sectionCount: 0 }
}

export function updateRoutine(input: { id: number; name: string; notes?: string | null }): void {
  const db = getWorkingDb()
  const name = input.name.trim()
  if (!name) throw new Error('Routine name is required.')
  db.prepare('UPDATE Routine SET name = ?, notes = ? WHERE _id = ?').run(name, input.notes ?? null, input.id)
}

/** Routines aren't referenced by other tables (Planning Contract > Assumptions) — no guard needed. */
export function deleteRoutine(id: number): void {
  const db = getWorkingDb()
  const cascade = db.transaction((routineId: number) => {
    const sectionIds = (
      db.prepare('SELECT _id FROM RoutineSection WHERE routine_id = ?').all(routineId) as Array<{ _id: number }>
    ).map((r) => r._id)
    for (const sectionId of sectionIds) {
      deleteSectionCascadeInternal(db, sectionId)
    }
    db.prepare('DELETE FROM Routine WHERE _id = ?').run(routineId)
  })
  cascade(id)
}

export function addSection(input: { routineId: number; name: string }): SectionDTO {
  const db = getWorkingDb()
  const name = input.name.trim()
  if (!name) throw new Error('Section name is required.')

  const create = db.transaction(() => {
    const maxSort = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM RoutineSection WHERE routine_id = ?')
      .get(input.routineId) as { m: number }
    const result = db
      .prepare('INSERT INTO RoutineSection (routine_id, name, sort_order) VALUES (?, ?, ?)')
      .run(input.routineId, name, maxSort.m + 1)
    return Number(result.lastInsertRowid)
  })

  const id = create()
  return { id, name, sortOrder: 0, exercises: [] }
}

export function renameSection(input: { id: number; name: string }): void {
  const db = getWorkingDb()
  const name = input.name.trim()
  if (!name) throw new Error('Section name is required.')
  db.prepare('UPDATE RoutineSection SET name = ? WHERE _id = ?').run(name, input.id)
}

/** KTD4 + KTD8: routine sections are referenced by WorkoutGroup/WorkoutGroupExercise. */
export function deleteSection(id: number): DeleteResult {
  const db = getWorkingDb()
  const doDelete = db.transaction((sectionId: number): DeleteResult => {
    const references = findReferences(db, ROUTINE_SECTION_REFERENCE_QUERIES, sectionId)
    if (references.length > 0) {
      return { status: 'blocked', references }
    }
    deleteSectionCascadeInternal(db, sectionId)
    return { status: 'success' }
  })
  return doDelete(id)
}

/** Removes a section's exercises and their sets first. Caller must already be inside a transaction. */
function deleteSectionCascadeInternal(db: ReturnType<typeof getWorkingDb>, sectionId: number): void {
  const exerciseIds = (
    db.prepare('SELECT _id FROM RoutineSectionExercise WHERE routine_section_id = ?').all(sectionId) as Array<{
      _id: number
    }>
  ).map((r) => r._id)
  for (const exerciseRowId of exerciseIds) {
    db.prepare('DELETE FROM RoutineSectionExerciseSet WHERE routine_section_exercise_id = ?').run(exerciseRowId)
  }
  db.prepare('DELETE FROM RoutineSectionExercise WHERE routine_section_id = ?').run(sectionId)
  db.prepare('DELETE FROM RoutineSection WHERE _id = ?').run(sectionId)
}

export function reorderSections(input: { orderedIds: Array<number> }): void {
  const db = getWorkingDb()
  const reorder = db.transaction((ids: Array<number>) => {
    const stmt = db.prepare('UPDATE RoutineSection SET sort_order = ? WHERE _id = ?')
    ids.forEach((id, index) => stmt.run(index, id))
  })
  reorder(input.orderedIds)
}

export function addExerciseToSection(input: { sectionId: number; exerciseId: number }): SectionExerciseDTO {
  const db = getWorkingDb()

  const create = db.transaction(() => {
    const maxSort = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM RoutineSectionExercise WHERE routine_section_id = ?')
      .get(input.sectionId) as { m: number }
    const result = db
      .prepare('INSERT INTO RoutineSectionExercise (routine_section_id, exercise_id, sort_order) VALUES (?, ?, ?)')
      .run(input.sectionId, input.exerciseId, maxSort.m + 1)
    return Number(result.lastInsertRowid)
  })

  const id = create()
  const exercise = db.prepare('SELECT name FROM exercise WHERE _id = ?').get(input.exerciseId) as { name: string }
  return { id, exerciseId: input.exerciseId, exerciseName: exercise.name, sortOrder: 0, sets: [] }
}

/** KTD8: removing an exercise from a section must also remove its target sets. */
export function removeExerciseFromSection(id: number): void {
  const db = getWorkingDb()
  const remove = db.transaction((sectionExerciseId: number) => {
    db.prepare('DELETE FROM RoutineSectionExerciseSet WHERE routine_section_exercise_id = ?').run(sectionExerciseId)
    db.prepare('DELETE FROM RoutineSectionExercise WHERE _id = ?').run(sectionExerciseId)
  })
  remove(id)
}

export function reorderSectionExercises(input: { orderedIds: Array<number> }): void {
  const db = getWorkingDb()
  const reorder = db.transaction((ids: Array<number>) => {
    const stmt = db.prepare('UPDATE RoutineSectionExercise SET sort_order = ? WHERE _id = ?')
    ids.forEach((id, index) => stmt.run(index, id))
  })
  reorder(input.orderedIds)
}

export type SetInput = {
  metricWeight: number
  reps: number
  distance?: number
  durationSeconds?: number
  unit?: number
}

export function addSet(input: { sectionExerciseId: number } & SetInput): SetDTO {
  const db = getWorkingDb()

  const create = db.transaction(() => {
    const maxSort = db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS m FROM RoutineSectionExerciseSet WHERE routine_section_exercise_id = ?',
      )
      .get(input.sectionExerciseId) as { m: number }
    const result = db
      .prepare(
        'INSERT INTO RoutineSectionExerciseSet (routine_section_exercise_id, metric_weight, reps, sort_order, distance, duration_seconds, unit) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        input.sectionExerciseId,
        input.metricWeight,
        input.reps,
        maxSort.m + 1,
        input.distance ?? 0,
        input.durationSeconds ?? 0,
        input.unit ?? 0,
      )
    return Number(result.lastInsertRowid)
  })

  const id = create()
  return {
    id,
    metricWeight: input.metricWeight,
    reps: input.reps,
    sortOrder: 0,
    distance: input.distance ?? 0,
    durationSeconds: input.durationSeconds ?? 0,
    unit: input.unit ?? 0,
  }
}

export function updateSet(input: { id: number } & SetInput): void {
  const db = getWorkingDb()
  db.prepare(
    'UPDATE RoutineSectionExerciseSet SET metric_weight = ?, reps = ?, distance = ?, duration_seconds = ?, unit = ? WHERE _id = ?',
  ).run(input.metricWeight, input.reps, input.distance ?? 0, input.durationSeconds ?? 0, input.unit ?? 0, input.id)
}

export function removeSet(id: number): void {
  const db = getWorkingDb()
  db.prepare('DELETE FROM RoutineSectionExerciseSet WHERE _id = ?').run(id)
}

export function reorderSets(input: { orderedIds: Array<number> }): void {
  const db = getWorkingDb()
  const reorder = db.transaction((ids: Array<number>) => {
    const stmt = db.prepare('UPDATE RoutineSectionExerciseSet SET sort_order = ? WHERE _id = ?')
    ids.forEach((id, index) => stmt.run(index, id))
  })
  reorder(input.orderedIds)
}
