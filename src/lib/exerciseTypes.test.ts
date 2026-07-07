import { describe, expect, it } from 'vitest'
import { describeTrackedFields, getExerciseTypeFields, getExerciseTypeLabel } from './exerciseTypes'

describe('exerciseTypes', () => {
  it('happy path: known ids resolve their DB-confirmed field combination', () => {
    expect(getExerciseTypeFields(0)).toEqual({ hasWeight: true, hasReps: true, hasDistance: false, hasTime: false })
    expect(getExerciseTypeFields(1)).toEqual({ hasWeight: false, hasReps: false, hasDistance: true, hasTime: true })
    expect(getExerciseTypeFields(7)).toEqual({ hasWeight: false, hasReps: true, hasDistance: false, hasTime: false })
  })

  it('edge case: an unrecognized id falls back to showing every field', () => {
    expect(getExerciseTypeFields(2)).toEqual({ hasWeight: true, hasReps: true, hasDistance: true, hasTime: true })
    expect(getExerciseTypeLabel(2)).toBe('Unrecognized type (2)')
  })

  it('happy path: describeTrackedFields summarizes active fields for a known type', () => {
    expect(describeTrackedFields(0)).toBe('Weight, Reps')
    expect(describeTrackedFields(3)).toBe('Time')
  })
})
