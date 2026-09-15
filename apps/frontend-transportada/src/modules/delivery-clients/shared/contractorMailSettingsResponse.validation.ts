/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import {
  CONTRACTOR_MAIL_CHECK_ITEM_KEYS,
  CONTRACTOR_MAIL_CHECK_KEYS,
  CONTRACTOR_MAIL_CHECK_REASONS,
  CONTRACTOR_MAIL_CHECK_STATUSES,
  CONTRACTOR_MAIL_SETTINGS_SUMMARY_KEYS,
  CONTRACTOR_MAIL_TEST_EMAIL_RESULT_KEYS,
  type ContractorMailCheckItem,
  type ContractorMailSettingsSummary,
  type ContractorMailTestEmailResult,
} from './contractorMailSettings.types'

/**
 * Resposta de API é entrada não confiável (`security.md` §3). `hasExactKeys` recusa a resposta
 * inteira, com erro explícito, em vez de deixar um campo a mais ou a menos atravessar até um `.map`
 * estourar em silêncio — o defeito que o `VEHICLE_DETAIL_KEYS` mediu (linha rejeitada, tabela vazia,
 * 200 na rede, nada no console). A superfície aqui é sempre um objeto único, nunca um array de
 * linhas: por isso a falha vira uma exceção visível na tela (o painel mostra o erro), não uma lista
 * que renderiza vazia sem motivo aparente.
 */
export class ContractorMailSettingsResponseError extends Error {
  public constructor() {
    super('CONTRACTOR_MAIL_SETTINGS_RESPONSE_INVALID')
    this.name = 'ContractorMailSettingsResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is null | string {
  return value === null || typeof value === 'string'
}

function isOneOf<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is TOption {
  return typeof value === 'string' && options.includes(value as TOption)
}

function isSettingsSummary(value: unknown): value is ContractorMailSettingsSummary {
  if (!hasExactKeys(value, CONTRACTOR_MAIL_SETTINGS_SUMMARY_KEYS)) return false

  return (
    typeof value.apiKeyConfigured === 'boolean' &&
    isString(value.id) &&
    isNullableString(value.lastWebhookAt) &&
    isString(value.replyDomain) &&
    isString(value.senderAddress) &&
    isString(value.senderName) &&
    isNullableString(value.sendingVerifiedAt) &&
    isOneOf(value.status, ['pending', 'active', 'failed']) &&
    isString(value.version) &&
    isString(value.webhookId) &&
    typeof value.webhookSecretConfigured === 'boolean'
  )
}

function isCheckItem(value: unknown): value is ContractorMailCheckItem {
  if (!hasExactKeys(value, CONTRACTOR_MAIL_CHECK_ITEM_KEYS)) return false

  return (
    isOneOf(value.key, CONTRACTOR_MAIL_CHECK_KEYS) &&
    isOneOf(value.reason, CONTRACTOR_MAIL_CHECK_REASONS) &&
    isOneOf(value.status, CONTRACTOR_MAIL_CHECK_STATUSES)
  )
}

/** `GET` sem configuração devolve `{ data: null }` com `200` — nunca `404` (o mesmo padrão da Nota RP). */
export function nullableSettingsFromApi(payload: unknown): ContractorMailSettingsSummary | null {
  if (!isRecord(payload)) throw new ContractorMailSettingsResponseError()
  if (payload.data === null) return null
  if (!isSettingsSummary(payload.data)) throw new ContractorMailSettingsResponseError()
  return payload.data
}

export function settingsFromApi(payload: unknown): ContractorMailSettingsSummary {
  if (!isRecord(payload) || !isSettingsSummary(payload.data)) {
    throw new ContractorMailSettingsResponseError()
  }
  return payload.data
}

export function checksFromApi(payload: unknown): readonly ContractorMailCheckItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new ContractorMailSettingsResponseError()
  }
  if (!payload.data.every(isCheckItem)) throw new ContractorMailSettingsResponseError()
  return payload.data
}

export function testEmailResultFromApi(payload: unknown): ContractorMailTestEmailResult {
  if (!isRecord(payload) || !hasExactKeys(payload.data, CONTRACTOR_MAIL_TEST_EMAIL_RESULT_KEYS)) {
    throw new ContractorMailSettingsResponseError()
  }
  const { data } = payload
  if (!isString(data.threadId)) throw new ContractorMailSettingsResponseError()
  return { threadId: data.threadId }
}
