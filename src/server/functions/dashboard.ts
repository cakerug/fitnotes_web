import { createServerFn } from '@tanstack/react-start'
import { workingDbExists } from '../db.server'
import { getDashboardSummary } from './dashboard.server'

export const getDashboardSummaryFn = createServerFn({ method: 'GET' }).handler(async () => getDashboardSummary())

export const hasWorkingDbFn = createServerFn({ method: 'GET' }).handler(async () => workingDbExists())
