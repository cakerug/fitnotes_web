import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import {
  addExerciseToSectionFn,
  addSectionFn,
  addSetFn,
  deleteSectionFn,
  getRoutineFn,
  removeExerciseFromSectionFn,
  removeSetFn,
  renameSectionFn,
  reorderSectionExercisesFn,
  reorderSectionsFn,
  reorderSetsFn,
  updateRoutineFn,
} from '../../server/functions/routines'
import { listExercisesFn } from '../../server/functions/exercises'
import { Modal } from '../../components/Modal'
import type { RoutineDTO, SectionDTO, SectionExerciseDTO } from '../../server/functions/routines.server'
import type { ExerciseDTO } from '../../server/functions/exercises.server'

export const Route = createFileRoute('/routines/$routineId')({
  loader: async ({ params }) => {
    const [routine, exercises] = await Promise.all([
      getRoutineFn({ data: { id: Number(params.routineId) } }),
      listExercisesFn({ data: undefined }),
    ])
    return { routine, exercises }
  },
  component: RoutineDetailPage,
})

function RoutineDetailPage() {
  const router = useRouter()
  const { routine, exercises } = Route.useLoaderData()

  async function refresh() {
    await router.invalidate()
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <Link to="/routines" className="text-sm text-blue-600">
        ← Back
      </Link>

      <div className="mt-4">
        <RoutineHeader routine={routine} onSaved={refresh} />
      </div>

      <div className="mt-8 space-y-6">
        {routine.sections.map((section, index) => (
          <SectionCard
            key={section.id}
            section={section}
            sectionIndex={index}
            sectionCount={routine.sections.length}
            allSections={routine.sections}
            exercises={exercises}
            onChange={refresh}
          />
        ))}
      </div>

      <AddSectionForm routineId={routine.id} onAdded={refresh} />
    </div>
  )
}

function RoutineHeader({ routine, onSaved }: { routine: RoutineDTO; onSaved: () => Promise<void> }) {
  const updateRoutine = useServerFn(updateRoutineFn)
  const [name, setName] = useState(routine.name)
  const [notes, setNotes] = useState(routine.notes ?? '')

  async function save() {
    await updateRoutine({ data: { id: routine.id, name, notes: notes || null } })
    await onSaved()
  }

  return (
    <div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        className="w-full border-b border-transparent text-2xl font-bold hover:border-gray-300 focus:border-blue-500 focus:outline-none"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={save}
        placeholder="Notes…"
        rows={2}
        className="mt-2 w-full rounded border border-gray-200 px-2 py-1 text-sm text-gray-600"
      />
    </div>
  )
}

function AddSectionForm({ routineId, onAdded }: { routineId: number; onAdded: () => Promise<void> }) {
  const addSection = useServerFn(addSectionFn)
  const [name, setName] = useState('')

  async function handleAdd() {
    if (!name.trim()) return
    await addSection({ data: { routineId, name: name.trim() } })
    setName('')
    await onAdded()
  }

  return (
    <div className="mt-6 flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New section name"
        className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={handleAdd}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white"
      >
        Add section
      </button>
    </div>
  )
}

function SectionCard({
  section,
  sectionIndex,
  sectionCount,
  allSections,
  exercises,
  onChange,
}: {
  section: SectionDTO
  sectionIndex: number
  sectionCount: number
  allSections: Array<SectionDTO>
  exercises: Array<ExerciseDTO>
  onChange: () => Promise<void>
}) {
  const renameSection = useServerFn(renameSectionFn)
  const deleteSection = useServerFn(deleteSectionFn)
  const reorderSections = useServerFn(reorderSectionsFn)
  const addExerciseToSection = useServerFn(addExerciseToSectionFn)

  const [name, setName] = useState(section.name)
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  async function handleRename() {
    if (!name.trim() || name === section.name) return
    await renameSection({ data: { id: section.id, name: name.trim() } })
    await onChange()
  }

  async function handleDelete() {
    setBlockedMessage(null)
    const result = await deleteSection({ data: { id: section.id } })
    if (result.status === 'blocked') {
      const refs = result.references.map((r) => `${r.count} ${r.label}`).join(', ')
      setBlockedMessage(`Can't delete "${section.name}" — still referenced by: ${refs}.`)
      return
    }
    await onChange()
  }

  async function handleMoveSection(direction: -1 | 1) {
    const target = sectionIndex + direction
    if (target < 0 || target >= sectionCount) return
    const reordered = [...allSections]
    const [moved] = reordered.splice(sectionIndex, 1)
    reordered.splice(target, 0, moved)
    await reorderSections({ data: { orderedIds: reordered.map((s) => s.id) } })
    await onChange()
  }

  async function handleAddExercise(exerciseId: number) {
    await addExerciseToSection({ data: { sectionId: section.id, exerciseId } })
    await onChange()
    setIsAddModalOpen(false)
  }

  return (
    <div className="rounded border border-gray-200 p-4">
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <button
            type="button"
            disabled={sectionIndex === 0}
            onClick={() => handleMoveSection(-1)}
            className="text-xs text-gray-500 disabled:opacity-30"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={sectionIndex === sectionCount - 1}
            onClick={() => handleMoveSection(1)}
            className="text-xs text-gray-500 disabled:opacity-30"
          >
            ▼
          </button>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleRename}
          className="flex-1 border-b border-transparent font-semibold hover:border-gray-300 focus:border-blue-500 focus:outline-none"
        />
        <button type="button" onClick={handleDelete} className="text-sm text-red-600">
          Delete section
        </button>
      </div>

      {blockedMessage && (
        <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900">{blockedMessage}</div>
      )}

      <div className="mt-4 space-y-3">
        {section.exercises.map((sectionExercise, index) => (
          <SectionExerciseRow
            key={sectionExercise.id}
            sectionExercise={sectionExercise}
            exerciseIndex={index}
            allExercises={section.exercises}
            onChange={onChange}
          />
        ))}
      </div>

      <div className="mt-4">
        <button type="button" onClick={() => setIsAddModalOpen(true)} className="text-sm text-blue-600">
          + Add exercise
        </button>
      </div>

      <AddExerciseModal
        open={isAddModalOpen}
        sectionName={section.name}
        exercises={exercises}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddExercise}
      />
    </div>
  )
}

function AddExerciseModal({
  open,
  sectionName,
  exercises,
  onClose,
  onAdd,
}: {
  open: boolean
  sectionName: string
  exercises: Array<ExerciseDTO>
  onClose: () => void
  onAdd: (exerciseId: number) => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [pickedExerciseId, setPickedExerciseId] = useState<number | ''>('')

  const filteredExercises = exercises.filter((e) => e.name.toLowerCase().includes(search.trim().toLowerCase()))
  const selectedId = pickedExerciseId === '' ? filteredExercises.at(0)?.id : pickedExerciseId

  function handleClose() {
    setSearch('')
    setPickedExerciseId('')
    onClose()
  }

  async function handleConfirm() {
    if (selectedId === undefined) return
    await onAdd(selectedId)
    setSearch('')
    setPickedExerciseId('')
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Add exercise to ${sectionName}`}>
      <div className="flex w-64 flex-col gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <select
          value={selectedId ?? ''}
          onChange={(e) => setPickedExerciseId(Number(e.target.value))}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {filteredExercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={handleClose} className="rounded px-3 py-1 text-sm text-gray-600">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={filteredExercises.length === 0}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </Modal>
  )
}

function SectionExerciseRow({
  sectionExercise,
  exerciseIndex,
  allExercises,
  onChange,
}: {
  sectionExercise: SectionExerciseDTO
  exerciseIndex: number
  allExercises: Array<SectionExerciseDTO>
  onChange: () => Promise<void>
}) {
  const removeExerciseFromSection = useServerFn(removeExerciseFromSectionFn)
  const reorderSectionExercises = useServerFn(reorderSectionExercisesFn)
  const addSet = useServerFn(addSetFn)
  const removeSet = useServerFn(removeSetFn)
  const reorderSets = useServerFn(reorderSetsFn)

  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')

  async function handleMove(direction: -1 | 1) {
    const target = exerciseIndex + direction
    if (target < 0 || target >= allExercises.length) return
    const reordered = [...allExercises]
    const [moved] = reordered.splice(exerciseIndex, 1)
    reordered.splice(target, 0, moved)
    await reorderSectionExercises({ data: { orderedIds: reordered.map((e) => e.id) } })
    await onChange()
  }

  async function handleAddSet() {
    if (!weight || !reps) return
    await addSet({ data: { sectionExerciseId: sectionExercise.id, metricWeight: Number(weight), reps: Number(reps) } })
    setWeight('')
    setReps('')
    await onChange()
  }

  async function handleRemoveSet(setId: number) {
    await removeSet({ data: { id: setId } })
    await onChange()
  }

  async function handleReorderSets(setIndex: number, direction: -1 | 1) {
    const target = setIndex + direction
    if (target < 0 || target >= sectionExercise.sets.length) return
    const reordered = [...sectionExercise.sets]
    const [moved] = reordered.splice(setIndex, 1)
    reordered.splice(target, 0, moved)
    await reorderSets({ data: { orderedIds: reordered.map((s) => s.id) } })
    await onChange()
  }

  return (
    <div className="rounded border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <button
            type="button"
            disabled={exerciseIndex === 0}
            onClick={() => handleMove(-1)}
            className="text-xs text-gray-500 disabled:opacity-30"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={exerciseIndex === allExercises.length - 1}
            onClick={() => handleMove(1)}
            className="text-xs text-gray-500 disabled:opacity-30"
          >
            ▼
          </button>
        </div>
        <span className="flex-1 text-sm font-medium">{sectionExercise.exerciseName}</span>
        <button
          type="button"
          onClick={async () => {
            await removeExerciseFromSection({ data: { id: sectionExercise.id } })
            await onChange()
          }}
          className="text-sm text-red-600"
        >
          Remove
        </button>
      </div>

      <ul className="mt-2 space-y-1">
        {sectionExercise.sets.map((set, setIndex) => (
          <li key={set.id} className="flex items-center gap-2 text-sm">
            <button
              type="button"
              disabled={setIndex === 0}
              onClick={() => handleReorderSets(setIndex, -1)}
              className="text-xs text-gray-400 disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              disabled={setIndex === sectionExercise.sets.length - 1}
              onClick={() => handleReorderSets(setIndex, 1)}
              className="text-xs text-gray-400 disabled:opacity-30"
            >
              ▼
            </button>
            <span>
              {set.metricWeight} kg × {set.reps} reps
            </span>
            <button type="button" onClick={() => handleRemoveSet(set.id)} className="text-xs text-red-600">
              remove
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center gap-2">
        <input
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="Weight"
          type="number"
          className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <input
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder="Reps"
          type="number"
          className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <button type="button" onClick={handleAddSet} className="rounded bg-gray-200 px-3 py-1 text-sm">
          + Add set
        </button>
      </div>
    </div>
  )
}
