import { createServerFn } from '@tanstack/react-start'
import { importBackup, type ImportResult } from './import.server'

export const importBackupFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) {
      throw new Error('Expected FormData')
    }
    const file = data.get('file')
    if (!(file instanceof File)) {
      throw new Error('Missing "file" field')
    }
    return { file, confirmOverwrite: data.get('confirmOverwrite') === 'true' }
  })
  .handler(async ({ data }): Promise<ImportResult> => {
    const bytes = Buffer.from(await data.file.arrayBuffer())
    return importBackup(bytes, data.confirmOverwrite)
  })
