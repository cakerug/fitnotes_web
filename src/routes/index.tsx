import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ImportForm } from '../components/ImportForm'
import { getDashboardSummaryFn } from '../server/functions/dashboard'

export const Route = createFileRoute('/')({
  loader: async () => getDashboardSummaryFn(),
  component: Home,
})

function Home() {
  const router = useRouter()
  const summary = Route.useLoaderData()

  if (summary.status === 'empty') {
    return (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold">FitNotes editor</h1>
        <p className="mt-2 text-gray-600">
          No working copy yet. Import a <code>.fitnotes</code> backup exported from the Android
          app to get started.
        </p>
        <ImportForm onImported={() => router.invalidate()} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">FitNotes editor</h1>
      <dl className="mt-6 divide-y divide-gray-200 rounded border border-gray-200 text-sm">
        <div className="flex justify-between p-3">
          <dt className="text-gray-500">Imported</dt>
          <dd>{new Date(summary.importedAt).toLocaleString()}</dd>
        </div>
        <div className="flex justify-between p-3">
          <dt className="text-gray-500">Latest logged workout</dt>
          <dd>
            {summary.latestWorkoutDate ? new Date(summary.latestWorkoutDate).toLocaleDateString() : 'No workouts logged yet'}
          </dd>
        </div>
        <div className="flex justify-between p-3">
          <dt className="text-gray-500">Exercises</dt>
          <dd>{summary.counts.exercises}</dd>
        </div>
        <div className="flex justify-between p-3">
          <dt className="text-gray-500">Categories</dt>
          <dd>{summary.counts.categories}</dd>
        </div>
        <div className="flex justify-between p-3">
          <dt className="text-gray-500">Routines</dt>
          <dd>{summary.counts.routines}</dd>
        </div>
      </dl>

      <details className="mt-6 text-sm">
        <summary className="cursor-pointer text-gray-500">Import a different backup</summary>
        <ImportForm onImported={() => router.invalidate()} />
      </details>
    </div>
  )
}
