import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTestWorkingDb, teardownTestWorkingDb } from '../testSupport'
import type { TestDbContext } from '../testSupport'
import type * as RoutinesServer from './routines.server'
import type * as ExercisesServer from './exercises.server'

let ctx: TestDbContext
let routinesServer: typeof RoutinesServer
let exercisesServer: typeof ExercisesServer

beforeEach(async () => {
  ctx = await setupTestWorkingDb()
  routinesServer = await import('./routines.server')
  exercisesServer = await import('./exercises.server')
})

afterEach(() => {
  teardownTestWorkingDb(ctx)
})

describe('routine CRUD', () => {
  it('happy path: builds a routine end-to-end (section, exercise, set) and persists each level', () => {
    const routine = routinesServer.createRoutine({ name: 'Push Day Test' })
    const section = routinesServer.addSection({ routineId: routine.id, name: 'Warmup' })
    const exercise = exercisesServer.listExercises()[0]
    const sectionExercise = routinesServer.addExerciseToSection({ sectionId: section.id, exerciseId: exercise.id })
    routinesServer.addSet({ sectionExerciseId: sectionExercise.id, metricWeight: 20, reps: 10 })

    const full = routinesServer.getRoutine(routine.id)
    expect(full.name).toBe('Push Day Test')
    expect(full.sections).toHaveLength(1)
    expect(full.sections[0].name).toBe('Warmup')
    expect(full.sections[0].exercises).toHaveLength(1)
    expect(full.sections[0].exercises[0].exerciseId).toBe(exercise.id)
    expect(full.sections[0].exercises[0].sets).toHaveLength(1)
    expect(full.sections[0].exercises[0].sets[0]).toMatchObject({ metricWeight: 20, reps: 10 })
  })

  it('happy path: adding an exercise to a section hardcodes populate_sets_type to "Copy previous workout"', () => {
    const routine = routinesServer.createRoutine({ name: 'Populate Sets Test' })
    const section = routinesServer.addSection({ routineId: routine.id, name: 'Main' })
    const exercise = exercisesServer.listExercises()[0]
    const sectionExercise = routinesServer.addExerciseToSection({ sectionId: section.id, exerciseId: exercise.id })

    const db = ctx.dbModule.getWorkingDb()
    const row = db
      .prepare('SELECT populate_sets_type FROM RoutineSectionExercise WHERE _id = ?')
      .get(sectionExercise.id) as { populate_sets_type: number }
    expect(row.populate_sets_type).toBe(2)
  })

  it('happy path: reordering exercises within a section persists sort_order (KTD6)', () => {
    const routine = routinesServer.createRoutine({ name: 'Reorder Test' })
    const section = routinesServer.addSection({ routineId: routine.id, name: 'Main' })
    const exercises = exercisesServer.listExercises().slice(0, 3)
    const sectionExercises = exercises.map((e) =>
      routinesServer.addExerciseToSection({ sectionId: section.id, exerciseId: e.id }),
    )

    const reversedIds = [...sectionExercises].reverse().map((se) => se.id)
    routinesServer.reorderSectionExercises({ orderedIds: reversedIds })

    const full = routinesServer.getRoutine(routine.id)
    expect(full.sections[0].exercises.map((e) => e.id)).toEqual(reversedIds)
  })

  it('edge case: a routine with no sections, and a section with no exercises, both persist without error', () => {
    const routine = routinesServer.createRoutine({ name: 'Empty Routine' })
    expect(routinesServer.getRoutine(routine.id).sections).toEqual([])

    const section = routinesServer.addSection({ routineId: routine.id, name: 'Empty Section' })
    const full = routinesServer.getRoutine(routine.id)
    expect(full.sections).toHaveLength(1)
    expect(full.sections[0].exercises).toEqual([])
    expect(section.exercises).toEqual([])
  })

  it('edge case: removing an exercise from a section also removes its target sets (KTD8)', () => {
    const routine = routinesServer.createRoutine({ name: 'Cascade Test' })
    const section = routinesServer.addSection({ routineId: routine.id, name: 'Main' })
    const exercise = exercisesServer.listExercises()[0]
    const sectionExercise = routinesServer.addExerciseToSection({ sectionId: section.id, exerciseId: exercise.id })
    routinesServer.addSet({ sectionExerciseId: sectionExercise.id, metricWeight: 10, reps: 5 })
    routinesServer.addSet({ sectionExerciseId: sectionExercise.id, metricWeight: 15, reps: 5 })

    routinesServer.removeExerciseFromSection(sectionExercise.id)

    const db = ctx.dbModule.getWorkingDb()
    const orphanedSets = db
      .prepare('SELECT COUNT(*) AS c FROM RoutineSectionExerciseSet WHERE routine_section_exercise_id = ?')
      .get(sectionExercise.id) as { c: number }
    expect(orphanedSets.c).toBe(0)
    expect(routinesServer.getRoutine(routine.id).sections[0].exercises).toEqual([])
  })

  it('edge case: deleting a routine section referenced by a WorkoutGroup is blocked (KTD4)', () => {
    const db = ctx.dbModule.getWorkingDb()
    // routine_section_id = 0 is FitNotes' sentinel for "no section", not a real
    // reference — join against RoutineSection to find an actual live reference.
    const referenced = db
      .prepare(
        `SELECT wg.routine_section_id FROM WorkoutGroup wg
         JOIN RoutineSection rs ON rs._id = wg.routine_section_id
         LIMIT 1`,
      )
      .get() as { routine_section_id: number } | undefined
    expect(referenced).toBeDefined()

    const result = routinesServer.deleteSection(referenced!.routine_section_id)

    expect(result.status).toBe('blocked')
    if (result.status !== 'blocked') throw new Error('unreachable')
    expect(result.references.some((r) => r.label === 'workout groups')).toBe(true)

    const stillExists = db
      .prepare('SELECT COUNT(*) AS c FROM RoutineSection WHERE _id = ?')
      .get(referenced!.routine_section_id) as { c: number }
    expect(stillExists.c).toBe(1)
  })

  it('integration: adding a target set correctly joins RoutineSectionExercise and RoutineSectionExerciseSet', () => {
    const routine = routinesServer.createRoutine({ name: 'Join Test' })
    const section = routinesServer.addSection({ routineId: routine.id, name: 'Main' })
    const exercise = exercisesServer.listExercises()[0]
    const sectionExercise = routinesServer.addExerciseToSection({ sectionId: section.id, exerciseId: exercise.id })
    const set = routinesServer.addSet({ sectionExerciseId: sectionExercise.id, metricWeight: 30, reps: 8 })

    const db = ctx.dbModule.getWorkingDb()
    const row = db
      .prepare(
        `SELECT s.metric_weight, s.reps, rse.exercise_id
         FROM RoutineSectionExerciseSet s
         JOIN RoutineSectionExercise rse ON rse._id = s.routine_section_exercise_id
         WHERE s._id = ?`,
      )
      .get(set.id) as { metric_weight: number; reps: number; exercise_id: number }
    expect(row.metric_weight).toBe(30)
    expect(row.reps).toBe(8)
    expect(row.exercise_id).toBe(exercise.id)
  })

  it('integration: a simulated failure partway through a cascading delete leaves the DB unchanged (KTD8)', () => {
    const routine = routinesServer.createRoutine({ name: 'Rollback Test' })
    const section = routinesServer.addSection({ routineId: routine.id, name: 'Main' })
    const exercise = exercisesServer.listExercises()[0]
    const sectionExercise = routinesServer.addExerciseToSection({ sectionId: section.id, exerciseId: exercise.id })
    routinesServer.addSet({ sectionExerciseId: sectionExercise.id, metricWeight: 10, reps: 5 })

    const db = ctx.dbModule.getWorkingDb()
    const setCountBefore = (db.prepare('SELECT COUNT(*) AS c FROM RoutineSectionExerciseSet').get() as { c: number }).c
    const exerciseCountBefore = (db.prepare('SELECT COUNT(*) AS c FROM RoutineSectionExercise').get() as { c: number })
      .c

    expect(() => {
      const doomed = db.transaction((sectionExerciseId: number) => {
        db.prepare('DELETE FROM RoutineSectionExerciseSet WHERE routine_section_exercise_id = ?').run(sectionExerciseId)
        throw new Error('simulated failure before the exercise row is removed')
      })
      doomed(sectionExercise.id)
    }).toThrow('simulated failure')

    const setCountAfter = (db.prepare('SELECT COUNT(*) AS c FROM RoutineSectionExerciseSet').get() as { c: number }).c
    const exerciseCountAfter = (db.prepare('SELECT COUNT(*) AS c FROM RoutineSectionExercise').get() as { c: number }).c
    expect(setCountAfter).toBe(setCountBefore)
    expect(exerciseCountAfter).toBe(exerciseCountBefore)
  })
})
