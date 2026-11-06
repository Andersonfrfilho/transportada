/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { LOOKUP_REASONS } from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookup.constant'
import {
  deriveRowFlags,
  describeRowState,
  parseAccessKey,
  stateFromLookupView,
  stateFromRequestResult,
  type AccessKeyLookupRowState,
} from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookupRow.service'
import ptBr from '../../src/modules/nfe-access-key-lookup/locales/accessKeyLookup.locale.json'
import en from '../../src/modules/nfe-access-key-lookup/locales/accessKeyLookup.en.locale.json'
import { KEY_ONE, view } from './lookup.fixture'

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

function resolve(tree: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree)
}

describe('estado da linha da busca por chave', () => {
  it('lê número, série e emitente das posições da chave', () => {
    expect(parseAccessKey(KEY_ONE)).toEqual({
      federalUnitCode: '35',
      issuedMonth: '05/2008',
      issuerTaxId: '99999090910270',
      model: '55',
      number: '1',
      series: '1',
    })
  })

  it('mapeia cada status da API para um estado da linha', () => {
    expect(stateFromLookupView(view({ status: 'queued' }))).toEqual({
      kind: 'searching',
      status: 'queued',
    })
    expect(stateFromLookupView(view({ status: 'querying' }))).toEqual({
      kind: 'searching',
      status: 'querying',
    })
    expect(
      stateFromLookupView(view({ notBefore: '2026-11-06T15:30:00Z', status: 'waiting' })),
    ).toEqual({
      kind: 'waiting',
      notBefore: '2026-11-06T15:30:00Z',
    })
    expect(stateFromLookupView(view({ documentId: 'doc-1', status: 'imported' }))).toEqual({
      documentId: 'doc-1',
      kind: 'ready',
    })
    expect(stateFromLookupView(view({ reason: 'summary_only', status: 'refused' }))).toEqual({
      kind: 'refused',
      reason: 'summary_only',
    })
    expect(stateFromLookupView(view({ reason: 'sefaz_unavailable', status: 'failed' }))).toEqual({
      kind: 'failed',
      reason: 'sefaz_unavailable',
    })
  })

  it('importada sem documento e recusada sem motivo viram erro de resposta, nunca linha pronta', () => {
    expect(stateFromLookupView(view({ status: 'imported' })).kind).toBe('error')
    expect(stateFromLookupView(view({ status: 'refused' })).kind).toBe('error')
    expect(stateFromLookupView(view({ status: 'failed' })).kind).toBe('error')
  })

  it('nota já cadastrada no POST vira pronta', () => {
    expect(stateFromRequestResult({ documentId: 'doc-9', kind: 'found' })).toEqual({
      documentId: 'doc-9',
      kind: 'ready',
    })
  })

  it('só a linha pronta pode ser acrescentada', () => {
    const states: AccessKeyLookupRowState[] = [
      { kind: 'checking' },
      { kind: 'searching', status: 'queued' },
      { kind: 'waiting', notBefore: null },
      { kind: 'refused', reason: 'summary_only' },
      { kind: 'failed', reason: 'not_found' },
      { code: 'X', kind: 'error' },
      { kind: 'stalled' },
    ]
    for (const state of states) expect(deriveRowFlags(state).canAdd).toBe(false)
    expect(deriveRowFlags({ documentId: 'd', kind: 'ready' }).canAdd).toBe(true)
  })

  it('enviar XML vale para todo motivo, menos cancelada e denegada', () => {
    for (const reason of LOOKUP_REASONS) {
      const blocked = reason === 'cancelled' || reason === 'denied'
      expect(deriveRowFlags({ kind: 'refused', reason }).canSendXml).toBe(!blocked)
      expect(deriveRowFlags({ kind: 'failed', reason }).canSendXml).toBe(!blocked)
    }
    expect(deriveRowFlags({ documentId: 'd', kind: 'ready' }).canSendXml).toBe(false)
    expect(deriveRowFlags({ kind: 'searching', status: 'queued' }).canSendXml).toBe(false)
  })

  it('tentar de novo vale para indisponibilidade, erro de pedido e busca que passou de 10 min', () => {
    expect(deriveRowFlags({ kind: 'failed', reason: 'sefaz_unavailable' }).canRetry).toBe(true)
    expect(deriveRowFlags({ kind: 'failed', reason: 'not_found' }).canRetry).toBe(false)
    expect(deriveRowFlags({ kind: 'refused', reason: 'sefaz_unavailable' }).canRetry).toBe(false)
    expect(deriveRowFlags({ code: 'X', kind: 'error' }).canRetry).toBe(true)
    expect(deriveRowFlags({ kind: 'stalled' }).canRetry).toBe(true)
    expect(deriveRowFlags({ kind: 'refused', reason: 'summary_only' }).canRetry).toBe(false)
  })

  it('há texto pt-BR e en para cada motivo, cada erro conhecido e cada estado', () => {
    const states: AccessKeyLookupRowState[] = [
      ...LOOKUP_REASONS.flatMap((reason): AccessKeyLookupRowState[] => [
        { kind: 'refused', reason },
        { kind: 'failed', reason },
      ]),
      { code: 'RATE_LIMITED', kind: 'error' },
      { code: 'CODIGO_DESCONHECIDO', kind: 'error' },
      { kind: 'stalled' },
    ]
    for (const state of states) {
      const key = describeRowState(state)
      expect(key).toBeDefined()
      expect(typeof resolve(ptBr, key as string)).toBe('string')
      expect(typeof resolve(en, key as string)).toBe('string')
    }
    expect(describeRowState({ code: 'CODIGO_DESCONHECIDO', kind: 'error' })).toBe('error.generic')
    expect(flatten(ptBr).sort()).toEqual(flatten(en).sort())
  })

  it('o motivo da API que a pessoa mais lê tem a frase combinada', () => {
    expect(ptBr.reason.not_interested).toBe(
      'A SEFAZ não libera esta nota para a transportadora (ela não consta na nota). Envie o XML.',
    )
    expect(ptBr.reason.summary_only).toBe('A SEFAZ só liberou o resumo desta nota. Envie o XML.')
  })
})
