import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { exportBackupFn } from '../server/functions/export'
import { getExportDiffSummaryFn } from '../server/functions/diff'
import type { EntityDiff } from '../server/functions/diff.server'

export const Route = createFileRoute('/export')({
  loader: async () => getExportDiffSummaryFn(),
  component: ExportPage,
})

function ExportPage() {
  const exportBackup = useServerFn(exportBackupFn)
  const diffSummary = Route.useLoaderData()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setPending(true)
    setError(null)
    try {
      const response = await exportBackup()
      if (!(response instanceof Response)) {
        setError('Unexpected response from the export server function.')
        return
      }
      if (!response.ok) {
        const body = (await response.json()) as { message: string }
        setError(body.message)
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'FitNotes_Export.fitnotes'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Export FitNotes backup</h1>
      <p className="mt-2 text-gray-600">
        Downloads the current working database as a <code>.fitnotes</code> file, ready to restore
        back into the Android app. Before downloading, this runs an integrity check and confirms
        every untouched table still matches its row count from import.
      </p>

      {diffSummary.status === 'ready' && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold">Changes since import</h2>
          {diffSummary.hasChanges ? (
            <div className="mt-3 space-y-4 text-sm">
              <DiffSection title="Categories" diff={diffSummary.categories} />
              <DiffSection title="Exercises" diff={diffSummary.exercises} />
              <DiffSection title="Routines" diff={diffSummary.routines} />
              {(diffSummary.routineStructure.added > 0 ||
                diffSummary.routineStructure.modified > 0 ||
                diffSummary.routineStructure.removed > 0) && (
                <div>
                  <h3 className="font-medium text-gray-800">Routine structure (sections, exercises, sets)</h3>
                  <p className="mt-1 text-gray-600">
                    {diffSummary.routineStructure.added} added, {diffSummary.routineStructure.modified} modified,{' '}
                    {diffSummary.routineStructure.removed} removed
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600">No changes since import.</p>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={handleExport}
        className="mt-6 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Preparing export…' : 'Export backup'}
      </button>

      {error && (
        <div className="mt-6 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      )}
    </div>
  )
}

function DiffSection({ title, diff }: { title: string; diff: EntityDiff }) {
  if (diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0) return null

  return (
    <div>
      <h3 className="font-medium text-gray-800">{title}</h3>
      <ul className="mt-1 space-y-1 text-gray-600">
        {diff.added.length > 0 && <li>Added: {diff.added.join(', ')}</li>}
        {diff.modified.length > 0 && <li>Modified: {diff.modified.join(', ')}</li>}
        {diff.removed.length > 0 && <li>Removed: {diff.removed.join(', ')}</li>}
      </ul>
    </div>
  )
}
