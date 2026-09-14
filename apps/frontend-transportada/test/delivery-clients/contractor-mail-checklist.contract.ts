/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import {
  contractorMailCheckKeyLocaleKey,
  contractorMailCheckReasonLocaleKey,
  contractorMailCheckStatusIcon,
  isContractorMailTestEmailButtonVisible,
  sortContractorMailChecks,
} from '../../src/modules/delivery-clients/shared/contractorMailChecklist.service'
import {
  CONTRACTOR_MAIL_CHECK_KEYS,
  CONTRACTOR_MAIL_CHECK_REASONS,
  type ContractorMailCheckItem,
} from '../../src/modules/delivery-clients/shared/contractorMailSettings.types'

const LOCALE_PATHS = [
  new URL(
    '../../src/modules/delivery-clients/locales/deliveryClients.locale.json',
    import.meta.url,
  ),
  new URL(
    '../../src/modules/delivery-clients/locales/deliveryClients.en.locale.json',
    import.meta.url,
  ),
]

function readNested(node: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) return undefined
    return (current as Record<string, unknown>)[segment]
  }, node)
}

function okItem(key: ContractorMailCheckItem['key']): ContractorMailCheckItem {
  return { key, reason: 'ok', status: 'ok' }
}

describe('contractor mail checklist service', () => {
  test('every check reason has a locale key in both locale packs', async () => {
    for (const path of LOCALE_PATHS) {
      const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
      for (const reason of CONTRACTOR_MAIL_CHECK_REASONS) {
        const localeKey = contractorMailCheckReasonLocaleKey(reason)
        const value = readNested(parsed, localeKey.split('.'))
        expect(typeof value).toBe('string')
      }
    }
  })

  test('every check key has a locale label in both locale packs', async () => {
    for (const path of LOCALE_PATHS) {
      const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
      for (const key of CONTRACTOR_MAIL_CHECK_KEYS) {
        const localeKey = contractorMailCheckKeyLocaleKey(key)
        const value = readNested(parsed, localeKey.split('.'))
        expect(typeof value).toBe('string')
      }
    }
  })

  test('sorts checks by the fixed RF12 order, regardless of the order the API serialized them', () => {
    const shuffled: readonly ContractorMailCheckItem[] = [
      okItem('test_dkim'),
      okItem('api_key'),
      okItem('webhook_received'),
      okItem('sender_domain'),
      okItem('test_replied'),
      okItem('reply_mx'),
      okItem('test_sent'),
    ]

    expect(sortContractorMailChecks(shuffled).map((item) => item.key)).toEqual([
      ...CONTRACTOR_MAIL_CHECK_KEYS,
    ])
  })

  test('maps a status to an icon for every known status', () => {
    expect(contractorMailCheckStatusIcon('ok')).toBe('check')
    expect(contractorMailCheckStatusIcon('pending')).toBe('clock')
    expect(contractorMailCheckStatusIcon('failed')).toBe('alert')
  })

  test('the test email button appears only when api_key is ok', () => {
    expect(
      isContractorMailTestEmailButtonVisible([
        { key: 'api_key', reason: 'ok', status: 'ok' },
        { key: 'sender_domain', reason: 'sender_domain_not_verified', status: 'pending' },
      ]),
    ).toBe(true)

    expect(
      isContractorMailTestEmailButtonVisible([
        { key: 'api_key', reason: 'provider_unauthorized', status: 'failed' },
      ]),
    ).toBe(false)

    expect(isContractorMailTestEmailButtonVisible([])).toBe(false)
  })
})
