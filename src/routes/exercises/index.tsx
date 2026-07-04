import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { deleteExerciseFn, listExercisesFn } from '../../server/functions/exercises'
import { listCategoriesFn } from '../../server/functions/categories'

export const Route = createFileRoute('/exercises/')({
  loader: async () => {
    const [exercises, categories] = await Promise.all([listExercisesFn({ data: undefined }), listCategoriesFn()])
    return { exercises, categories }
  },
  component: ExerciseListPage,
})

function ExerciseListPage() {
  const router = useRouter()
  const { exercises, categories } = Route.useLoaderData()
  const deleteExercise = useServerFn(deleteExerciseFn)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all')
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))

  const filtered = exercises.filter((exercise) => {
    const matchesSearch = exercise.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || exercise.categoryId === categoryFilter
    return matchesSearch && matchesCategory
  })

  async function handleDelete(id: number, name: string) {
    setBlockedMessage(null)
    const result = await deleteExercise({ data: { id } })
    if (result.status === 'blocked') {
      const refs = result.references.map((r) => `${r.count} ${r.label}`).join(', ')
      setBlockedMessage(`Can't delete "${name}" — still referenced by: ${refs}.`)
      return
    }
    await router.invalidate()
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Exercises</h1>
        <Link to="/exercises/$exerciseId" params={{ exerciseId: 'new' }} className="text-sm text-blue-600">
          + Add exercise
        </Link>
      </div>

      <div className="mt-6 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {blockedMessage && (
        <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {blockedMessage}
        </div>
      )}

      <ul className="mt-6 divide-y divide-gray-200 rounded border border-gray-200">
        {filtered.map((exercise) => (
          <li key={exercise.id} className="flex items-center justify-between p-3">
            <div>
              <Link
                to="/exercises/$exerciseId"
                params={{ exerciseId: String(exercise.id) }}
                className="text-sm font-medium text-blue-700"
              >
                {exercise.name}
              </Link>
              <div className="text-xs text-gray-500">
                {categoryNameById.get(exercise.categoryId) ?? 'Uncategorized'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDelete(exercise.id, exercise.name)}
              className="text-sm text-red-600"
            >
              Delete
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="p-3 text-sm text-gray-500">No exercises match.</li>}
      </ul>
    </div>
  )
}
