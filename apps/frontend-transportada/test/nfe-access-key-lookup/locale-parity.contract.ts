/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 298 T3.4: os textos da busca por chave e da importação por bip existem em pt-BR e em inglês,
 * com as mesmas chaves, e cobrem todo estado, motivo e código de erro que a tela mapeia.
 */
import { describe, expect, test } from 'bun:test'

import accessKeyLookupEn from '../../src/modules/nfe-access-key-lookup/locales/accessKeyLookup.en.locale.json'
import accessKeyLookupPt from '../../src/modules/nfe-access-key-lookup/locales/accessKeyLookup.locale.json'
import { LOOKUP_REASONS } from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookup.constant'
import nfeWorkspaceEn from '../../src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'
import nfeWorkspacePt from '../../src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'
import keyReaderEn from '../../src/modules/shared/locales/keyReader.en.locale.json'
import keyReaderPt from '../../src/modules/shared/locales/keyReader.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'
import tripPt from '../../src/modules/trip/locales/trip.locale.json'

type LocaleTree = { readonly [key: string]: string | LocaleTree }

const LOOKUP_BADGE_KINDS = [
  'checking',
  'searching',
  'waiting',
  'ready',
  'refused',
  'failed',
  'error',
  'stalled',
] as const

const LOOKUP_ERROR_CODES = [
  'INVALID_ACCESS_KEY',
  'NFE_DISTRIBUTION_NOT_CONFIGURED',
  'NFE_ACCESS_KEY_LOOKUP_CONFLICT',
  'NFE_ACCESS_KEY_LOOKUP_QUEUE_FULL',
  'RATE_LIMITED',
] as const

const BIPPED_TRIP_KEYS = [
  'quickCreate.addAllReady',
  'quickCreate.bipped',
  'quickCreate.bippedDocumentFailed',
  'quickCreate.bippedRetry',
  'quickCreate.foundNotes',
  'quickCreate.reader.field',
  'quickCreate.reader.idle',
  'quickCreate.reader.ready',
  'quickCreate.refusal.alreadyOnTrip',
  'quickCreate.refusal.notAuthorized',
  'quickCreate.scan',
  'quickCreate.xml.action',
  'quickCreate.xml.failed',
  'quickCreate.xml.field',
  'quickCreate.xml.notImported',
  'quickCreate.xml.placeholder',
  'detail.scan',
  'detail.scanClose',
  'detail.scanDenied',
  'detail.scanReading',
  'detail.scanStarting',
  'detail.scanTitle',
  'detail.scanUnavailable',
] as const

const LOOKUP_KEYS = [
  ...LOOKUP_BADGE_KINDS.map((kind) => `badge.${kind}`),
  ...LOOKUP_REASONS.map((reason) => `reason.${reason}`),
  ...LOOKUP_ERROR_CODES.map((code) => `error.${code}`),
  'error.generic',
]

const IMPORT_KEYS = [
  ...LOOKUP_REASONS.map((reason) => `reason.${reason}`),
  'xml.failed',
  'xml.notImported',
]

function flatten(tree: LocaleTree, prefix = ''): readonly (readonly [string, string])[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[`${prefix}${key}`, value] as const]
      : flatten(value, `${prefix}${key}.`),
  )
}

function keysOf(tree: LocaleTree): readonly string[] {
  return flatten(tree)
    .map(([key]) => key)
    .sort()
}

function asLocaleTree(value: unknown): LocaleTree {
  if (typeof value !== 'object' || value === null) throw new TypeError('árvore de locale esperada')
  for (const child of Object.values(value)) if (typeof child !== 'string') asLocaleTree(child)
  return value as LocaleTree
}

const LOCALE_PAIRS = [
  { name: 'accessKeyLookup', pt: asLocaleTree(accessKeyLookupPt), en: asLocaleTree(accessKeyLookupEn) },
  { name: 'keyReader', pt: asLocaleTree(keyReaderPt), en: asLocaleTree(keyReaderEn) },
  {
    name: 'nfeWorkspace.accessKeyImport',
    pt: asLocaleTree(nfeWorkspacePt.accessKeyImport),
    en: asLocaleTree(nfeWorkspaceEn.accessKeyImport),
  },
  {
    name: 'trip (quickCreate e detail do bip)',
    pt: asLocaleTree({ detail: tripPt.detail, quickCreate: tripPt.quickCreate }),
    en: asLocaleTree({ detail: tripEn.detail, quickCreate: tripEn.quickCreate }),
  },
]

describe('textos da busca por chave e da importação por bip (spec 298 T3.4)', () => {
  for (const { name, pt, en } of LOCALE_PAIRS) {
    test(`${name}: pt-BR e inglês têm as mesmas chaves, nenhuma vazia`, () => {
      expect(keysOf(pt)).toEqual(keysOf(en))
      for (const [key, value] of [...flatten(pt), ...flatten(en)])
        expect([key, value.trim() === '']).toEqual([key, false])
    })
  }

  test.each(['pt', 'en'] as const)('accessKeyLookup (%s) cobre estados, motivos e erros', (language) => {
    const keys = keysOf(language === 'pt' ? accessKeyLookupPt : accessKeyLookupEn)
    for (const key of LOOKUP_KEYS) expect(keys).toContain(key)
  })

  test.each(['pt', 'en'] as const)('keyReader (%s) tem os três rótulos do leitor', (language) => {
    const keys = keysOf(language === 'pt' ? keyReaderPt : keyReaderEn)
    expect(keys).toEqual(['field', 'idle', 'ready'])
  })

  test.each(['pt', 'en'] as const)('nfeWorkspace.accessKeyImport (%s) cobre motivos e XML', (language) => {
    const block = language === 'pt' ? nfeWorkspacePt.accessKeyImport : nfeWorkspaceEn.accessKeyImport
    const keys = keysOf(block)
    for (const key of IMPORT_KEYS) expect(keys).toContain(key)
  })

  test.each(['pt', 'en'] as const)('trip do bip (%s) cobre as chaves usadas pelo componente', (language) => {
    const tree = language === 'pt' ? tripPt : tripEn
    const keys = keysOf({ detail: tree.detail, quickCreate: tree.quickCreate })
    for (const key of BIPPED_TRIP_KEYS) expect(keys).toContain(key)
  })

  test('as frases exigidas pela spec estão em pt-BR, literais', () => {
    expect(accessKeyLookupPt.reason.not_interested).toBe(
      'A SEFAZ não libera esta nota para a transportadora (ela não consta na nota). Envie o XML.',
    )
    expect(accessKeyLookupPt.reason.summary_only).toBe(
      'A SEFAZ só liberou o resumo desta nota. Envie o XML.',
    )
  })
})
