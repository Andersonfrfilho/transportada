/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { TRIP_MANAGE_PERMISSION } from './trip.constant'
import type { OccurrenceCorrection } from './trip.types'
import type {
  TripOccurrenceCaseStatus,
  TripOccurrenceCaseView,
  TripOccurrenceDetailDriver,
  TripOccurrenceDetailItem,
} from './tripOccurrenceFeed.service'

export type OccurrenceDriverContact = Readonly<{
  emailHref: null | string
  initials: string
  name: string
  phone: string
  pictureUrl: null | string
  telHref: null | string
  whatsappHref: null | string
}>

/** Duas letras: primeira e última palavra do nome — o avatar quando não há foto. */
function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== '')
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toLocaleUpperCase('pt-BR')
}

/**
 * Spec 183 P2: o contato do motorista vira **ação** — ligar, abrir o WhatsApp, escrever. Ligar e
 * WhatsApp saem do produto (`tel:` e `wa.me`, spec 183 fora do escopo). O WhatsApp só aparece com o
 * telefone verificado; o telefone da ficha sozinho não prova que a pessoa tem WhatsApp nele.
 */
export function buildOccurrenceDriverContact(
  input: Readonly<{ apiUrl: string; driver: null | TripOccurrenceDetailDriver }>,
): null | OccurrenceDriverContact {
  const { driver } = input
  if (driver === null) return null
  return {
    emailHref: driver.email === '' ? null : `mailto:${driver.email}`,
    initials: initialsOf(driver.name),
    name: driver.name,
    phone: driver.phone,
    pictureUrl:
      driver.picturePath === null
        ? null
        : `${input.apiUrl.replace(/\/$/, '')}${driver.picturePath}`,
    telHref: driver.phone === '' ? null : `tel:${driver.phone}`,
    whatsappHref:
      driver.whatsappPhone === null
        ? null
        : `https://wa.me/${driver.whatsappPhone.replace(/\D/gu, '')}`,
  }
}

/**
 * Spec 183 T207: a quantidade atingida com a unidade da nota (specs 166/172). Sem quantidade, nada —
 * o item continua na lista pelo código e pela descrição.
 */
export function formatOccurrenceItemQuantity(
  item: Readonly<{ quantity: null | string; unit: null | string }>,
  formatNumber: (value: string) => string,
): string {
  if (item.quantity === null) return ''
  const quantity = formatNumber(item.quantity)
  return item.unit === null ? quantity : `${quantity} ${item.unit}`
}

const quantityFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })

/** Quantidade é string decimal de três casas; a tela só a mostra, nunca faz conta com ela. */
export function formatOccurrenceQuantity(value: string): string {
  return quantityFormatter.format(Number(value))
}

export type OccurrenceCorrectionHistoryEntry = Readonly<{
  correctedAt: string
  correctedByName: null | string
  items: readonly Pick<TripOccurrenceDetailItem, 'code' | 'quantity' | 'unit'>[]
}>

/**
 * Spec 235 RF5: a API grava em cada correção o conjunto que valia **antes** dela (`previousItems`), e
 * entrega mais antiga primeiro. O conjunto que passou a valer numa correção é, então, o `previousItems`
 * da seguinte — e, na última, os itens atuais da ocorrência.
 */
export function resolveOccurrenceCorrectionHistory(
  corrections: readonly OccurrenceCorrection[],
  currentItems: readonly TripOccurrenceDetailItem[],
): readonly OccurrenceCorrectionHistoryEntry[] {
  return corrections.map((correction, index) => ({
    correctedAt: correction.correctedAt,
    correctedByName: correction.correctedByName,
    items: corrections[index + 1]?.previousItems ?? currentItems,
  }))
}

/** Spec 183 T801 (P11): no celular, o detalhe vira três abas. */
export const OCCURRENCE_DETAIL_PHONE_TABS = ['summary', 'contractor', 'driver'] as const

export type OccurrenceDetailPhoneTab = (typeof OCCURRENCE_DETAIL_PHONE_TABS)[number]

export type OccurrenceDetailSection =
  | 'case'
  | 'contractorConversation'
  | 'conversations'
  | 'document'
  | 'driverContact'
  | 'driverConversation'
  | 'summary'
  | 'timeline'

/**
 * As seções de cada aba no celular; `null` é a tela larga, com a página inteira na ordem de
 * sempre. As conversas, no celular, se separam por parte: cada aba mostra a sua, sem abas internas.
 */
export function occurrenceDetailSectionsFor(
  tab: OccurrenceDetailPhoneTab | null,
): readonly OccurrenceDetailSection[] {
  if (tab === 'summary') return ['summary', 'document', 'case', 'timeline']
  if (tab === 'contractor') return ['contractorConversation']
  if (tab === 'driver') return ['driverContact', 'driverConversation']
  return ['summary', 'document', 'driverContact', 'case', 'conversations', 'timeline']
}

export type OccurrenceActionState =
  | Readonly<{ availability: 'disabled'; reason: string }>
  | Readonly<{ availability: 'enabled' }>
  | Readonly<{ availability: 'hidden' }>

export type OccurrenceCorrectionActions = Readonly<{
  cancel: OccurrenceActionState
  correct: OccurrenceActionState
}>

export type OccurrenceCorrectionActionsInput = Readonly<{
  caseView:
    | null
    | (Pick<TripOccurrenceCaseView, 'status'> & {
        readonly decision: null | Pick<NonNullable<TripOccurrenceCaseView['decision']>, 'kind'>
      })
  /** Prorrogação de boleto e afins não tocam a entrega: sem itens, não há o que corrigir. */
  hasItems: boolean
  isCancelled: boolean
  permissions: readonly string[]
  /** Quem já passou por Corrigir (inclusive para "a nota inteira") continua podendo corrigir. */
  wasCorrected: boolean
}>

const OPEN_CASE_STATUSES: readonly TripOccurrenceCaseStatus[] = [
  'recorded',
  'under_review',
  'awaiting_contractor',
]

/**
 * Spec 235 RF4/RF10, espelho de `correct-occurrence-items.use-case.ts` e `cancel-occurrence.use-case.ts`:
 * ocorrência cancelada vale antes de tudo; depois, **qualquer** tratativa gravada fecha a janela — o
 * servidor só pergunta se existe a linha, não em que estado ela está. Os estados só mudam o texto.
 */
function resolveUnavailableReason(
  input: OccurrenceCorrectionActionsInput,
  t: Translate,
): null | string {
  if (input.isCancelled) return t('occurrenceDetail.correction.unavailable.occurrenceCancelled')
  const { caseView } = input
  if (caseView === null) return null
  if (OPEN_CASE_STATUSES.includes(caseView.status)) {
    return t('occurrenceDetail.correction.unavailable.caseOpen')
  }
  if (caseView.status === 'decided') {
    return t(
      `occurrenceDetail.correction.unavailable.caseDecided.${caseView.decision?.kind ?? 'other'}`,
    )
  }
  if (caseView.status === 'returned_to_warehouse') {
    return t('occurrenceDetail.correction.unavailable.caseReturnedToWarehouse')
  }
  if (caseView.status === 'closed') return t('occurrenceDetail.correction.unavailable.caseClosed')
  return t('occurrenceDetail.correction.unavailable.caseCancelled')
}

export function resolveOccurrenceCorrectionActions(
  input: OccurrenceCorrectionActionsInput,
  t: Translate,
): OccurrenceCorrectionActions {
  const hidden: OccurrenceActionState = { availability: 'hidden' }
  if (!input.permissions.includes(TRIP_MANAGE_PERMISSION))
    return { cancel: hidden, correct: hidden }

  const reason = resolveUnavailableReason(input, t)
  const state: OccurrenceActionState =
    reason === null ? { availability: 'enabled' } : { availability: 'disabled', reason }
  return { cancel: state, correct: input.hasItems || input.wasCorrected ? state : hidden }
}
