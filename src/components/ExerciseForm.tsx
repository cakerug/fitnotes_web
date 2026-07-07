import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { createExerciseFn, updateExerciseFn } from '../server/functions/exercises'
import type { CategoryDTO } from '../server/functions/categories.server'
import type { ExerciseDTO } from '../server/functions/exercises.server'

export function ExerciseForm({
  exercise,
  categories,
  defaultCategoryId,
  onSaved,
  onCancel,
}: {
  exercise?: ExerciseDTO | null
  categories: Array<CategoryDTO>
  defaultCategoryId?: number
  onSaved: () => void | Promise<void>
  onCancel: () => void
}) {
  const createExercise = useServerFn(createExerciseFn)
  const updateExercise = useServerFn(updateExerciseFn)

  const [name, setName] = useState(exercise?.name ?? '')
  const [categoryId, setCategoryId] = useState<number | undefined>(exercise?.categoryId ?? defaultCategoryId)
  const [notes, setNotes] = useState(exercise?.notes ?? '')
  const [weightIncrement, setWeightIncrement] = useState(exercise?.weightIncrement?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    if (!categoryId) {
      setError('Category is required.')
      return
    }
    const input = {
      name,
      categoryId,
      notes: notes || null,
      weightIncrement: weightIncrement ? Number(weightIncrement) : null,
    }
    try {
      if (exercise) {
        await updateExercise({ data: { id: exercise.id, ...input } })
      } else {
        await createExercise({ data: input })
      }
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    }
  }

  return (
    <div className="space-y-4">
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
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Select a category…
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!categoryId}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className="rounded bg-gray-200 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  )
}
