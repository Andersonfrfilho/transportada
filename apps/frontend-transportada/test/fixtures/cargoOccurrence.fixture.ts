/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3: a avaria e a devolução no formato que a API devolve (`apps/api-transportada/src/
 * cargo-receiving`, ADR-0094 §9). Dados sintéticos: tipos, itens e destinatários inventados.
 */
import type {
  CargoDocumentProduct,
  CargoDocumentReturn,
  CargoOccurrenceView,
  CargoOccurrencesView,
  CargoReturnState,
  ReceivingOccurrenceType,
} from '@/modules/cargo-receiving/shared/cargoOccurrence.types'

export const DAMAGE_TYPE_ID = '00000000-0000-4000-8000-0000002373a1'
export const SHORTAGE_TYPE_ID = '00000000-0000-4000-8000-0000002373a2'
export const SINGLE_ITEM_TYPE_ID = '00000000-0000-4000-8000-0000002373a3'

export const RECEIVING_TYPES: readonly ReceivingOccurrenceType[] = [
  {
    allowsMultipleItems: true,
    id: DAMAGE_TYPE_ID,
    itemsMode: 'optional',
    name: 'Item avariado na chegada',
  },
  {
    allowsMultipleItems: true,
    id: SHORTAGE_TYPE_ID,
    itemsMode: 'optional',
    name: 'Item faltante na chegada',
  },
  {
    allowsMultipleItems: false,
    id: SINGLE_ITEM_TYPE_ID,
    itemsMode: 'optional',
    name: 'Divergência de quantidade na chegada',
  },
]

export function buildProduct(
  overrides: Partial<CargoDocumentProduct> & Readonly<{ code: string }>,
): CargoDocumentProduct {
  return {
    commercialUnit: 'CX',
    description: `Produto ${overrides.code}`,
    ordinal: 1,
    quantity: '10.0000',
    totalValue: '100.0000',
    unitValue: '10.0000',
    ...overrides,
  }
}

export const DEFAULT_PRODUCTS: readonly CargoDocumentProduct[] = [
  buildProduct({
    code: 'P-100',
    commercialUnit: 'CX',
    description: 'Biscoito de leite 200 g',
    ordinal: 1,
  }),
  buildProduct({
    code: 'P-200',
    commercialUnit: 'KG',
    description: 'Farinha de trigo',
    ordinal: 2,
  }),
  buildProduct({ code: 'P-300', commercialUnit: '', description: 'Sabonete em barra', ordinal: 3 }),
]

export function buildOccurrence(
  overrides: Partial<CargoOccurrenceView> & Readonly<{ id: string; nfeDocumentId: string }>,
): CargoOccurrenceView {
  return {
    actorName: 'Separador Fictício',
    attachments: [
      { expired: false, id: `${overrides.id}-photo`, mimeType: 'image/jpeg', position: 1 },
    ],
    cancelledAt: null,
    case: { id: `${overrides.id}-case`, status: 'recorded' },
    channel: 'backoffice',
    createdAt: '2026-10-03T13:10:00.000Z',
    items: [
      { code: 'P-100', description: 'Biscoito de leite 200 g', quantity: '2.000', unit: 'CX' },
    ],
    note: 'Caixa amassada',
    occurrenceTypeId: DAMAGE_TYPE_ID,
    typeName: 'Item avariado na chegada',
    ...overrides,
  }
}

export function buildReturn(
  nfeDocumentId: string,
  state: CargoReturnState = 'none',
  returnOccurrenceId: string | null = null,
): CargoDocumentReturn {
  return { nfeDocumentId, returnOccurrenceId, returnToContractor: state }
}

export function buildOccurrencesView(
  input: Readonly<{
    occurrences?: readonly CargoOccurrenceView[]
    returns?: readonly CargoDocumentReturn[]
  }> = {},
): CargoOccurrencesView {
  const returns = input.returns ?? []
  const count = (state: CargoReturnState) =>
    returns.filter((entry) => entry.returnToContractor === state).length
  return {
    documents: returns,
    occurrences: input.occurrences ?? [],
    returnCounts: { marked: count('marked'), returned: count('returned') },
  }
}

/** A janela do perfil aberta ou vencida em relação ao relógio de AGORA (o painel lê `Date.now()`). */
export const windowOpenDueAt = (): string => new Date(Date.now() + 3_600_000).toISOString()
export const windowClosedDueAt = (): string => new Date(Date.now() - 3_600_000).toISOString()
