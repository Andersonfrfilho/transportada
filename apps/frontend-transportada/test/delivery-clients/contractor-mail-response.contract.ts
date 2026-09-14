/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  checksFromApi,
  ContractorMailSettingsResponseError,
  nullableSettingsFromApi,
  settingsFromApi,
  testEmailResultFromApi,
} from '../../src/modules/delivery-clients/shared/contractorMailSettingsResponse.validation'

const VALID_SUMMARY = {
  apiKeyConfigured: true,
  id: 'settings-1',
  lastWebhookAt: null,
  replyDomain: 'reply.example.com',
  senderAddress: 'occurrences@example.com',
  senderName: 'Example',
  status: 'pending',
  version: '1',
  webhookId: 'webhook-1',
  webhookSecretConfigured: false,
} as const

describe('contractor mail settings response validation', () => {
  test('accepts the real shape of GET /contractor-mail-settings', () => {
    expect(settingsFromApi({ data: VALID_SUMMARY })).toEqual(VALID_SUMMARY)
  })

  test('accepts { data: null } when the company has no configuration yet, without a 404', () => {
    expect(nullableSettingsFromApi({ data: null })).toBeNull()
  })

  /**
   * Risco documentado (pedido pela task, caso `VEHICLE_DETAIL_KEYS`): ali um campo novo na API fazia
   * a tabela renderizar vazia em silêncio, 200 na rede, nada no console — porque a superfície era um
   * array de linhas e cada linha reprovada só desaparecia da lista. Aqui a superfície é um objeto
   * único, então a mesma disciplina (recusar campo a mais) produz um efeito diferente e mais seguro:
   * `ContractorMailSettingsResponseError` explícito, que o painel mostra como erro — nunca uma tela
   * vazia sem motivo aparente. Se um dia este arquivo crescer para validar um array de linhas
   * (contatos, por exemplo), o padrão do `VEHICLE_DETAIL_KEYS` vale a pena revisitar antes de copiar
   * `hasExactKeys` sem pensar na consequência do array.
   */
  test('rejects a summary with an extra field — a secret that leaked back, for instance', () => {
    expect(() => settingsFromApi({ data: { ...VALID_SUMMARY, apiKey: 're_leaked' } })).toThrow(
      ContractorMailSettingsResponseError,
    )
  })

  test('rejects a summary missing a required field', () => {
    const withoutWebhookId: Record<string, unknown> = { ...VALID_SUMMARY }
    delete withoutWebhookId.webhookId
    expect(() => settingsFromApi({ data: withoutWebhookId })).toThrow(
      ContractorMailSettingsResponseError,
    )
  })

  test('rejects an unknown status value', () => {
    expect(() => settingsFromApi({ data: { ...VALID_SUMMARY, status: 'unknown' } })).toThrow(
      ContractorMailSettingsResponseError,
    )
  })

  test('accepts the checks list in the real shape, in any order', () => {
    const checks = [
      { key: 'api_key', reason: 'ok', status: 'ok' },
      { key: 'reply_mx', reason: 'mx_absent', status: 'pending' },
    ] as const
    expect(checksFromApi({ data: checks })).toEqual(checks)
  })

  test('rejects a check item with an extra field or an unknown reason', () => {
    expect(() =>
      checksFromApi({ data: [{ key: 'api_key', reason: 'ok', status: 'ok', extra: true }] }),
    ).toThrow(ContractorMailSettingsResponseError)

    expect(() =>
      checksFromApi({ data: [{ key: 'api_key', reason: 'made_up_reason', status: 'ok' }] }),
    ).toThrow(ContractorMailSettingsResponseError)
  })

  test('accepts the 202 body of POST /contractor-mail-settings/test-email', () => {
    expect(testEmailResultFromApi({ data: { threadId: 'thread-1' } })).toEqual({
      threadId: 'thread-1',
    })
  })

  test('rejects a test email result with a field besides threadId', () => {
    expect(() => testEmailResultFromApi({ data: { threadId: 'thread-1', extra: 'x' } })).toThrow(
      ContractorMailSettingsResponseError,
    )
  })
})
