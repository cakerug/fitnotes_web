import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { getExerciseFn } from '../../server/functions/exercises'
import { listCategoriesFn } from '../../server/functions/categories'
import { ExerciseForm } from '../../components/ExerciseForm'

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

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">{exercise ? 'Edit exercise' : 'New exercise'}</h1>

      <div className="mt-6">
        <ExerciseForm
          exercise={exercise}
          categories={categories}
          onSaved={() => navigate({ to: '/exercises' })}
          onCancel={() => navigate({ to: '/exercises' })}
        />
      </div>
    </div>
  )
}
