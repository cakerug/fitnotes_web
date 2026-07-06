import { createServerFn } from '@tanstack/react-start'
import { getExportDiffSummary } from './diff.server'

export const getExportDiffSummaryFn = createServerFn({ method: 'GET' }).handler(async () => getExportDiffSummary())
