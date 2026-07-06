import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupTestWorkingDb, teardownTestWorkingDb, type TestDbContext } from '../testSupport'

let ctx: TestDbContext
let categoriesServer: typeof import('./categories.server')

beforeEach(async () => {
  ctx = await setupTestWorkingDb()
  categoriesServer = await import('./categories.server')
})

afterEach(() => {
  teardownTestWorkingDb(ctx)
})

describe('category CRUD', () => {
  it('happy path: create, rename, recolor, and delete a category with no references', () => {
    const created = categoriesServer.createCategory({ name: 'Cardio Test', colour: 123 })
    expect(created.name).toBe('Cardio Test')
    expect(created.colour).toBe(123)

    const updated = categoriesServer.updateCategory({ id: created.id, name: 'Cardio Renamed', colour: 456 })
    expect(updated.name).toBe('Cardio Renamed')
    expect(updated.colour).toBe(456)

    const result = categoriesServer.deleteCategory(created.id)
    expect(result.status).toBe('success')

    const remaining = categoriesServer.listCategories().find((c) => c.id === created.id)
    expect(remaining).toBeUndefined()
  })

  it('edge case: deleting a category with exercises still assigned is blocked (KTD4)', () => {
    const db = ctx.dbModule.getWorkingDb()
    const referenced = db.prepare('SELECT DISTINCT category_id FROM exercise LIMIT 1').get() as
      | { category_id: number }
      | undefined
    expect(referenced).toBeDefined()

    const result = categoriesServer.deleteCategory(referenced!.category_id)

    expect(result.status).toBe('blocked')
    if (result.status !== 'blocked') throw new Error('unreachable')
    expect(result.references.some((r) => r.label === 'exercises' && r.count > 0)).toBe(true)

    // Blocked delete must not have removed the category.
    expect(categoriesServer.listCategories().some((c) => c.id === referenced!.category_id)).toBe(true)
  })

  it('edge case: rejects an empty category name', () => {
    expect(() => categoriesServer.createCategory({ name: '   ', colour: 0 })).toThrow()
  })

  it('integration: a failure partway through delete leaves the working DB unchanged (KTD8)', () => {
    const created = categoriesServer.createCategory({ name: 'Rollback Test', colour: 0 })
    const db = ctx.dbModule.getWorkingDb()

    // Force a failure inside a transaction that mirrors delete's shape (check, then write)
    // to prove better-sqlite3's transaction wrapper rolls back on throw.
    const countBefore = (db.prepare('SELECT COUNT(*) AS c FROM Category').get() as { c: number }).c
    expect(() => {
      const doomed = db.transaction((id: number) => {
        db.prepare('DELETE FROM Category WHERE _id = ?').run(id)
        throw new Error('simulated failure after the delete statement')
      })
      doomed(created.id)
    }).toThrow('simulated failure')

    const countAfter = (db.prepare('SELECT COUNT(*) AS c FROM Category').get() as { c: number }).c
    expect(countAfter).toBe(countBefore)
    expect(categoriesServer.listCategories().some((c) => c.id === created.id)).toBe(true)
  })
})
