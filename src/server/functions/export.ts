import fs from 'node:fs'
import { createServerFn } from '@tanstack/react-start'
import { cleanupExportFile, prepareExport } from './export.server'

export const exportBackupFn = createServerFn({ method: 'GET' }).handler(async (): Promise<Response> => {
  const result = prepareExport()

  if (result.status === 'error') {
    return new Response(JSON.stringify(result), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const bytes = fs.readFileSync(result.filePath)
  cleanupExportFile(result.filePath)

  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="FitNotes_Export.fitnotes"',
    },
  })
})
