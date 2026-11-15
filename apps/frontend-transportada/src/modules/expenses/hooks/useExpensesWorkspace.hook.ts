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
  causedByKeys,
  currentCompetence,
  summarizeOccurrences,
  todayCivilDate,
} from '../shared/expensesView.service'
import {
  EMPTY_LIST_SEARCH,
  filterListItems,
  selectableItems,
  summarizeSelection,
  type ExpenseListSearch,
} from '../shared/expensesSelection.service'
import {
  useExpenseCategories,
  useExpenseOccurrences,
  useExpensePeople,
  useExpenseSubtypes,
} from './useExpenses.hook'

const VEHICLE_OPTIONS_PAGE_SIZE = 100

export type ExpensesFilterState = Readonly<{
  /** `driver:<id>` | `user:<id>`; vazio = todas. */
  causedBy: string
  categoryId: string
  /** Spec 331: tipo da categoria (qual cartão); vazio = todos. */
  subtypeId: string
  competence: string
  driverId: string
  kind: '' | ExpenseKind
  status: '' | ExpenseOccurrenceStatus
}>

export type ExpensesDialog =
  | Readonly<{ kind: 'create' }>
  | Readonly<{ kind: 'edit'; occurrence: ExpenseOccurrenceListItem }>
  | Readonly<{ kind: 'settle'; occurrence: ExpenseOccurrenceListItem }>
  | Readonly<{ kind: 'trips'; occurrence: ExpenseOccurrenceListItem }>
  | Readonly<{ action: 'cancel' | 'settle'; kind: 'bulk' }>
  | null

function toApiFilters(filters: ExpensesFilterState): ExpenseOccurrenceFilters {
  return {
    competence: filters.competence,
    ...(filters.categoryId === '' ? {} : { categoryId: filters.categoryId }),
    ...(filters.subtypeId === '' ? {} : { subtypeId: filters.subtypeId }),
    ...causedByKeys(filters.causedBy),
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
    causedBy: '',
    categoryId: '',
    subtypeId: '',
    competence: currentCompetence(),
    driverId: '',
    kind: '',
    status: '',
  })
  const [dialog, setDialog] = useState<ExpensesDialog>(null)
  const [search, setSearch] = useState<ExpenseListSearch>(EMPTY_LIST_SEARCH)
  const [pickedIds, setPickedIds] = useState<ReadonlySet<string>>(new Set())

  const occurrences = useExpenseOccurrences({ enabled: canRead, filters: toApiFilters(filters) })
  const categories = useExpenseCategories({ enabled: canRead })
  const subtypes = useExpenseSubtypes({ enabled: canRead })
  const people = useExpensePeople({ enabled: canRead })
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
  const visibleItems = filterListItems(page?.items ?? [], search)
  const openItems = selectableItems(visibleItems)
  // A seleção só vale para o que está à vista e em aberto: mudar o filtro nunca age em conta escondida.
  const selectedIds: ReadonlySet<string> = new Set(
    openItems.filter((item) => pickedIds.has(item.id)).map((item) => item.id),
  )
  const selection = summarizeSelection(openItems, selectedIds)
  const summary =
    page === undefined
      ? undefined
      : summarizeOccurrences({ items: page.items, today, totals: page.totals })

  return {
    canManage,
    canRead,
    clearSelection: () => setPickedIds(new Set()),
    isAllSelected: openItems.length > 0 && selectedIds.size === openItems.length,
    openItems,
    search,
    selectedIds,
    selection,
    setSearch: (changes: Partial<ExpenseListSearch>) =>
      setSearch((current) => ({ ...current, ...changes })),
    toggleAll: () =>
      setPickedIds(
        selectedIds.size === openItems.length ? new Set() : new Set(openItems.map((i) => i.id)),
      ),
    toggleOne: (id: string) =>
      setPickedIds((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    visibleItems,
    categories: categories.data ?? [],
    closeDialog: () => setDialog(null),
    dialog,
    driverOptions,
    filters,
    people: people.data ?? [],
    subtypes: subtypes.data ?? [],
    isAuthLoading: authQuery.isPending,
    isLoading: occurrences.isPending && canRead,
    loadError: occurrences.error,
    openDialog: setDialog,
    /** Spec 329: depois de criar, a lista passa a mostrar a conta nova (mês do vencimento, sem filtro que a esconda). */
    revealCreated: (input: Readonly<{ dueDate?: string }>) =>
      setFilters((current) => ({
        ...current,
        causedBy: '',
        categoryId: '',
        subtypeId: '',
        competence: input.dueDate === undefined ? current.competence : input.dueDate.slice(0, 7),
        driverId: '',
        kind: '',
        status: '',
      })),
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
