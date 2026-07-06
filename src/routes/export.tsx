import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { exportBackupFn } from '../server/functions/export'
import { hasWorkingDbFn } from '../server/functions/dashboard'

export const Route = createFileRoute('/export')({
  loader: async () => {
    if (!(await hasWorkingDbFn())) {
      throw redirect({ to: '/' })
    }
  },
  component: ExportPage,
})

function ExportPage() {
  const exportBackup = useServerFn(exportBackupFn)
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
