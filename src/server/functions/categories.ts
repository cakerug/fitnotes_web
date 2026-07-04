import { createServerFn } from '@tanstack/react-start'
import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from './categories.server'

export const listCategoriesFn = createServerFn({ method: 'GET' }).handler(async () => listCategories())

export const createCategoryFn = createServerFn({ method: 'POST' })
  .validator((data: { name: string; colour: number }) => data)
  .handler(async ({ data }) => createCategory(data))

export const updateCategoryFn = createServerFn({ method: 'POST' })
  .validator((data: { id: number; name: string; colour: number }) => data)
  .handler(async ({ data }) => updateCategory(data))

export const deleteCategoryFn = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => deleteCategory(data.id))

export const reorderCategoriesFn = createServerFn({ method: 'POST' })
  .validator((data: { orderedIds: Array<number> }) => data)
  .handler(async ({ data }) => reorderCategories(data.orderedIds))
