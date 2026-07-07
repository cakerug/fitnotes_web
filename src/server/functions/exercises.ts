import { createServerFn } from '@tanstack/react-start'
import {
  countUnusedExercises,
  createExercise,
  deleteExercise,
  getExercise,
  listExerciseLogStats,
  listExercises,
  listUnusedExercises,
  moveUnusedExercisesToCategory,
  updateExercise,
} from './exercises.server'
import type { ExerciseInput } from './exercises.server'

export const listExercisesFn = createServerFn({ method: 'GET' })
  .validator((data: { search?: string; categoryId?: number } | undefined) => data)
  .handler(async ({ data }) => listExercises(data))

export const listExerciseLogStatsFn = createServerFn({ method: 'GET' }).handler(async () => listExerciseLogStats())

export const getExerciseFn = createServerFn({ method: 'GET' })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => getExercise(data.id))

export const createExerciseFn = createServerFn({ method: 'POST' })
  .validator((data: ExerciseInput) => data)
  .handler(async ({ data }) => createExercise(data))

export const updateExerciseFn = createServerFn({ method: 'POST' })
  .validator((data: ExerciseInput & { id: number }) => data)
  .handler(async ({ data }) => updateExercise(data))

export const deleteExerciseFn = createServerFn({ method: 'POST' })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => deleteExercise(data.id))

export const countUnusedExercisesFn = createServerFn({ method: 'GET' }).handler(async () => countUnusedExercises())

export const listUnusedExercisesFn = createServerFn({ method: 'GET' }).handler(async () => listUnusedExercises())

export const moveUnusedExercisesToCategoryFn = createServerFn({ method: 'POST' }).handler(async () =>
  moveUnusedExercisesToCategory(),
)
