import { getWorkingDb } from '../db.server'

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
  supersetId: number | null
  sets: Array<SetDTO>
}

export type SupersetDTO = {
  id: number
  name: string
  colour: number
}

export type SectionDTO = {
  id: number
  name: string
  sortOrder: number
  exercises: Array<SectionExerciseDTO>
  supersets: Array<SupersetDTO>
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

/** FitNotes' populate_sets_type enum is undocumented; 2 = "Copy previous workout" (inferred from backup data — see plan doc). */
const POPULATE_SETS_TYPE_COPY_PREVIOUS_WORKOUT = 2

// A routine-template superset's WorkoutGroup/WorkoutGroupExercise rows always
// carry an empty date — a non-empty date marks a one-off grouping made while
// logging a specific workout on that date, which this app doesn't manage.
const TEMPLATE_DATE = ''

// FitNotes cycles a section's supersets through this fixed 5-colour set
// (Android's old Holo accent palette: red, purple, blue, green, orange, in
// this order) — confirmed against every distinct WorkoutGroup.colour value
// already in use across a real backup's supersets. Wraps around past 5
// supersets in one section.
const SUPERSET_COLOURS = [-48060, -5609780, -13388315, -6697984, -17613] as const

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

    // WorkoutGroupExercise links a superset to an exercise_id, not a
    // RoutineSectionExercise row — fine as long as a section never has the
    // same exercise added twice, which the "add exercise" UI already prevents
    // implicitly (see plan doc).
    const supersetIdByExerciseId = new Map(
      (
        db
          .prepare('SELECT exercise_id, workout_group_id FROM WorkoutGroupExercise WHERE routine_section_id = ?')
          .all(section._id) as Array<{ exercise_id: number; workout_group_id: number }>
      ).map((m) => [m.exercise_id, m.workout_group_id]),
    )

    const supersets = db
      .prepare('SELECT _id, name, colour FROM WorkoutGroup WHERE routine_section_id = ?')
      .all(section._id) as Array<{ _id: number; name: string; colour: number }>

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
        supersetId: supersetIdByExerciseId.get(ex.exercise_id) ?? null,
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

    return {
      id: section._id,
      name: section.name,
      sortOrder: section.sort_order,
      exercises: exerciseDTOs,
      supersets: supersets.map((g) => ({ id: g._id, name: g.name, colour: g.colour })),
    }
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
  return { id, name, sortOrder: 0, exercises: [], supersets: [] }
}

export function renameSection(input: { id: number; name: string }): void {
  const db = getWorkingDb()
  const name = input.name.trim()
  if (!name) throw new Error('Section name is required.')
  db.prepare('UPDATE RoutineSection SET name = ? WHERE _id = ?').run(name, input.id)
}

/** Routine sections aren't referenced outside their own subtree — cascades straight through (KTD8). */
export function deleteSection(id: number): void {
  const db = getWorkingDb()
  const doDelete = db.transaction((sectionId: number) => {
    deleteSectionCascadeInternal(db, sectionId)
  })
  doDelete(id)
}

/** Removes a section's exercises, their sets, and any supersets first. Caller must already be inside a transaction. */
function deleteSectionCascadeInternal(db: ReturnType<typeof getWorkingDb>, sectionId: number): void {
  const exerciseIds = (
    db.prepare('SELECT _id FROM RoutineSectionExercise WHERE routine_section_id = ?').all(sectionId) as Array<{
      _id: number
    }>
  ).map((r) => r._id)
  for (const exerciseRowId of exerciseIds) {
    db.prepare('DELETE FROM RoutineSectionExerciseSet WHERE routine_section_exercise_id = ?').run(exerciseRowId)
  }
  db.prepare('DELETE FROM WorkoutGroupExercise WHERE routine_section_id = ?').run(sectionId)
  db.prepare('DELETE FROM WorkoutGroup WHERE routine_section_id = ?').run(sectionId)
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
      .prepare(
        'INSERT INTO RoutineSectionExercise (routine_section_id, exercise_id, sort_order, populate_sets_type) VALUES (?, ?, ?, ?)',
      )
      .run(input.sectionId, input.exerciseId, maxSort.m + 1, POPULATE_SETS_TYPE_COPY_PREVIOUS_WORKOUT)
    return Number(result.lastInsertRowid)
  })

  const id = create()
  const exercise = db.prepare('SELECT name FROM exercise WHERE _id = ?').get(input.exerciseId) as { name: string }
  return { id, exerciseId: input.exerciseId, exerciseName: exercise.name, sortOrder: 0, supersetId: null, sets: [] }
}

/** KTD8: removing an exercise from a section must also remove its target sets and any superset membership. */
export function removeExerciseFromSection(id: number): void {
  const db = getWorkingDb()
  const remove = db.transaction((sectionExerciseId: number) => {
    const sectionExercise = db
      .prepare('SELECT routine_section_id, exercise_id FROM RoutineSectionExercise WHERE _id = ?')
      .get(sectionExerciseId) as { routine_section_id: number; exercise_id: number } | undefined
    if (sectionExercise) {
      db.prepare('DELETE FROM WorkoutGroupExercise WHERE routine_section_id = ? AND exercise_id = ?').run(
        sectionExercise.routine_section_id,
        sectionExercise.exercise_id,
      )
    }
    db.prepare('DELETE FROM RoutineSectionExerciseSet WHERE routine_section_exercise_id = ?').run(sectionExerciseId)
    db.prepare('DELETE FROM RoutineSectionExercise WHERE _id = ?').run(sectionExerciseId)
  })
  remove(id)
}

/** Auto-names/colours by creation order within the section: "Superset 1", "Superset 2", ... */
export function createSuperset(input: { sectionId: number; name?: string }): SupersetDTO {
  const db = getWorkingDb()
  const create = db.transaction(() => {
    const existingCount = (
      db.prepare('SELECT COUNT(*) AS c FROM WorkoutGroup WHERE routine_section_id = ?').get(input.sectionId) as {
        c: number
      }
    ).c
    const ordinal = existingCount + 1
    const name = input.name?.trim() || `Superset ${ordinal}`
    const colour = SUPERSET_COLOURS[(ordinal - 1) % SUPERSET_COLOURS.length]
    const result = db
      .prepare('INSERT INTO WorkoutGroup (name, date, colour, routine_section_id) VALUES (?, ?, ?, ?)')
      .run(name, TEMPLATE_DATE, colour, input.sectionId)
    return { id: Number(result.lastInsertRowid), name, colour }
  })
  return create()
}

/** Moves a section exercise into a superset, replacing any prior membership — an exercise belongs to at most one. */
export function addExerciseToSuperset(input: { sectionExerciseId: number; supersetId: number }): void {
  const db = getWorkingDb()
  const add = db.transaction(() => {
    const sectionExercise = db
      .prepare('SELECT routine_section_id, exercise_id FROM RoutineSectionExercise WHERE _id = ?')
      .get(input.sectionExerciseId) as { routine_section_id: number; exercise_id: number } | undefined
    if (!sectionExercise) throw new Error(`Section exercise ${input.sectionExerciseId} not found.`)

    db.prepare('DELETE FROM WorkoutGroupExercise WHERE routine_section_id = ? AND exercise_id = ?').run(
      sectionExercise.routine_section_id,
      sectionExercise.exercise_id,
    )
    db.prepare(
      'INSERT INTO WorkoutGroupExercise (exercise_id, date, routine_section_id, workout_group_id) VALUES (?, ?, ?, ?)',
    ).run(sectionExercise.exercise_id, TEMPLATE_DATE, sectionExercise.routine_section_id, input.supersetId)
  })
  add()
}

/** Ungroups a single exercise — the superset and its other members are untouched. */
export function removeExerciseFromSuperset(sectionExerciseId: number): void {
  const db = getWorkingDb()
  const sectionExercise = db
    .prepare('SELECT routine_section_id, exercise_id FROM RoutineSectionExercise WHERE _id = ?')
    .get(sectionExerciseId) as { routine_section_id: number; exercise_id: number } | undefined
  if (!sectionExercise) return
  db.prepare('DELETE FROM WorkoutGroupExercise WHERE routine_section_id = ? AND exercise_id = ?').run(
    sectionExercise.routine_section_id,
    sectionExercise.exercise_id,
  )
}

/** Deletes the superset grouping itself — member exercises stay in the routine untouched. */
export function deleteSuperset(id: number): void {
  const db = getWorkingDb()
  const doDelete = db.transaction((supersetId: number) => {
    db.prepare('DELETE FROM WorkoutGroupExercise WHERE workout_group_id = ?').run(supersetId)
    db.prepare('DELETE FROM WorkoutGroup WHERE _id = ?').run(supersetId)
  })
  doDelete(id)
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
