import { useMemo, useState } from 'react'
import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { deleteExerciseFn, listExercisesFn } from '../../server/functions/exercises'
import { createCategoryFn, deleteCategoryFn, listCategoriesFn, updateCategoryFn } from '../../server/functions/categories'
import type { CategoryDTO } from '../../server/functions/categories.server'
import type { ExerciseDTO } from '../../server/functions/exercises.server'

type ExerciseSearch = { category?: number }

export const Route = createFileRoute('/exercises/')({
  validateSearch: (search: Record<string, unknown>): ExerciseSearch => ({
    category: search.category === undefined ? undefined : Number(search.category),
  }),
  loader: async () => {
    const [exercises, categories] = await Promise.all([listExercisesFn({ data: undefined }), listCategoriesFn()])
    return { exercises, categories }
  },
  component: ExerciseListPage,
})

function closeMenu(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.closest('details')?.removeAttribute('open')
}

function ExerciseListPage() {
  const router = useRouter()
  const navigate = useNavigate({ from: Route.fullPath })
  const { exercises, categories } = Route.useLoaderData()
  const { category: selectedCategoryId } = Route.useSearch()
  const deleteExercise = useServerFn(deleteExerciseFn)
  const createCategory = useServerFn(createCategoryFn)
  const updateCategory = useServerFn(updateCategoryFn)
  const deleteCategory = useServerFn(deleteCategoryFn)

  const [search, setSearch] = useState('')
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

  const exerciseCountByCategory = useMemo(() => {
    const counts = new Map<number, number>()
    for (const exercise of exercises) {
      counts.set(exercise.categoryId, (counts.get(exercise.categoryId) ?? 0) + 1)
    }
    return counts
  }, [exercises])

  const matchesSearch = (exercise: ExerciseDTO) => exercise.name.toLowerCase().includes(search.toLowerCase())

  const visibleCategories: Array<CategoryDTO> =
    selectedCategoryId === undefined ? categories : categories.filter((c) => c.id === selectedCategoryId)

  // A single selected category always renders (even with 0 exercises) so it stays manageable;
  // in the "all categories" overview, empty results are only hidden once a search narrows them out.
  const showEmptyGroups = selectedCategoryId !== undefined || search.trim() === ''
  const groups = visibleCategories
    .map((category) => ({
      category,
      exercises: exercises.filter((e) => e.categoryId === category.id && matchesSearch(e)),
    }))
    .filter((group) => group.exercises.length > 0 || showEmptyGroups)

  async function handleDeleteExercise(id: number, name: string) {
    setBlockedMessage(null)
    const result = await deleteExercise({ data: { id } })
    if (result.status === 'blocked') {
      const refs = result.references.map((r) => `${r.count} ${r.label}`).join(', ')
      setBlockedMessage(`Can't delete "${name}" — still referenced by: ${refs}.`)
      return
    }
    await router.invalidate()
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return
    await createCategory({ data: { name: newCategoryName.trim(), colour: 0 } })
    setNewCategoryName('')
    await router.invalidate()
  }

  function startEditingCategory(category: CategoryDTO) {
    setEditingCategoryId(category.id)
    setEditingCategoryName(category.name)
  }

  async function handleRenameCategory(category: CategoryDTO) {
    if (!editingCategoryName.trim()) return
    await updateCategory({ data: { id: category.id, name: editingCategoryName.trim(), colour: category.colour } })
    setEditingCategoryId(null)
    await router.invalidate()
  }

  async function handleDeleteCategory(category: CategoryDTO) {
    setBlockedMessage(null)
    const result = await deleteCategory({ data: { id: category.id } })
    if (result.status === 'blocked') {
      const refs = result.references.map((r) => `${r.count} ${r.label}`).join(', ')
      setBlockedMessage(`Can't delete "${category.name}" — still referenced by: ${refs}.`)
      return
    }
    if (selectedCategoryId === category.id) {
      await navigate({ search: {} })
    }
    await router.invalidate()
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Exercises</h1>
        <Link to="/exercises/$exerciseId" params={{ exerciseId: 'new' }} className="text-sm text-blue-600">
          + Add exercise
        </Link>
      </div>

      <div className="mt-6 flex gap-6">
        <div className="w-56 shrink-0">
          <ul className="divide-y divide-gray-200 rounded border border-gray-200">
            <li>
              <Link
                to="/exercises"
                search={{}}
                className={`flex items-center justify-between p-3 text-sm ${
                  selectedCategoryId === undefined ? 'bg-blue-50 font-medium text-blue-900' : 'text-gray-700'
                }`}
              >
                <span>All categories</span>
                <span className="text-xs text-gray-400">{exercises.length}</span>
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  to="/exercises"
                  search={{ category: category.id }}
                  className={`flex items-center justify-between p-3 text-sm ${
                    selectedCategoryId === category.id ? 'bg-blue-50 font-medium text-blue-900' : 'text-gray-700'
                  }`}
                >
                  <span>{category.name}</span>
                  <span className="text-xs text-gray-400">{exerciseCountByCategory.get(category.id) ?? 0}</span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex gap-2">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              placeholder="New category"
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <button type="button" onClick={handleAddCategory} className="rounded bg-gray-200 px-3 py-1 text-sm">
              Add
            </button>
          </div>
        </div>

        <div className="flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />

          {blockedMessage && (
            <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              {blockedMessage}
            </div>
          )}

          <div className="mt-3 space-y-4">
            {groups.map(({ category, exercises: categoryExercises }) => (
              <div key={category.id} className="rounded border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  {editingCategoryId === category.id ? (
                    <input
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      onBlur={() => handleRenameCategory(category)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRenameCategory(category)}
                      autoFocus
                      className="rounded border border-gray-300 px-2 py-1 text-sm font-semibold"
                    />
                  ) : (
                    <h2 className="text-sm font-semibold text-gray-900">{category.name}</h2>
                  )}

                  <details className="relative">
                    <summary className="cursor-pointer list-none rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100">
                      •••
                    </summary>
                    <div className="absolute right-0 z-10 mt-1 w-32 rounded border border-gray-200 bg-white shadow-md">
                      <button
                        type="button"
                        onClick={(e) => {
                          closeMenu(e)
                          startEditingCategory(category)
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          closeMenu(e)
                          handleDeleteCategory(category)
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-gray-50"
                      >
                        Delete
                      </button>
                    </div>
                  </details>
                </div>

                <ul className="mt-3 divide-y divide-gray-100 rounded border border-gray-100 bg-gray-50">
                  {categoryExercises.map((exercise) => (
                    <li key={exercise.id} className="flex items-center justify-between p-3">
                      <Link
                        to="/exercises/$exerciseId"
                        params={{ exerciseId: String(exercise.id) }}
                        className="text-sm font-medium text-blue-700"
                      >
                        {exercise.name}
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteExercise(exercise.id, exercise.name)}
                        className="text-sm text-red-600"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                  {categoryExercises.length === 0 && (
                    <li className="p-3 text-sm text-gray-500">
                      {search.trim() ? 'No exercises match.' : 'No exercises in this category yet.'}
                    </li>
                  )}
                </ul>
              </div>
            ))}
            {groups.length === 0 && (
              <div className="rounded border border-gray-200 p-3 text-sm text-gray-500">
                {categories.length === 0 ? 'No categories yet — add one to get started.' : 'No exercises match.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
