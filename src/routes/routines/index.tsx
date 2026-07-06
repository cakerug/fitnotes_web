import { useState } from 'react'
import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { createRoutineFn, deleteRoutineFn, listRoutinesFn } from '../../server/functions/routines'
import { hasWorkingDbFn } from '../../server/functions/dashboard'

export const Route = createFileRoute('/routines/')({
  loader: async () => {
    if (!(await hasWorkingDbFn())) {
      throw redirect({ to: '/' })
    }
    return listRoutinesFn()
  },
  component: RoutinesListPage,
})

function RoutinesListPage() {
  const router = useRouter()
  const routines = Route.useLoaderData()
  const createRoutine = useServerFn(createRoutineFn)
  const deleteRoutine = useServerFn(deleteRoutineFn)
  const [newName, setNewName] = useState('')

  async function handleCreate() {
    if (!newName.trim()) return
    await createRoutine({ data: { name: newName.trim() } })
    setNewName('')
    await router.invalidate()
  }

  async function handleDelete(id: number) {
    await deleteRoutine({ data: { id } })
    await router.invalidate()
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Routines</h1>

      <div className="mt-6 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New routine name"
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

      <ul className="mt-6 divide-y divide-gray-200 rounded border border-gray-200">
        {routines.map((routine) => (
          <li key={routine.id} className="flex items-center justify-between p-3">
            <Link
              to="/routines/$routineId"
              params={{ routineId: String(routine.id) }}
              className="text-sm font-medium text-blue-700"
            >
              {routine.name}
            </Link>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                {routine.sectionCount} section{routine.sectionCount === 1 ? '' : 's'}
              </span>
              <button type="button" onClick={() => handleDelete(routine.id)} className="text-sm text-red-600">
                Delete
              </button>
            </div>
          </li>
        ))}
        {routines.length === 0 && <li className="p-3 text-sm text-gray-500">No routines yet.</li>}
      </ul>
    </div>
  )
}
