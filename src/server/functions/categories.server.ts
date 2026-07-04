import { CATEGORY_REFERENCE_QUERIES, findReferences, getWorkingDb, type ReferenceCheck } from '../db.server'

export type CategoryDTO = {
  id: number
  name: string
  colour: number
  sortOrder: number
}

export type DeleteResult =
  | { status: 'success' }
  | { status: 'blocked'; references: Array<ReferenceCheck> }

type CategoryRow = { _id: number; name: string; colour: number; sort_order: number }

function toDTO(row: CategoryRow): CategoryDTO {
  return { id: row._id, name: row.name, colour: row.colour, sortOrder: row.sort_order }
}

export function listCategories(): Array<CategoryDTO> {
  const db = getWorkingDb()
  const rows = db.prepare('SELECT * FROM Category ORDER BY sort_order ASC, name ASC').all() as Array<CategoryRow>
  return rows.map(toDTO)
}

export function createCategory(input: { name: string; colour: number }): CategoryDTO {
  const db = getWorkingDb()
  const name = input.name.trim()
  if (!name) throw new Error('Category name is required.')

  const create = db.transaction(() => {
    const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM Category').get() as { m: number }
    const result = db
      .prepare('INSERT INTO Category (name, colour, sort_order) VALUES (?, ?, ?)')
      .run(name, input.colour, maxSort.m + 1)
    return db.prepare('SELECT * FROM Category WHERE _id = ?').get(result.lastInsertRowid) as CategoryRow
  })

  return toDTO(create())
}

export function updateCategory(input: { id: number; name: string; colour: number }): CategoryDTO {
  const db = getWorkingDb()
  const name = input.name.trim()
  if (!name) throw new Error('Category name is required.')

  db.prepare('UPDATE Category SET name = ?, colour = ? WHERE _id = ?').run(name, input.colour, input.id)
  return toDTO(db.prepare('SELECT * FROM Category WHERE _id = ?').get(input.id) as CategoryRow)
}

/** KTD4 + KTD8: check-then-delete runs as one transaction so it's atomic. */
export function deleteCategory(id: number): DeleteResult {
  const db = getWorkingDb()
  const doDelete = db.transaction((categoryId: number): DeleteResult => {
    const references = findReferences(db, CATEGORY_REFERENCE_QUERIES, categoryId)
    if (references.length > 0) {
      return { status: 'blocked', references }
    }
    db.prepare('DELETE FROM Category WHERE _id = ?').run(categoryId)
    return { status: 'success' }
  })
  return doDelete(id)
}

/** KTD6: persists a new manual order via sort_order, in one transaction. */
export function reorderCategories(orderedIds: Array<number>): void {
  const db = getWorkingDb()
  const reorder = db.transaction((ids: Array<number>) => {
    const stmt = db.prepare('UPDATE Category SET sort_order = ? WHERE _id = ?')
    ids.forEach((id, index) => stmt.run(index, id))
  })
  reorder(orderedIds)
}
