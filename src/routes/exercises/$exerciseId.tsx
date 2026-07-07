import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { createExerciseFn, getExerciseFn, updateExerciseFn } from '../../server/functions/exercises'
import { listCategoriesFn } from '../../server/functions/categories'
import {
  DEFAULT_EXERCISE_TYPE_ID,
  EXERCISE_TYPES,
  describeTrackedFields,
  getExerciseTypeLabel,
} from '../../lib/exerciseTypes'

export const Route = createFileRoute('/exercises/$exerciseId')({
  loader: async ({ params }) => {
    const categories = await listCategoriesFn()
    if (params.exerciseId === 'new') {
      return { exercise: null, categories }
    }
    const exercise = await getExerciseFn({ data: { id: Number(params.exerciseId) } })
    return { exercise, categories }
  },
  component: ExerciseEditPage,
})

function ExerciseEditPage() {
  const navigate = useNavigate()
  const { exercise, categories } = Route.useLoaderData()
  const createExercise = useServerFn(createExerciseFn)
  const updateExercise = useServerFn(updateExerciseFn)

  const [name, setName] = useState(exercise?.name ?? '')
  const [categoryId, setCategoryId] = useState(exercise?.categoryId ?? categories[0]?.id)
  const [notes, setNotes] = useState(exercise?.notes ?? '')
  const [weightIncrement, setWeightIncrement] = useState(exercise?.weightIncrement?.toString() ?? '')
  const [exerciseTypeId, setExerciseTypeId] = useState(exercise?.exerciseTypeId ?? DEFAULT_EXERCISE_TYPE_ID)
  const [error, setError] = useState<string | null>(null)

  // Imported exercises can carry a type id this app doesn't recognize (see exerciseTypes.ts);
  // add it as an extra option so the select shows the real current value instead of silently
  // jumping to a different one.
  const typeOptions = EXERCISE_TYPES.some((t) => t.id === exerciseTypeId)
    ? EXERCISE_TYPES
    : [...EXERCISE_TYPES, { id: exerciseTypeId, label: getExerciseTypeLabel(exerciseTypeId) }]

  async function handleSave() {
    setError(null)
    const input = {
      name,
      categoryId: categoryId,
      notes: notes || null,
      weightIncrement: weightIncrement ? Number(weightIncrement) : null,
      exerciseTypeId,
    }
    try {
      if (exercise) {
        await updateExercise({ data: { id: exercise.id, ...input } })
      } else {
        await createExercise({ data: input })
      }
      navigate({ to: '/exercises' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    }
  }

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">{exercise ? 'Edit exercise' : 'New exercise'}</h1>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Category</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(Number(e.target.value))}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Type</span>
          <select
            value={exerciseTypeId}
            onChange={(e) => setExerciseTypeId(Number(e.target.value))}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {typeOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-gray-500">Tracks: {describeTrackedFields(exerciseTypeId)}</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            rows={3}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Weight increment</span>
          <input
            type="number"
            step="any"
            value={weightIncrement}
            onChange={(e) => setWeightIncrement(e.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div>}

        <button
          type="button"
          onClick={handleSave}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          Save
        </button>
      </div>
    </div>
  )
}
