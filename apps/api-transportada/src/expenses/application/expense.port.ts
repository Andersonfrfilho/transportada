/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.1: forma das portas do módulo Contas, fixada pelos contratos de `test/expenses/`.
 * A T1.2 (schema) e a T1.4 (Drizzle) implementam; dinheiro é `numeric` em string, nunca float.
 */
import type { ExpenseTripRoute } from '../domain/expense-trip-route.policy.js'

export type ExpenseKind = 'fixed' | 'variable'
export type ExpenseRecurrence = 'monthly' | 'bimonthly' | 'quarterly' | 'yearly' | 'fortnightly'
export type ExpenseOccurrenceStatus = 'open' | 'paid' | 'canceled'

export type CompanyExpenseCategory = {
  readonly active: boolean
  /** ADR-0116 §1: o grupo de custo do rateio (`administrative` na categoria nova). */
  readonly costGroup?: 'administrative' | 'in_trip' | 'per_km' | 'vehicle_fixed'
  readonly id: string
  readonly name: string
  /** Semeada "Pagamento de motorista/agregado" exige `payee_driver_id`; as demais o recusam. */
  readonly requiresDriver: boolean
}

/**
 * Spec 325 RF1e: o rótulo do favorecido na lista — "Motorista", "Agregado" ou "Ajudante" —, lido do cadastro na hora
 * (`fleet_drivers`), nunca copiado. A API devolve a chave; o texto é da tela.
 */
export type ExpensePayeeProfile = 'aggregate' | 'driver' | 'helper'

export type ExpenseDriverRef = {
  readonly id: string
  readonly paymentModel: 'fixed' | 'route_table'
}

export type CompanyExpense = {
  readonly active: boolean
  readonly categoryId: string
  readonly companyId: string
  readonly dueDay: number | null
  readonly expectedAmount: string
  readonly id: string
  readonly kind: ExpenseKind
  readonly name: string
  readonly payeeDriverId: string | null
  readonly recurrence: ExpenseRecurrence | null
  /** Dúvida 2: veículo opcional (`fleet_vehicles`), sem rateio. */
  readonly vehicleId?: string | null
  /** `yyyy-mm` em que a conta começou: bimestral/trimestral/anual contam a partir dele. Sem ele, vale a janela. */
  readonly anchorCompetence?: string
}

export type CompanyExpenseOccurrence = {
  readonly companyId: string
  /** `yyyy-mm`. */
  readonly competence: string
  /** `yyyy-mm-dd`. */
  readonly dueDate: string
  readonly expectedAmount: string
  readonly expenseId: string
  readonly id: string
  readonly paidAmount: string | null
  readonly paidAt: string | null
  readonly paidBy: string | null
  readonly settlementNote: string | null
  /** 1 em toda recorrência; na quinzenal, 1 = dia 15 e 2 = último dia. */
  readonly slot?: 1 | 2
  readonly status: ExpenseOccurrenceStatus
}

/** Linha da lista de ocorrências: a ocorrência com o que a tela precisa da conta (nome, categoria, motorista). */
export type ExpenseOccurrenceListItem = CompanyExpenseOccurrence & {
  readonly categoryId: string
  readonly categoryName: string
  readonly expenseKind: ExpenseKind
  readonly expenseName: string
  readonly payeeDriverId: string | null
  /** Derivado do cadastro na leitura, nunca copiado (RF1b). */
  readonly payeeDriverName: string | null
  readonly payeeDriverPaymentModel: ExpenseDriverRef['paymentModel'] | null
  /** RF1e: `helper` (ajudante-puro), `aggregate` (`route_table`) ou `driver` (da casa). `null` sem favorecido. */
  readonly payeeProfile: ExpensePayeeProfile | null
}

export type ExpenseOccurrenceFilters = {
  readonly categoryId?: string
  /** `yyyy-mm`. */
  readonly competence?: string
  readonly driverId?: string
  readonly kind?: ExpenseKind
  readonly status?: ExpenseOccurrenceStatus
}

export type ExpenseAuditEntry = {
  readonly action: string
  readonly actorUserId: string
  readonly companyId: string
  readonly correlationId: string
  readonly entityId: string
  readonly entityType: 'company_expense' | 'company_expense_category' | 'company_expense_occurrence'
  readonly metadata: Record<string, unknown>
}

export type ExpensesPorts = {
  /** RF9: a trilha grava a permissão `expenses.manage` (toda escrita do módulo exige ela). */
  readonly audit: {
    append(entry: ExpenseAuditEntry): Promise<void>
  }
  readonly categories: {
    create(input: {
      companyId: string
      name: string
    }): Promise<CompanyExpenseCategory | 'name_taken'>
    /** Primeiro uso da empresa: grava as 8 categorias da semente se ela ainda não tem nenhuma. Idempotente. */
    ensureSeeded(input: { companyId: string }): Promise<void>
    findById(input: {
      categoryId: string
      companyId: string
    }): Promise<CompanyExpenseCategory | null>
    list(input: { companyId: string }): Promise<readonly CompanyExpenseCategory[]>
    setActive(input: {
      active: boolean
      categoryId: string
      companyId: string
    }): Promise<CompanyExpenseCategory | null>
  }
  readonly drivers: {
    findById(input: { companyId: string; driverId: string }): Promise<ExpenseDriverRef | null>
  }
  readonly expenses: {
    create(input: Omit<CompanyExpense, 'active' | 'id'>): Promise<CompanyExpense>
    findById(input: { companyId: string; expenseId: string }): Promise<CompanyExpense | null>
    list(input: { companyId: string }): Promise<readonly CompanyExpense[]>
    listActiveFixed(input: { companyId: string }): Promise<readonly CompanyExpense[]>
    /** RF5: vale dali para frente; ocorrência já gerada não é reescrita. */
    update(input: {
      active?: boolean
      companyId: string
      dueDay?: number | null
      expectedAmount?: string
      expenseId: string
      name?: string
      vehicleId?: string | null
    }): Promise<CompanyExpense | null>
  }
  readonly occurrences: {
    /** `open` → `canceled` numa instrução só; `null` quando não existe ou já não está aberta. */
    cancel(input: {
      canceledBy: string
      companyId: string
      occurrenceId: string
      reason: string
    }): Promise<CompanyExpenseOccurrence | null>
    findById(input: {
      companyId: string
      occurrenceId: string
    }): Promise<CompanyExpenseOccurrence | null>
    /** Única por (conta, competência, slot): `ON CONFLICT DO NOTHING`; devolve `false` se já existia. */
    insertIfAbsent(
      input: Pick<
        CompanyExpenseOccurrence,
        'companyId' | 'competence' | 'dueDate' | 'expectedAmount' | 'expenseId'
      > & { readonly slot: 1 | 2 },
    ): Promise<boolean>
    list(input: {
      companyId: string
      filters: ExpenseOccurrenceFilters
    }): Promise<readonly ExpenseOccurrenceListItem[]>
    /** Só baixa o que está `open`; `null` quando não existe ou já não está aberta (corrida). */
    markPaid(input: {
      occurrenceId: string
      paidAmount: string
      paidAt: string
      paidBy: string
      settlementNote: string | null
    }): Promise<CompanyExpenseOccurrence | null>
  }
}

export type { ExpenseTripRoute } from '../domain/expense-trip-route.policy.js'

/** Spec 325 RF1d/RF1e: a parcela de pessoa da viagem que o pagamento cobre. */
export type ExpenseTripParcelKind = 'driver' | 'helper'

/** Uma viagem incluída num pagamento: a linha da pessoa na parcela, copiada na inclusão. */
export type ExpenseOccurrenceTrip = {
  /** Centavos em texto (`numeric(14,2)`), a linha da pessoa arredondada meio para cima. */
  readonly amount: string
  /** `yyyy-mm-dd`, conclusão da viagem em São Paulo. */
  readonly completedOn: string
  /** Diária usada na viagem (`numeric(19,4)`). */
  readonly dailyAmount: string
  readonly days: number
  readonly driverId: string
  readonly occurrenceId: string
  readonly parcelKind: ExpenseTripParcelKind
  readonly tripId: string
}

/** Viagem concluída em que a pessoa estava na tripulação, com o papel dela ali. */
export type PayableTripCandidate = {
  readonly completedOn: string
  readonly crewRole: ExpenseTripParcelKind
  readonly tripId: string
}

/** O que a inclusão confere da viagem: dela a empresa, o status, a conclusão e a tripulação. */
export type PayableTripFacts = {
  readonly completedOn: string | null
  readonly crew: readonly { readonly driverId: string; readonly role: ExpenseTripParcelKind }[]
  readonly status: string
  readonly tripId: string
}

/**
 * A linha da pessoa na parcela da viagem, lida da **mesma** conta de valoração do produto (143/149). `missing` é a
 * lacuna da viagem (sem dias conhecidos, sem condutor): o pagamento não a inclui, e ela aparece como pendência.
 */
export type PayableTripParcel =
  | {
      /** `numeric(19,4)` em texto, exatamente a linha da pessoa (`diária × dias`). */
      readonly amount: string
      readonly dailyAmount: string
      readonly days: number
      readonly status: 'priced'
    }
  | { readonly gap: string; readonly status: 'missing' }

export type IncludeOccurrenceTripOutcome =
  | { readonly occurrence: CompanyExpenseOccurrence; readonly status: 'included' }
  | { readonly status: 'not_open' | 'taken' }

export type RemoveOccurrenceTripOutcome =
  | { readonly occurrence: CompanyExpenseOccurrence; readonly status: 'removed' }
  | { readonly status: 'not_found' | 'not_open' }

/** Portas da T1.4b. Conta, ocorrência e auditoria são as mesmas da T1.4. */
export type ExpenseOccurrenceTripPorts = Pick<
  ExpensesPorts,
  'audit' | 'expenses' | 'occurrences'
> & {
  readonly occurrenceTrips: {
    /**
     * Numa transação, com a ocorrência travada e ainda `open`: grava a viagem e recalcula o previsto como a soma das
     * viagens. `taken` quando a parte da pessoa naquela parcela já está noutro pagamento (o unique decide a corrida).
     */
    include(input: {
      readonly companyId: string
      readonly createdBy: string
      readonly trip: ExpenseOccurrenceTrip
    }): Promise<IncludeOccurrenceTripOutcome>
    list(input: {
      readonly companyId: string
      readonly occurrenceId: string
    }): Promise<readonly ExpenseOccurrenceTrip[]>
    /** De quais viagens a parte da pessoa já está num pagamento (qualquer um), e em qual. */
    listHeld(input: {
      readonly companyId: string
      readonly driverId: string
      readonly parcelKind: ExpenseTripParcelKind
      readonly tripIds: readonly string[]
    }): Promise<ReadonlyMap<string, string>>
    /**
     * Numa transação, com a ocorrência travada e ainda `open`: tira a viagem e recalcula o previsto; sem viagem
     * nenhuma, o previsto volta a `fallbackExpectedAmount` (o valor da conta).
     */
    remove(input: {
      readonly companyId: string
      readonly fallbackExpectedAmount: string
      readonly occurrenceId: string
      readonly parcelKind: ExpenseTripParcelKind
      readonly tripId: string
    }): Promise<RemoveOccurrenceTripOutcome>
  }
  readonly payableTrips: {
    findFacts(input: {
      readonly companyId: string
      readonly tripId: string
    }): Promise<PayableTripFacts | null>
    /** Viagens `completed` da empresa com a pessoa na tripulação, concluídas no período (datas civis, inclusivas). */
    listCompleted(input: {
      readonly companyId: string
      readonly driverId: string
      readonly from: string
      readonly to: string
    }): Promise<readonly PayableTripCandidate[]>
    /** Em lote: o trajeto lido das paradas; viagem sem parada, ou de outra empresa, não entra no mapa. */
    readRoutes(input: {
      readonly companyId: string
      readonly tripIds: readonly string[]
    }): Promise<ReadonlyMap<string, ExpenseTripRoute>>
    /** Em lote: viagem que não é da empresa, ou sem a pessoa naquele papel, não entra no mapa. */
    readPersonParcels(input: {
      readonly companyId: string
      readonly driverId: string
      readonly parcelKind: ExpenseTripParcelKind
      readonly tripIds: readonly string[]
    }): Promise<ReadonlyMap<string, PayableTripParcel>>
  }
}
