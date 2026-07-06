import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { importBackupFn } from '../server/functions/import'
import type { ImportResult } from '../server/functions/import.server'

export function ImportForm({ onImported }: { onImported?: () => void }) {
  const importBackup = useServerFn(importBackupFn)
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function runImport(confirmOverwrite: boolean) {
    if (!file) return
    setPending(true)
    setNeedsConfirmation(false)
    try {
      const formData = new FormData()
      formData.set('file', file)
      formData.set('confirmOverwrite', confirmOverwrite ? 'true' : 'false')
      const outcome = await importBackup({ data: formData })
      if (outcome.status === 'confirmation-required') {
        setNeedsConfirmation(true)
      } else {
        setResult(outcome)
        if (outcome.status === 'success') onImported?.()
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <div className="mt-6 flex items-center gap-3">
        <input
          type="file"
          accept=".fitnotes"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setResult(null)
            setNeedsConfirmation(false)
          }}
          className="block text-sm"
        />
        <button
          type="button"
          disabled={!file || pending}
          onClick={() => runImport(false)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Importing…' : 'Import'}
        </button>
      </div>

      {needsConfirmation && (
        <div className="mt-6 rounded border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            A working copy already exists. Re-importing replaces it and discards any edits made since your last export —
            this can&apos;t be undone.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => runImport(true)}
            className="mt-3 rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Replace working copy anyway
          </button>
        </div>
      )}

      {result?.status === 'error' && (
        <div className="mt-6 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">{result.message}</div>
      )}

      {result?.status === 'success' && (
        <div className="mt-6 rounded border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          Imported {result.counts.exercises} exercises, {result.counts.categories} categories, and{' '}
          {result.counts.routines} routines.
        </div>
      )}
    </div>
  )
}
