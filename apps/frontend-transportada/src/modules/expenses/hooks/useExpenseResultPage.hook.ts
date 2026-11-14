/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQueries, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import type { SelectOption } from '@/components/ui/select'
import { useDriverOptions } from '@/modules/fleet/hooks/useDriverOptions.hook'
import { createFleetController, getFleetClient } from '@/modules/fleet/hooks/useFleet.hook'
import { FLEET_VEHICLE_OPTIONS_QUERY_KEY } from '@/modules/fleet/shared/fleet.constant'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { useContractorsQuery } from '@/modules/trip/queries/useContractors.query'

import { getExpensesClient } from '../shared/expensesClient.service'
import { EXPENSES_QUERY_KEY } from '../shared/expensesQueryKey.constant'
import { EXPENSES_READ_PERMISSION } from '../shared/expenses.types'
import {
  EXPENSE_NO_CUSTOMER_ID,
  EXPENSE_NO_VEHICLE_ID,
  type ExpenseResultFilters,
} from '../shared/expensesResult.types'
import {
  currentMonthPeriod,
  listTrendCompetences,
  monthPeriod,
  previousPeriod,
} from '../shared/expensesResultView.service'
import { useExpenseCategories } from './useExpenses.hook'
import { useExpenseResult, useExpenseUnitCosts } from './useExpenseResult.hook'

const VEHICLE_OPTIONS_PAGE_SIZE = 100

export type ExpenseResultFilterState = Readonly<{
  categoryId: string
  customerId: string
  from: string
  payeeDriverId: string
  to: string
  vehicleId: string
}>

export function toResultFilters(state: ExpenseResultFilterState): ExpenseResultFilters {
  return {
    ...(state.categoryId === '' ? {} : { categoryId: state.categoryId }),
    ...(state.customerId === '' ? {} : { customerId: state.customerId }),
    ...(state.payeeDriverId === '' ? {} : { payeeDriverId: state.payeeDriverId }),
    ...(state.vehicleId === '' ? {} : { vehicleId: state.vehicleId }),
  }
}

/**
 * Spec 325 T5.2/T5.2b: estado da página `/contas/resultado`. O período anterior (mesmo tamanho, com os mesmos filtros)
 * e os últimos meses são leituras do mesmo cálculo da API; sem `expenses.read` nada é consultado.
 */
export function useExpenseResultPage() {
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const canRead = permissions.includes(EXPENSES_READ_PERMISSION)
  const [filters, setFilters] = useState<ExpenseResultFilterState>(() => ({
    categoryId: '',
    customerId: '',
    payeeDriverId: '',
    vehicleId: '',
    ...currentMonthPeriod(),
  }))

  const query = { filters: toResultFilters(filters), from: filters.from, to: filters.to }
  const previous = previousPeriod(filters)
  const result = useExpenseResult({ enabled: canRead, query })
  const previousResult = useExpenseResult({
    enabled: canRead,
    query: { filters: query.filters, ...previous },
  })
  const unitCosts = useExpenseUnitCosts({ enabled: canRead, query })

  const trend = useQueries({
    queries: listTrendCompetences(filters.to).map((competence) => {
      const period = monthPeriod(competence)
      return {
        enabled: canRead,
        queryFn: () => getExpensesClient().getResult({ ...period, filters: query.filters }),
        queryKey: [EXPENSES_QUERY_KEY, 'result', { ...period, filters: query.filters }],
      }
    }),
  })
  const trendMonths = listTrendCompetences(filters.to).map((competence, index) => ({
    competence,
    result: trend[index]?.data,
  }))

  const categories = useExpenseCategories({ enabled: canRead })
  const driverOptions = useDriverOptions({ enabled: canRead, permissions })
  const contractors = useContractorsQuery({ enabled: canRead })
  const fleetController = createFleetController({ client: getFleetClient(), permissions })
  const vehiclesQuery = useQuery({
    enabled: canRead && fleetController.canReadFleet,
    queryFn: () => fleetController.listVehicles({ cursor: null, limit: VEHICLE_OPTIONS_PAGE_SIZE }),
    queryKey: [FLEET_VEHICLE_OPTIONS_QUERY_KEY, 'expenses'],
  })
  const vehicles: readonly SelectOption[] = (vehiclesQuery.data?.items ?? []).map((vehicle) => ({
    label: vehicle.plate,
    value: vehicle.id,
  }))
  const customers: readonly SelectOption[] = (contractors.data ?? []).map((contractor) => ({
    label: contractor.displayName === '' ? contractor.taxId : contractor.displayName,
    value: contractor.id,
  }))

  return {
    canRead,
    categories: categories.data ?? [],
    customers,
    driverOptions: driverOptions.drivers.map((driver) => ({
      label: driver.name,
      value: driver.id,
    })),
    error: result.error,
    filters,
    isAuthLoading: authQuery.isPending,
    isLoading: result.isPending && canRead,
    labelOf: {
      customer: (id: string) => customers.find((option) => option.value === id)?.label ?? id,
      vehicle: (id: string) => vehicles.find((option) => option.value === id)?.label ?? id,
    },
    previous: previousResult.data,
    query,
    result: result.data,
    setFilter: <TKey extends keyof ExpenseResultFilterState>(
      key: TKey,
      value: ExpenseResultFilterState[TKey],
    ) => setFilters((current) => ({ ...current, [key]: value })),
    setPeriod: (from: string, to: string) => setFilters((current) => ({ ...current, from, to })),
    trendMonths,
    unitCosts: unitCosts.data,
    vehicles,
  }
}

export { EXPENSE_NO_CUSTOMER_ID, EXPENSE_NO_VEHICLE_ID }
