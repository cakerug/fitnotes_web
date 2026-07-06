import fs from 'node:fs'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTestWorkingDb, teardownTestWorkingDb } from '../testSupport'
import type { TestDbContext } from '../testSupport'
import type * as ExportServer from './export.server'
import type * as ExercisesServer from './exercises.server'
import type * as RoutinesServer from './routines.server'

let ctx: TestDbContext
let prepareExport: typeof ExportServer.prepareExport
let exercisesServer: typeof ExercisesServer
let routinesServer: typeof RoutinesServer

beforeEach(async () => {
  ctx = await setupTestWorkingDb()
  ;({ prepareExport } = await import('./export.server'))
  exercisesServer = await import('./exercises.server')
  routinesServer = await import('./routines.server')
})

afterEach(() => {
  teardownTestWorkingDb(ctx)
})

describe('prepareExport', () => {
  it('happy path: produces a SQLite file that passes the same schema checks as import', () => {
    const result = prepareExport()

    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('unreachable')
    expect(fs.existsSync(result.filePath)).toBe(true)

    const db = new Database(result.filePath, { readonly: true, fileMustExist: true })
    try {
      expect(db.pragma('user_version', { simple: true })).toBe(22)
      const tableNames = new Set(
        (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
          (r) => r.name,
        ),
      )
      expect(tableNames.has('exercise')).toBe(true)
      expect(tableNames.has('Category')).toBe(true)
      expect(tableNames.has('Routine')).toBe(true)
    } finally {
      db.close()
      fs.rmSync(result.filePath, { force: true })
    }
  })

  it('covers AE1: a renamed exercise still resolves correctly from exported training_log rows, with row counts unchanged', () => {
    const db = ctx.dbModule.getWorkingDb()
    const referenced = db
      .prepare(
        `SELECT tl.exercise_id, COUNT(*) AS c FROM training_log tl
         GROUP BY tl.exercise_id ORDER BY c DESC LIMIT 1`,
      )
      .get() as { exercise_id: number; c: number }

    const renamed = exercisesServer.updateExercise({
      ...exercisesServer.getExercise(referenced.exercise_id),
      name: 'Renamed Exercise AE1',
    })

    const trainingLogCountBefore = (db.prepare('SELECT COUNT(*) AS c FROM training_log').get() as { c: number }).c

    const result = prepareExport()
    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('unreachable')

    const exported = new Database(result.filePath, { readonly: true, fileMustExist: true })
    try {
      const trainingLogCountAfter = (exported.prepare('SELECT COUNT(*) AS c FROM training_log').get() as { c: number })
        .c
      expect(trainingLogCountAfter).toBe(trainingLogCountBefore)

      const joined = exported
        .prepare(
          `SELECT e.name FROM training_log tl JOIN exercise e ON e._id = tl.exercise_id WHERE tl.exercise_id = ? LIMIT 1`,
        )
        .get(referenced.exercise_id) as { name: string } | undefined
      expect(joined?.name).toBe(renamed.name)
    } finally {
      exported.close()
      fs.rmSync(result.filePath, { force: true })
    }
  })

  it('covers AE2: reordered section exercises keep their set associations after export', () => {
    const routine = routinesServer.createRoutine({ name: 'AE2 Routine' })
    const section = routinesServer.addSection({ routineId: routine.id, name: 'Main' })
    const exercises = exercisesServer.listExercises().slice(0, 2)
    const first = routinesServer.addExerciseToSection({ sectionId: section.id, exerciseId: exercises[0].id })
    const second = routinesServer.addExerciseToSection({ sectionId: section.id, exerciseId: exercises[1].id })
    routinesServer.addSet({ sectionExerciseId: first.id, metricWeight: 40, reps: 5 })
    routinesServer.addSet({ sectionExerciseId: second.id, metricWeight: 50, reps: 3 })

    routinesServer.reorderSectionExercises({ orderedIds: [second.id, first.id] })

    const result = prepareExport()
    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('unreachable')

    const exported = new Database(result.filePath, { readonly: true, fileMustExist: true })
    try {
      const rows = exported
        .prepare(
          `SELECT rse._id, rse.exercise_id, rse.sort_order, s.metric_weight
           FROM RoutineSectionExercise rse
           JOIN RoutineSectionExerciseSet s ON s.routine_section_exercise_id = rse._id
           WHERE rse.routine_section_id = ?
           ORDER BY rse.sort_order ASC`,
        )
        .all(section.id) as Array<{ _id: number; exercise_id: number; sort_order: number; metric_weight: number }>

      expect(rows.map((r) => r._id)).toEqual([second.id, first.id])
      expect(rows[0]).toMatchObject({ exercise_id: exercises[1].id, metric_weight: 50 })
      expect(rows[1]).toMatchObject({ exercise_id: exercises[0].id, metric_weight: 40 })
    } finally {
      exported.close()
      fs.rmSync(result.filePath, { force: true })
    }
  })

  it('edge case: export is blocked if the working DB fails PRAGMA integrity_check', () => {
    ctx.dbModule.closeWorkingDb()

    // Corrupt a data page in place (well past the header) to trip integrity_check
    // without producing an unreadable, non-SQLite file.
    const fd = fs.openSync(ctx.dbModule.WORKING_DB_PATH, 'r+')
    try {
      const garbage = Buffer.from('CORRUPTED-PAGE-DATA-FOR-TEST-PURPOSES-ONLY')
      fs.writeSync(fd, garbage, 0, garbage.length, 4096)
    } finally {
      fs.closeSync(fd)
    }

    const result = prepareExport()
    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('unreachable')
    expect(result.reason).toBe('integrity-check-failed')
  })

  it('edge case: export is blocked if a passthrough table row count differs from the KTD9 baseline', () => {
    const db = ctx.dbModule.getWorkingDb()
    const exerciseId = (db.prepare('SELECT _id FROM exercise LIMIT 1').get() as { _id: number })._id
    db.prepare('INSERT INTO training_log (exercise_id, date, metric_weight, reps) VALUES (?, ?, ?, ?)').run(
      exerciseId,
      '2026-01-01',
      100,
      10,
    )

    const result = prepareExport()
    expect(result.status).toBe('error')
    if (result.status !== 'error') throw new Error('unreachable')
    expect(result.reason).toBe('row-count-mismatch')
  })
})
