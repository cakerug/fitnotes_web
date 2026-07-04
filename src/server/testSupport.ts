import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { vi } from 'vitest'

export const REAL_BACKUP_PATH = path.resolve(process.cwd(), 'FitNotes_Backup_2024-05-29.fitnotes')

export type TestDbContext = {
  testDataDir: string
  dbModule: typeof import('./db.server')
}

/**
 * Seeds a throwaway working DB (copied from the real sample backup) in a temp
 * directory, and resets vitest's module registry so `db.server.ts`'s
 * `DATA_DIR` constant re-evaluates against the new `FITNOTES_DATA_DIR`.
 * Mirrors what U2's import flow establishes, without going through HTTP.
 */
export async function setupTestWorkingDb(): Promise<TestDbContext> {
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitnotes-test-'))
  process.env.FITNOTES_DATA_DIR = testDataDir
  vi.resetModules()
  const dbModule = await import('./db.server')
  fs.copyFileSync(REAL_BACKUP_PATH, dbModule.WORKING_DB_PATH)
  fs.copyFileSync(REAL_BACKUP_PATH, dbModule.ORIGINAL_IMPORT_DB_PATH)
  // Match U2's import behavior: open once so WAL mode is set immediately.
  dbModule.getWorkingDb()
  return { testDataDir, dbModule }
}

export function teardownTestWorkingDb(ctx: TestDbContext): void {
  ctx.dbModule.closeWorkingDb()
  fs.rmSync(ctx.testDataDir, { recursive: true, force: true })
  delete process.env.FITNOTES_DATA_DIR
}
