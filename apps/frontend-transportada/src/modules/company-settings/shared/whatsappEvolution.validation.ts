/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Cópias por valor das constantes da API (`whatsapp-evolution.schema.ts`); o contrato compara as duas. */
export const WHATSAPP_EVOLUTION_STATUSES = ['active', 'disabled'] as const
export const WHATSAPP_DEFAULT_PROVIDERS = ['meta', 'evolution'] as const
export const WHATSAPP_EVOLUTION_CONNECTION_STATES = [
  'open',
  'connecting',
  'close',
  'unknown',
] as const
export const WHATSAPP_EVOLUTION_DAILY_CAP_RANGE = { max: 1000, min: 1 } as const
export const WHATSAPP_EVOLUTION_MIN_INTERVAL_RANGE = { max: 3600, min: 1 } as const

export type WhatsAppEvolutionStatus = (typeof WHATSAPP_EVOLUTION_STATUSES)[number]
export type WhatsAppDefaultProvider = (typeof WHATSAPP_DEFAULT_PROVIDERS)[number]
export type WhatsAppEvolutionConnectionState = (typeof WHATSAPP_EVOLUTION_CONNECTION_STATES)[number]

/** Sem chave, nem mascarada: a tela só sabe se há (`apiKeyConfigured`). */
export type WhatsAppEvolutionSettings = Readonly<{
  apiKeyConfigured: boolean
  baseUrl: string
  connectionCheckedAt: string | null
  connectionState: WhatsAppEvolutionConnectionState
  createdAt: string
  dailyCap: number
  defaultProvider: WhatsAppDefaultProvider
  id: string
  instanceName: string
  minIntervalSeconds: number
  riskAcknowledgedAt: string | null
  status: WhatsAppEvolutionStatus
  updatedAt: string
  version: string
}>

export type WhatsAppEvolutionQr = Readonly<{
  pairingCode: string | null
  qrCode: string | null
  refreshAfterSeconds: number
  state: WhatsAppEvolutionConnectionState
}>

export type WhatsAppEvolutionConnection = Readonly<{
  checkedAt: string
  /** O chip conectado, já mascarado pela API (`+55 ••••6772`); ausente sem conexão. */
  ownerMasked?: string
  state: WhatsAppEvolutionConnectionState
}>

export type WhatsAppEvolutionOwnerReveal = Readonly<{ ownerNumber: string | null }>

export function isWhatsAppEvolutionOwnerRevealResponse(
  value: unknown,
): value is Readonly<{ data: WhatsAppEvolutionOwnerReveal }> {
  if (!isRecord(value) || !isRecord(value.data)) return false
  return isNullableString(value.data.ownerNumber)
}

export type WhatsAppEvolutionSaveInput = Readonly<{
  acknowledgeRisk: boolean
  apiKey?: string
  baseUrl: string
  dailyCap: number
  defaultProvider: WhatsAppDefaultProvider
  instanceName: string
  minIntervalSeconds: number
  status: WhatsAppEvolutionStatus
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOneOf<TValue extends string>(
  values: readonly TValue[],
  value: unknown,
): value is TValue {
  return values.some((candidate) => candidate === value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

export function isWhatsAppEvolutionSettings(value: unknown): value is WhatsAppEvolutionSettings {
  return (
    isRecord(value) &&
    typeof value.apiKeyConfigured === 'boolean' &&
    typeof value.baseUrl === 'string' &&
    isNullableString(value.connectionCheckedAt) &&
    isOneOf(WHATSAPP_EVOLUTION_CONNECTION_STATES, value.connectionState) &&
    typeof value.createdAt === 'string' &&
    typeof value.dailyCap === 'number' &&
    isOneOf(WHATSAPP_DEFAULT_PROVIDERS, value.defaultProvider) &&
    typeof value.id === 'string' &&
    typeof value.instanceName === 'string' &&
    typeof value.minIntervalSeconds === 'number' &&
    isNullableString(value.riskAcknowledgedAt) &&
    isOneOf(WHATSAPP_EVOLUTION_STATUSES, value.status) &&
    typeof value.updatedAt === 'string' &&
    typeof value.version === 'string'
  )
}

/** Empresa sem configuração é `{ data: null }`, e a tela abre vazia. */
export function isWhatsAppEvolutionResponse(
  value: unknown,
): value is Readonly<{ data: WhatsAppEvolutionSettings | null; provisioningAvailable?: boolean }> {
  return (
    isRecord(value) &&
    'data' in value &&
    (value.data === null || isWhatsAppEvolutionSettings(value.data))
  )
}

export function isWhatsAppEvolutionQrResponse(
  value: unknown,
): value is Readonly<{ data: WhatsAppEvolutionQr }> {
  if (!isRecord(value) || !isRecord(value.data)) return false
  const data = value.data
  return (
    isNullableString(data.pairingCode) &&
    isNullableString(data.qrCode) &&
    typeof data.refreshAfterSeconds === 'number' &&
    isOneOf(WHATSAPP_EVOLUTION_CONNECTION_STATES, data.state)
  )
}

export function isWhatsAppEvolutionConnectionResponse(
  value: unknown,
): value is Readonly<{ data: WhatsAppEvolutionConnection }> {
  if (!isRecord(value) || !isRecord(value.data)) return false
  return (
    typeof value.data.checkedAt === 'string' &&
    (value.data.ownerMasked === undefined || typeof value.data.ownerMasked === 'string') &&
    isOneOf(WHATSAPP_EVOLUTION_CONNECTION_STATES, value.data.state)
  )
}
