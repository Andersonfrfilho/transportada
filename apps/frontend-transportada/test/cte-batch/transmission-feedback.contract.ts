/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './cte-batch.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const QUEUE_MODULE = '../../src/modules/cte-batch/shared/cteBatchSubmissionQueue.service'
const BATCH_SELECTION_BAR_PATH =
  'src/modules/cte-batch/components/CteBatchSelectionBar.component.tsx'
const ITEM_SELECTION_BAR_PATH = 'src/modules/cte-batch/components/CteItemSelectionBar.component.tsx'
const ITEM_TABLE_HOOK_PATH = 'src/modules/cte-batch/hooks/useCteItemTable.hook.ts'
const LOCALE_PATH = 'src/modules/cte-batch/locales/cteBatch.locale.json'
const ENGLISH_LOCALE_PATH = 'src/modules/cte-batch/locales/cteBatch.en.locale.json'

type CteBatchSubmissionQueueModule = {
  readonly CTE_BATCH_SUBMISSION_REASON_KEYS: Readonly<Record<string, string>>
  readonly CTE_BATCH_SUBMISSION_UNKNOWN_REASON_KEY: string
  readonly resolveCteBatchSubmissionReasonKey: (errorCode: string) => string
}

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readApplicationJson(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json() as Promise<Record<string, unknown>>
}

function readLocaleEntry(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) return undefined
    return (current as Record<string, unknown>)[segment]
  }, locale)
}

function loadQueueModule(): Promise<CteBatchSubmissionQueueModule> {
  return loadFutureModule<CteBatchSubmissionQueueModule>(QUEUE_MODULE)
}

describe('CT-e transmission feedback contract', () => {
  /**
   * A tela mostrava o código cru da API. Quem opera precisa do motivo — o código continua
   * disponível para suporte, mas não é mais a única coisa exibida.
   */
  test('maps every transmission failure the API can return to its own message key', async () => {
    const queue = await loadQueueModule()

    for (const code of [
      'CTE_BATCH_INVALID_STATE',
      'CTE_BATCH_NOT_FOUND',
      'CTE_ISSUANCE_ALREADY_IN_FLIGHT',
      'CTE_ISSUANCE_EMITTER_INCOMPLETE',
      'CTE_ISSUANCE_FISCAL_SEQUENCE_MISSING',
      'CTE_ISSUANCE_REQUEST_UNCONFIRMED',
      'CTE_PROFILE_FREIGHT_RULE_VERSION_MISSING',
      'FORBIDDEN',
      'IDEMPOTENCY_KEY_REUSED',
      'IDENTITY_SESSION_EXPIRED',
      'UNAUTHENTICATED',
    ]) {
      const key = queue.resolveCteBatchSubmissionReasonKey(code)

      expect(key).toBe(queue.CTE_BATCH_SUBMISSION_REASON_KEYS[code] as string)
      expect(key).not.toBe(queue.CTE_BATCH_SUBMISSION_UNKNOWN_REASON_KEY)
    }
  })

  test('falls back to the unknown reason without losing the raw code', async () => {
    const queue = await loadQueueModule()

    expect(queue.resolveCteBatchSubmissionReasonKey('CTE_SOMETHING_NEW')).toBe(
      queue.CTE_BATCH_SUBMISSION_UNKNOWN_REASON_KEY,
    )
    expect(queue.resolveCteBatchSubmissionReasonKey('')).toBe(
      queue.CTE_BATCH_SUBMISSION_UNKNOWN_REASON_KEY,
    )

    const locale = await readApplicationJson(LOCALE_PATH)

    expect(
      String(readLocaleEntry(locale, queue.CTE_BATCH_SUBMISSION_UNKNOWN_REASON_KEY)),
    ).toContain('{{code}}')
  })

  test('carries every reason in both locales', async () => {
    const queue = await loadQueueModule()
    const [locale, englishLocale] = await Promise.all([
      readApplicationJson(LOCALE_PATH),
      readApplicationJson(ENGLISH_LOCALE_PATH),
    ])
    const keys = [
      ...Object.values(queue.CTE_BATCH_SUBMISSION_REASON_KEYS),
      queue.CTE_BATCH_SUBMISSION_UNKNOWN_REASON_KEY,
    ]

    for (const key of keys) {
      expect(typeof readLocaleEntry(locale, key)).toBe('string')
      expect(String(readLocaleEntry(locale, key)).length).toBeGreaterThan(0)
      expect(typeof readLocaleEntry(englishLocale, key)).toBe('string')
    }
  })

  /**
   * `CTE_ISSUANCE_REQUEST_UNCONFIRMED` é POST idempotente sem resposta: pode ter sido aplicado.
   * O texto não pode afirmar que falhou.
   */
  test('describes an unconfirmed write as unknown, never as failed', async () => {
    const queue = await loadQueueModule()
    const locale = await readApplicationJson(LOCALE_PATH)
    const key = queue.resolveCteBatchSubmissionReasonKey('CTE_ISSUANCE_REQUEST_UNCONFIRMED')
    const message = String(readLocaleEntry(locale, key)).toLowerCase()

    expect(message).toContain('confir')
    expect(message).not.toContain('falh')
    expect(message).not.toContain('envi')
  })

  test('renders the reason beside the batch name in both selection bars', async () => {
    const [batchSelectionBar, itemSelectionBar, itemTableHook, locale] = await Promise.all([
      readApplicationFile(BATCH_SELECTION_BAR_PATH),
      readApplicationFile(ITEM_SELECTION_BAR_PATH),
      readApplicationFile(ITEM_TABLE_HOOK_PATH),
      readApplicationJson(LOCALE_PATH),
    ])
    const failedTemplate = String(readLocaleEntry(locale, 'transmission.progress.failed'))

    expect(failedTemplate).toContain('{{reason}}')
    expect(failedTemplate).not.toContain('{{code}}')
    expect(batchSelectionBar).toContain('resolveCteBatchSubmissionReasonKey')
    // A aba de CT-es falhava em silêncio: a transmissão de lá também precisa dizer o motivo.
    expect(itemTableHook).toContain('transmitErrorCode')
    expect(itemSelectionBar).toContain('resolveCteBatchSubmissionReasonKey')
    expect(itemSelectionBar).toContain('transmitErrorCode')
  })
})
