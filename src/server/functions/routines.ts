import { createServerFn } from '@tanstack/react-start'
import * as routinesServer from './routines.server'

export const listRoutinesFn = createServerFn({ method: 'GET' }).handler(async () => routinesServer.listRoutines())

export const getRoutineFn = createServerFn({ method: 'GET' })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => routinesServer.getRoutine(data.id))

export const createRoutineFn = createServerFn({ method: 'POST' })
  .validator((data: { name: string; notes?: string | null }) => data)
  .handler(async ({ data }) => routinesServer.createRoutine(data))

export const updateRoutineFn = createServerFn({ method: 'POST' })
  .validator((data: { id: number; name: string; notes?: string | null }) => data)
  .handler(async ({ data }) => routinesServer.updateRoutine(data))

export const deleteRoutineFn = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => routinesServer.deleteRoutine(data.id))

export const addSectionFn = createServerFn({ method: 'POST' })
  .validator((data: { routineId: number; name: string }) => data)
  .handler(async ({ data }) => routinesServer.addSection(data))

export const renameSectionFn = createServerFn({ method: 'POST' })
  .validator((data: { id: number; name: string }) => data)
  .handler(async ({ data }) => routinesServer.renameSection(data))

export const deleteSectionFn = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => routinesServer.deleteSection(data.id))

export const createSupersetFn = createServerFn({ method: 'POST' })
  .validator((data: { sectionId: number; name?: string }) => data)
  .handler(async ({ data }) => routinesServer.createSuperset(data))

export const addExerciseToSupersetFn = createServerFn({ method: 'POST' })
  .validator((data: { sectionExerciseId: number; supersetId: number }) => data)
  .handler(async ({ data }) => routinesServer.addExerciseToSuperset(data))

export const removeExerciseFromSupersetFn = createServerFn({ method: 'POST' })
  .validator((data: { sectionExerciseId: number }) => data)
  .handler(async ({ data }) => routinesServer.removeExerciseFromSuperset(data.sectionExerciseId))

export const deleteSupersetFn = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => routinesServer.deleteSuperset(data.id))

export const reorderSectionsFn = createServerFn({ method: 'POST' })
  .validator((data: { orderedIds: Array<number> }) => data)
  .handler(async ({ data }) => routinesServer.reorderSections(data))

export const addExerciseToSectionFn = createServerFn({ method: 'POST' })
  .validator((data: { sectionId: number; exerciseId: number }) => data)
  .handler(async ({ data }) => routinesServer.addExerciseToSection(data))

export const removeExerciseFromSectionFn = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => routinesServer.removeExerciseFromSection(data.id))

export const reorderSectionExercisesFn = createServerFn({ method: 'POST' })
  .validator((data: { orderedIds: Array<number> }) => data)
  .handler(async ({ data }) => routinesServer.reorderSectionExercises(data))

export const addSetFn = createServerFn({ method: 'POST' })
  .validator((data: { sectionExerciseId: number } & routinesServer.SetInput) => data)
  .handler(async ({ data }) => routinesServer.addSet(data))

export const updateSetFn = createServerFn({ method: 'POST' })
  .validator((data: { id: number } & routinesServer.SetInput) => data)
  .handler(async ({ data }) => routinesServer.updateSet(data))

export const removeSetFn = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => routinesServer.removeSet(data.id))

export const reorderSetsFn = createServerFn({ method: 'POST' })
  .validator((data: { orderedIds: Array<number> }) => data)
  .handler(async ({ data }) => routinesServer.reorderSets(data))
