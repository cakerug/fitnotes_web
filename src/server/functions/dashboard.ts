import { createServerFn } from '@tanstack/react-start'
import { getDashboardSummary } from './dashboard.server'

export const getDashboardSummaryFn = createServerFn({ method: 'GET' }).handler(async () => getDashboardSummary())
