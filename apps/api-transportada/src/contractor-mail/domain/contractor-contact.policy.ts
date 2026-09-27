/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T302 (RF5, D6): a escrita de um contato da contratante, pura. Decide o estado a gravar a
 * partir do atual e do pedido:
 *
 * - **os tipos mandam.** `receives_occurrences` e `can_decide` são derivados deles em toda escrita —
 *   a 143 (envio de ocorrência) e a 150 (quem pode decidir) seguem lendo os dois campos antigos;
 * - o pedido antigo (só os dois campos, o formulário anterior à 183) mexe só nos dois tipos
 *   equivalentes; mandar os dois jeitos juntos é conflito, nunca um vencendo calado;
 * - o aceite do WhatsApp é carimbado aqui, com a hora do servidor e quem clicou. Ele é do **número**:
 *   trocar ou tirar o telefone o derruba, e WhatsApp como canal preferido exige aceite.
 */
import {
  CONTRACTOR_CONTACT_OCCURRENCE_STAGES,
  CONTRACTOR_CONTACT_TYPES,
  type ContractorContactChannel,
  type ContractorContactOccurrenceStage,
  type ContractorContactType,
} from '../../database/contractor-mail.schema.js'
import {
  isSameWhatsAppPhone,
  toWhatsAppPhone,
} from '../../whatsapp-commands/domain/whatsapp-phone.policy.js'

export type ContractorContactState = {
  readonly canDecide: boolean
  readonly name: string
  readonly occurrenceStages: readonly ContractorContactOccurrenceStage[]
  readonly phone: string | null
  readonly preferredChannel: ContractorContactChannel
  readonly receivesOccurrences: boolean
  readonly roleLabel: string
  readonly types: readonly ContractorContactType[]
  readonly whatsappOptInAt: Date | null
  readonly whatsappOptInByUserId: string | null
}

/** O contato novo pelo pedido antigo: recebe ocorrência e não decide — os padrões de antes da 183. */
export const EMPTY_CONTRACTOR_CONTACT_STATE: ContractorContactState = {
  canDecide: false,
  name: '',
  occurrenceStages: CONTRACTOR_CONTACT_OCCURRENCE_STAGES,
  phone: null,
  preferredChannel: 'email',
  receivesOccurrences: true,
  roleLabel: '',
  types: ['occurrences'],
  whatsappOptInAt: null,
  whatsappOptInByUserId: null,
}

export type ContractorContactWriteRequest = {
  readonly canDecide?: boolean
  readonly name?: string
  readonly occurrenceStages?: readonly ContractorContactOccurrenceStage[]
  /** `null` tira o telefone; texto é normalizado para o formato do WhatsApp. */
  readonly phone?: string | null
  readonly preferredChannel?: ContractorContactChannel
  readonly receivesOccurrences?: boolean
  readonly roleLabel?: string
  readonly types?: readonly ContractorContactType[]
  /** `true` registra o aceite (o servidor carimba); `false` o retira. */
  readonly whatsappOptIn?: boolean
}

export type ContractorContactWriteErrorCode =
  | 'CONTRACTOR_CONTACT_OCCURRENCE_STAGES_EMPTY'
  | 'CONTRACTOR_CONTACT_OPT_IN_WITHOUT_PHONE'
  | 'CONTRACTOR_CONTACT_PHONE_INVALID'
  | 'CONTRACTOR_CONTACT_TYPES_CONFLICT'
  | 'CONTRACTOR_CONTACT_WHATSAPP_WITHOUT_OPT_IN'

export type ContractorContactWriteResult =
  | { readonly ok: true; readonly state: ContractorContactState }
  | { readonly code: ContractorContactWriteErrorCode; readonly ok: false }

const TYPE_OF_RECEIVES_OCCURRENCES: ContractorContactType = 'occurrences'
const TYPE_OF_CAN_DECIDE: ContractorContactType = 'approves_charges'

function inCanonicalOrder<TValue extends string>(
  canonical: readonly TValue[],
  values: readonly TValue[],
): readonly TValue[] {
  return canonical.filter((value) => values.includes(value))
}

function withFlag(
  types: readonly ContractorContactType[],
  type: ContractorContactType,
  enabled: boolean | undefined,
): readonly ContractorContactType[] {
  if (enabled === undefined) return types
  const without = types.filter((candidate) => candidate !== type)
  return enabled ? [...without, type] : without
}

function resolveTypes(
  current: ContractorContactState,
  request: ContractorContactWriteRequest,
): readonly ContractorContactType[] | null {
  const sentLegacy = request.receivesOccurrences !== undefined || request.canDecide !== undefined
  if (request.types !== undefined && sentLegacy) return null
  const types =
    request.types ??
    withFlag(
      withFlag(current.types, TYPE_OF_RECEIVES_OCCURRENCES, request.receivesOccurrences),
      TYPE_OF_CAN_DECIDE,
      request.canDecide,
    )
  return inCanonicalOrder(CONTRACTOR_CONTACT_TYPES, types)
}

type PhoneResult = { readonly phone: string | null } | { readonly invalid: true }

function resolvePhone(current: string | null, requested: string | null | undefined): PhoneResult {
  if (requested === undefined) return { phone: current }
  if (requested === null || requested.trim() === '') return { phone: null }
  const phone = toWhatsAppPhone(requested)
  return phone === undefined ? { invalid: true } : { phone }
}

function samePhone(first: string | null, second: string | null): boolean {
  if (first === null || second === null) return first === second
  return isSameWhatsAppPhone(first, second)
}

export function resolveContractorContactWrite(input: {
  readonly actorUserId: string
  readonly current: ContractorContactState | null
  readonly now: Date
  readonly request: ContractorContactWriteRequest
}): ContractorContactWriteResult {
  const current = input.current ?? EMPTY_CONTRACTOR_CONTACT_STATE
  const { request } = input

  const types = resolveTypes(current, request)
  if (types === null) return { code: 'CONTRACTOR_CONTACT_TYPES_CONFLICT', ok: false }

  const occurrenceStages =
    request.occurrenceStages === undefined
      ? current.occurrenceStages
      : inCanonicalOrder(CONTRACTOR_CONTACT_OCCURRENCE_STAGES, request.occurrenceStages)
  if (occurrenceStages.length === 0) {
    return { code: 'CONTRACTOR_CONTACT_OCCURRENCE_STAGES_EMPTY', ok: false }
  }

  const phoneResult = resolvePhone(current.phone, request.phone)
  if ('invalid' in phoneResult) return { code: 'CONTRACTOR_CONTACT_PHONE_INVALID', ok: false }
  const { phone } = phoneResult

  /** O aceite é do número: sobrevive só enquanto o número for o mesmo. */
  const keptOptIn =
    current.whatsappOptInAt !== null && phone !== null && samePhone(current.phone, phone)
  let whatsappOptInAt = keptOptIn ? current.whatsappOptInAt : null
  let whatsappOptInByUserId = keptOptIn ? current.whatsappOptInByUserId : null
  if (request.whatsappOptIn === false) {
    whatsappOptInAt = null
    whatsappOptInByUserId = null
  }
  if (request.whatsappOptIn === true) {
    if (phone === null) return { code: 'CONTRACTOR_CONTACT_OPT_IN_WITHOUT_PHONE', ok: false }
    if (whatsappOptInAt === null) {
      whatsappOptInAt = input.now
      whatsappOptInByUserId = input.actorUserId
    }
  }

  const preferredChannel = request.preferredChannel ?? current.preferredChannel
  if (preferredChannel === 'whatsapp' && whatsappOptInAt === null) {
    return { code: 'CONTRACTOR_CONTACT_WHATSAPP_WITHOUT_OPT_IN', ok: false }
  }

  return {
    ok: true,
    state: {
      canDecide: types.includes(TYPE_OF_CAN_DECIDE),
      name: request.name === undefined ? current.name : request.name.trim(),
      occurrenceStages,
      phone,
      preferredChannel,
      receivesOccurrences: types.includes(TYPE_OF_RECEIVES_OCCURRENCES),
      roleLabel: request.roleLabel === undefined ? current.roleLabel : request.roleLabel.trim(),
      types,
      whatsappOptInAt,
      whatsappOptInByUserId,
    },
  }
}
