import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import {
  createCategoryFn,
  deleteCategoryFn,
  listCategoriesFn,
  reorderCategoriesFn,
  updateCategoryFn,
} from '../server/functions/categories'
import type { CategoryDTO } from '../server/functions/categories.server'

export const Route = createFileRoute('/categories')({
  loader: () => listCategoriesFn(),
  component: CategoriesPage,
})

function CategoriesPage() {
  const router = useRouter()
  const categories = Route.useLoaderData()

  const createCategory = useServerFn(createCategoryFn)
  const updateCategory = useServerFn(updateCategoryFn)
  const deleteCategory = useServerFn(deleteCategoryFn)
  const reorderCategories = useServerFn(reorderCategoriesFn)

  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)

  async function refresh() {
    await router.invalidate()
  }

  async function handleCreate() {
    if (!newName.trim()) return
    await createCategory({ data: { name: newName.trim(), colour: 0 } })
    setNewName('')
    await refresh()
  }

  async function handleRename(category: CategoryDTO) {
    if (!editingName.trim()) return
    await updateCategory({ data: { id: category.id, name: editingName.trim(), colour: category.colour } })
    setEditingId(null)
    await refresh()
  }

  async function handleDelete(category: CategoryDTO) {
    setBlockedMessage(null)
    const result = await deleteCategory({ data: { id: category.id } })
    if (result.status === 'blocked') {
      const refs = result.references.map((r) => `${r.count} ${r.label}`).join(', ')
      setBlockedMessage(`Can't delete "${category.name}" — still referenced by: ${refs}.`)
      return
    }
    await refresh()
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= categories.length) return
    const reordered = [...categories]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    await reorderCategories({ data: { orderedIds: reordered.map((c) => c.id) } })
    await refresh()
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Categories</h1>
      <p className="mt-2 text-gray-600">Groups exercises into sections, same as the FitNotes exercise list.</p>

      <div className="mt-6 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleCreate}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          Add
        </button>
      </div>

      {blockedMessage && (
        <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {blockedMessage}
        </div>
      )}

      <ul className="mt-6 divide-y divide-gray-200 rounded border border-gray-200">
        {categories.map((category, index) => (
          <li key={category.id} className="flex items-center gap-3 p-3">
            <div className="flex flex-col">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => handleMove(index, -1)}
                className="text-xs text-gray-500 disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                disabled={index === categories.length - 1}
                onClick={() => handleMove(index, 1)}
                className="text-xs text-gray-500 disabled:opacity-30"
              >
                ▼
              </button>
            </div>

            {editingId === category.id ? (
              <input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => handleRename(category)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename(category)}
                autoFocus
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
              />
            ) : (
              <button
                type="button"
                className="flex-1 text-left text-sm"
                onClick={() => {
                  setEditingId(category.id)
                  setEditingName(category.name)
                }}
              >
                {category.name}
              </button>
            )}

            <button type="button" onClick={() => handleDelete(category)} className="text-sm text-red-600">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
