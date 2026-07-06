import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTestWorkingDb, teardownTestWorkingDb } from '../testSupport'
import type { TestDbContext } from '../testSupport'
import type * as DiffServer from './diff.server'
import type * as CategoriesServer from './categories.server'
import type * as ExercisesServer from './exercises.server'
import type * as RoutinesServer from './routines.server'

let ctx: TestDbContext
let getExportDiffSummary: typeof DiffServer.getExportDiffSummary
let categoriesServer: typeof CategoriesServer
let exercisesServer: typeof ExercisesServer
let routinesServer: typeof RoutinesServer

beforeEach(async () => {
  ctx = await setupTestWorkingDb()
  ;({ getExportDiffSummary } = await import('./diff.server'))
  categoriesServer = await import('./categories.server')
  exercisesServer = await import('./exercises.server')
  routinesServer = await import('./routines.server')
})

afterEach(() => {
  teardownTestWorkingDb(ctx)
})

describe('getExportDiffSummary', () => {
  it('reports no changes right after import', () => {
    const summary = getExportDiffSummary()
    expect(summary.status).toBe('ready')
    if (summary.status !== 'ready') throw new Error('unreachable')
    expect(summary.hasChanges).toBe(false)
  })

  it('detects added, modified, and removed categories', () => {
    const created = categoriesServer.createCategory({ name: 'New Category', colour: 1 })
    const existing = categoriesServer.listCategories().find((c) => c.id !== created.id)!
    categoriesServer.updateCategory({ id: existing.id, name: 'Renamed Category', colour: existing.colour })
    categoriesServer.deleteCategory(created.id)

    const summary = getExportDiffSummary()
    expect(summary.status).toBe('ready')
    if (summary.status !== 'ready') throw new Error('unreachable')
    expect(summary.hasChanges).toBe(true)
    expect(summary.categories.modified).toContain('Renamed Category')
    expect(summary.categories.added).toEqual([])
    expect(summary.categories.removed).toEqual([])
  })

  it('detects added and modified exercises', () => {
    const category = categoriesServer.listCategories()[0]
    const created = exercisesServer.createExercise({ name: 'New Exercise', categoryId: category.id })
    exercisesServer.updateExercise({ ...created, name: 'Renamed Exercise' })

    const summary = getExportDiffSummary()
    expect(summary.status).toBe('ready')
    if (summary.status !== 'ready') throw new Error('unreachable')
    expect(summary.exercises.added).toContain('Renamed Exercise')
  })

  it('detects added, modified, and removed routines', () => {
    const routine = routinesServer.createRoutine({ name: 'New Routine' })
    const other = routinesServer.createRoutine({ name: 'Other Routine' })
    routinesServer.updateRoutine({ id: other.id, name: 'Renamed Routine' })
    routinesServer.deleteRoutine(routine.id)

    const summary = getExportDiffSummary()
    expect(summary.status).toBe('ready')
    if (summary.status !== 'ready') throw new Error('unreachable')
    expect(summary.routines.added).toEqual(['Renamed Routine'])
    expect(summary.routines.removed).toEqual([])
    expect(summary.routines.modified).toEqual([])
  })

  it('rolls sections, section exercises, and sets up into routineStructure counts', () => {
    const routine = routinesServer.createRoutine({ name: 'Structure Routine' })
    const section = routinesServer.addSection({ routineId: routine.id, name: 'Main' })
    const exercise = exercisesServer.listExercises()[0]
    const sectionExercise = routinesServer.addExerciseToSection({ sectionId: section.id, exerciseId: exercise.id })
    routinesServer.addSet({ sectionExerciseId: sectionExercise.id, metricWeight: 40, reps: 5 })

    const summary = getExportDiffSummary()
    expect(summary.status).toBe('ready')
    if (summary.status !== 'ready') throw new Error('unreachable')
    expect(summary.routineStructure.added).toBe(3)
    expect(summary.routineStructure.modified).toBe(0)
    expect(summary.routineStructure.removed).toBe(0)
  })

  it('is unavailable when there is no working DB', () => {
    ctx.dbModule.closeWorkingDb()
    fs.rmSync(ctx.dbModule.WORKING_DB_PATH, { force: true })

    const summary = getExportDiffSummary()
    expect(summary.status).toBe('unavailable')
  })
})
