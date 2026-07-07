// FitNotes' `exercise.exercise_type_id` selects which metrics get recorded per
// logged set for that exercise. The app's own docs describe an exercise's
// "type" as "any combination of weight, reps, distance and time"
// (fitnotesapp.com/exercises) — picked from a fixed list, not computed as a
// bitmask (the ids below don't fit any consistent bit-weighting: solving for
// per-flag weights across the observed ids has no non-negative solution).
//
// No seed data or source ships with a FitNotes backup, so this list was
// derived empirically: for every exercise_type_id value present in a real
// backup, correlate it against which training_log columns (metric_weight,
// reps, distance, duration_seconds) are ever non-zero across that id's
// logged sets. Ids not listed here (2, 6, 8, 10+) never appeared in the
// sample backup, so their field combination is unknown — getExerciseTypeFields
// falls back to "show everything" for those rather than guessing.
export type ExerciseTypeFields = {
  hasWeight: boolean
  hasReps: boolean
  hasDistance: boolean
  hasTime: boolean
}

export type ExerciseTypeDef = ExerciseTypeFields & { id: number; label: string }

export const DEFAULT_EXERCISE_TYPE_ID = 0

export const EXERCISE_TYPES: Array<ExerciseTypeDef> = [
  // DB-confirmed — 95 exercises (Squat, Bench Press, Curl, ...), 746 sets:
  // metric_weight and reps non-zero in ~98% of sets, distance/duration always 0.
  { id: 0, label: 'Weight & Reps', hasWeight: true, hasReps: true, hasDistance: false, hasTime: false },
  // DB-confirmed — 8 cardio-machine exercises (Cycling, Rowing Machine, ...),
  // 79 sets: distance and duration_seconds populated in ~99%/100% of sets.
  { id: 1, label: 'Distance & Time', hasWeight: false, hasReps: false, hasDistance: true, hasTime: true },
  // DB-confirmed — 2 exercises (Plank, Side Plank), 17 sets: duration_seconds
  // always non-zero, weight/reps/distance always 0.
  { id: 3, label: 'Time', hasWeight: false, hasReps: false, hasDistance: false, hasTime: true },
  // DB-confirmed — 1 exercise (Seated Hip Flexor Hurdles), 5 sets: reps fixed
  // at 10 and distance non-zero (0.5-1) on every set, weight/duration always 0.
  { id: 4, label: 'Reps & Distance', hasWeight: false, hasReps: true, hasDistance: true, hasTime: false },
  // DB-confirmed — e.g. Hip Hold (reps=10, duration=30 on every one of 58
  // sets) and Bird Dog (reps=3, duration=10): reps and duration_seconds both
  // populated, weight/distance always 0.
  { id: 5, label: 'Reps & Time', hasWeight: false, hasReps: true, hasDistance: false, hasTime: true },
  // DB-confirmed — 35 bodyweight/band exercises (Push Ups, Pull Ups, ...),
  // 972 sets: reps always non-zero, weight/distance/duration always 0.
  { id: 7, label: 'Reps Only', hasWeight: false, hasReps: true, hasDistance: false, hasTime: false },
  // DB-confirmed but empirically indistinguishable from id 3 — 13 exercises
  // (Wall Sits, Downward Dog, Flexbar stretches, ...), 126 sets: duration_seconds
  // always non-zero, weight/reps/distance always 0, same as id 3. Whatever
  // actually distinguishes this from plain "Time" isn't visible in
  // training_log; kept as its own entry so an imported value of 9 round-trips
  // instead of silently collapsing into 3.
  { id: 9, label: 'Time (alt.)', hasWeight: false, hasReps: false, hasDistance: false, hasTime: true },
]

const BY_ID = new Map(EXERCISE_TYPES.map((t) => [t.id, t]))

export function getExerciseType(id: number): ExerciseTypeDef | undefined {
  return BY_ID.get(id)
}

/** Unrecognized ids (outside the sample backup) show every field rather than guessing which to hide. */
export function getExerciseTypeFields(id: number): ExerciseTypeFields {
  const type = BY_ID.get(id)
  if (!type) return { hasWeight: true, hasReps: true, hasDistance: true, hasTime: true }
  const { hasWeight, hasReps, hasDistance, hasTime } = type
  return { hasWeight, hasReps, hasDistance, hasTime }
}

export function getExerciseTypeLabel(id: number): string {
  return BY_ID.get(id)?.label ?? `Unrecognized type (${id})`
}

export function describeTrackedFields(id: number): string {
  const fields = getExerciseTypeFields(id)
  const parts: Array<string> = []
  if (fields.hasWeight) parts.push('Weight')
  if (fields.hasReps) parts.push('Reps')
  if (fields.hasDistance) parts.push('Distance')
  if (fields.hasTime) parts.push('Time')
  return parts.length > 0 ? parts.join(', ') : 'Nothing'
}
