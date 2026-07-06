import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTestWorkingDb, teardownTestWorkingDb, type TestDbContext } from '../testSupport'

let ctx: TestDbContext
let exercisesServer: typeof import('./exercises.server')
let categoriesServer: typeof import('./categories.server')

beforeEach(async () => {
  ctx = await setupTestWorkingDb()
  exercisesServer = await import('./exercises.server')
  categoriesServer = await import('./categories.server')
})

afterEach(() => {
  teardownTestWorkingDb(ctx)
})

describe('exercise CRUD', () => {
  it('happy path: create, rename, recategorize, and delete an exercise with no references', () => {
    const categories = categoriesServer.listCategories()
    const [categoryA, categoryB] = categories

    const created = exercisesServer.createExercise({
      name: 'Test Curl',
      categoryId: categoryA.id,
      notes: 'initial notes',
      weightIncrement: 5,
    })
    expect(created.name).toBe('Test Curl')
    expect(created.categoryId).toBe(categoryA.id)

    const renamed = exercisesServer.updateExercise({
      id: created.id,
      name: 'Test Curl Renamed',
      categoryId: categoryB.id,
      notes: 'updated notes',
      weightIncrement: 2.5,
    })
    expect(renamed.name).toBe('Test Curl Renamed')
    expect(renamed.categoryId).toBe(categoryB.id)
    expect(renamed.notes).toBe('updated notes')

    const result = exercisesServer.deleteExercise(created.id)
    expect(result.status).toBe('success')
    expect(exercisesServer.listExercises().some((e) => e.id === created.id)).toBe(false)
  })

  it('edge case: deleting an exercise with training-log history is blocked (KTD4)', () => {
    const db = ctx.dbModule.getWorkingDb()
    const referenced = db.prepare('SELECT DISTINCT exercise_id FROM training_log LIMIT 1').get() as
      { exercise_id: number } | undefined
    expect(referenced).toBeDefined()

    const result = exercisesServer.deleteExercise(referenced!.exercise_id)

    expect(result.status).toBe('blocked')
    if (result.status !== 'blocked') throw new Error('unreachable')
    expect(result.references.some((r) => r.label === 'training log entries')).toBe(true)
    expect(exercisesServer.listExercises().some((e) => e.id === referenced!.exercise_id)).toBe(true)
  })

  it('edge case: deleting an exercise referenced only via RepMaxGridFavourite.exercise_ids is blocked (KTD4)', () => {
    const db = ctx.dbModule.getWorkingDb()
    const categories = categoriesServer.listCategories()
    const isolated = exercisesServer.createExercise({ name: 'RepMax Only Ref', categoryId: categories[0].id })

    db.prepare(
      'INSERT INTO RepMaxGridFavourite (exercise_ids, rep_counts, is_default, sort_order) VALUES (?, ?, 0, 0)',
    ).run(String(isolated.id), '1')

    const result = exercisesServer.deleteExercise(isolated.id)

    expect(result.status).toBe('blocked')
    if (result.status !== 'blocked') throw new Error('unreachable')
    expect(result.references.some((r) => r.label === 'rep max grid favourites')).toBe(true)
  })

  it('edge case: rejects an empty exercise name', () => {
    const categories = categoriesServer.listCategories()
    expect(() => exercisesServer.createExercise({ name: '  ', categoryId: categories[0].id })).toThrow()
  })

  it('integration: recategorizing an exercise is reflected in category-filtered listing', () => {
    const categories = categoriesServer.listCategories()
    const [categoryA, categoryB] = categories
    const created = exercisesServer.createExercise({ name: 'Filter Test', categoryId: categoryA.id })

    expect(exercisesServer.listExercises({ categoryId: categoryA.id }).some((e) => e.id === created.id)).toBe(true)

    exercisesServer.updateExercise({ id: created.id, name: created.name, categoryId: categoryB.id })

    expect(exercisesServer.listExercises({ categoryId: categoryA.id }).some((e) => e.id === created.id)).toBe(false)
    expect(exercisesServer.listExercises({ categoryId: categoryB.id }).some((e) => e.id === created.id)).toBe(true)
  })

  it('happy path: listExerciseLogStats aggregates count and last logged date per exercise', () => {
    const db = ctx.dbModule.getWorkingDb()
    const referenced = db.prepare('SELECT DISTINCT exercise_id FROM training_log LIMIT 1').get() as
      { exercise_id: number } | undefined
    expect(referenced).toBeDefined()

    const expected = db
      .prepare('SELECT COUNT(*) AS c, MAX(date) AS d FROM training_log WHERE exercise_id = ?')
      .get(referenced!.exercise_id) as { c: number; d: string }

    const stats = exercisesServer.listExerciseLogStats().find((s) => s.exerciseId === referenced!.exercise_id)
    expect(stats).toBeDefined()
    expect(stats!.loggedCount).toBe(expected.c)
    expect(stats!.lastLoggedDate).toBe(expected.d)
  })

  it('edge case: an exercise with no training-log entries has no stats row', () => {
    const categories = categoriesServer.listCategories()
    const created = exercisesServer.createExercise({ name: 'Never Logged', categoryId: categories[0].id })

    const stats = exercisesServer.listExerciseLogStats().find((s) => s.exerciseId === created.id)
    expect(stats).toBeUndefined()
  })

  it('integration: importing then editing leaves the original-import baseline byte-identical (KTD9)', async () => {
    const fs = await import('node:fs')
    const before = fs.readFileSync(ctx.dbModule.ORIGINAL_IMPORT_DB_PATH)

    const categories = categoriesServer.listCategories()
    const created = exercisesServer.createExercise({ name: 'Baseline Check', categoryId: categories[0].id })
    exercisesServer.updateExercise({ id: created.id, name: 'Baseline Check Renamed', categoryId: categories[0].id })
    exercisesServer.deleteExercise(created.id)

    const after = fs.readFileSync(ctx.dbModule.ORIGINAL_IMPORT_DB_PATH)
    expect(after.equals(before)).toBe(true)
  })
})
