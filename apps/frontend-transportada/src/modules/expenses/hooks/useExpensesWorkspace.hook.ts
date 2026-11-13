/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import type { SelectOption } from '@/components/ui/select'
import { useDriverOptions } from '@/modules/fleet/hooks/useDriverOptions.hook'
import { createFleetController, getFleetClient } from '@/modules/fleet/hooks/useFleet.hook'
import { FLEET_VEHICLE_OPTIONS_QUERY_KEY } from '@/modules/fleet/shared/fleet.constant'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import {
  EXPENSES_MANAGE_PERMISSION,
  EXPENSES_READ_PERMISSION,
  type ExpenseKind,
  type ExpenseOccurrenceFilters,
  type ExpenseOccurrenceListItem,
  type ExpenseOccurrenceStatus,
} from '../shared/expenses.types'
import {
  currentCompetence,
  summarizeOccurrences,
  todayCivilDate,
} from '../shared/expensesView.service'
import { useExpenseCategories, useExpenseOccurrences } from './useExpenses.hook'

const VEHICLE_OPTIONS_PAGE_SIZE = 100

export type ExpensesFilterState = Readonly<{
  categoryId: string
  competence: string
  driverId: string
  kind: '' | ExpenseKind
  status: '' | ExpenseOccurrenceStatus
}>

export type ExpensesDialog =
  | Readonly<{ kind: 'create' }>
  | Readonly<{ kind: 'settle'; occurrence: ExpenseOccurrenceListItem }>
  | Readonly<{ kind: 'trips'; occurrence: ExpenseOccurrenceListItem }>
  | null

function toApiFilters(filters: ExpensesFilterState): ExpenseOccurrenceFilters {
  return {
    competence: filters.competence,
    ...(filters.categoryId === '' ? {} : { categoryId: filters.categoryId }),
    ...(filters.driverId === '' ? {} : { driverId: filters.driverId }),
    ...(filters.kind === '' ? {} : { kind: filters.kind }),
    ...(filters.status === '' ? {} : { status: filters.status }),
  }
}

/** Spec 325 T2.2: estado da tela `/contas`; quem não tem `expenses.read` nem dispara consulta. */
export function useExpensesWorkspace() {
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const canRead = permissions.includes(EXPENSES_READ_PERMISSION)
  const canManage = permissions.includes(EXPENSES_MANAGE_PERMISSION)
  const [filters, setFilters] = useState<ExpensesFilterState>({
    categoryId: '',
    competence: currentCompetence(),
    driverId: '',
    kind: '',
    status: '',
  })
  const [dialog, setDialog] = useState<ExpensesDialog>(null)

  const occurrences = useExpenseOccurrences({ enabled: canRead, filters: toApiFilters(filters) })
  const categories = useExpenseCategories({ enabled: canRead })
  const driverOptions = useDriverOptions({ enabled: canRead, permissions })
  const fleetController = createFleetController({ client: getFleetClient(), permissions })
  const vehiclesQuery = useQuery({
    enabled: canRead && fleetController.canReadFleet,
    queryFn: () => fleetController.listVehicles({ cursor: null, limit: VEHICLE_OPTIONS_PAGE_SIZE }),
    queryKey: [FLEET_VEHICLE_OPTIONS_QUERY_KEY, 'expenses'],
  })
  const vehicleOptions: readonly SelectOption[] = (vehiclesQuery.data?.items ?? []).map(
    (vehicle) => ({ label: vehicle.plate, value: vehicle.id }),
  )

  const today = todayCivilDate()
  const page = occurrences.data
  const summary =
    page === undefined
      ? undefined
      : summarizeOccurrences({ items: page.items, today, totals: page.totals })

  return {
    canManage,
    canRead,
    categories: categories.data ?? [],
    closeDialog: () => setDialog(null),
    dialog,
    driverOptions,
    filters,
    isAuthLoading: authQuery.isPending,
    isLoading: occurrences.isPending && canRead,
    loadError: occurrences.error,
    openDialog: setDialog,
    page,
    setFilter: <TKey extends keyof ExpensesFilterState>(
      key: TKey,
      value: ExpensesFilterState[TKey],
    ) => setFilters((current) => ({ ...current, [key]: value })),
    summary,
    today,
    vehicleOptions,
  }
}
