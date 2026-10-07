/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  isCargoPreviewRetentionDue,
  resolveCargoPreviewRetentionCutoff,
} from '../../src/cargo-preview-retention/domain/cargo-preview-retention.policy.js'
import {
  CARGO_PREVIEW_EVENT_KIND,
  CARGO_PREVIEW_EVENT_KINDS,
  CARGO_PREVIEW_OPEN_ITEM_STATES,
  CARGO_PREVIEW_RETENTION_DAYS,
  CARGO_PREVIEW_WIDE_EVENT_KINDS,
} from '../../src/shared/cargo-preview.constant.js'

const NOW = new Date('2026-12-31T12:00:00.000Z')
const DAY_MS = 86_400_000

describe('o prazo da retenção dos dados da planilha (spec 237 T4.8)', () => {
  test('o prazo é de 90 dias, decisão do usuário, numa constante nomeada', () => {
    expect(CARGO_PREVIEW_RETENTION_DAYS).toBe(90)
  })

  test('o corte é exatamente 90 dias antes do relógio injetado', () => {
    expect(resolveCargoPreviewRetentionCutoff(NOW).getTime()).toBe(NOW.getTime() - 90 * DAY_MS)
  })

  test('90 dias completos vencem; 89 dias e 23h59 ainda não', () => {
    const exact = new Date(NOW.getTime() - 90 * DAY_MS)
    const oneMillisecondShort = new Date(exact.getTime() + 1)
    const eightyNine = new Date(NOW.getTime() - 89 * DAY_MS)
    const ninetyOne = new Date(NOW.getTime() - 91 * DAY_MS)

    expect(isCargoPreviewRetentionDue({ now: NOW, referenceAt: exact })).toBe(true)
    expect(isCargoPreviewRetentionDue({ now: NOW, referenceAt: ninetyOne })).toBe(true)
    expect(isCargoPreviewRetentionDue({ now: NOW, referenceAt: oneMillisecondShort })).toBe(false)
    expect(isCargoPreviewRetentionDue({ now: NOW, referenceAt: eightyNine })).toBe(false)
  })

  test('a política nunca lê o relógio do sistema', () => {
    const source = readFileSync(
      new URL(
        '../../src/cargo-preview-retention/domain/cargo-preview-retention.policy.ts',
        import.meta.url,
      ),
      'utf8',
    )
    expect(source).not.toContain('new Date()')
    expect(source).not.toContain('Date.now')
  })

  test('em aberto são exatamente os três estados que esperam decisão', () => {
    expect([...CARGO_PREVIEW_OPEN_ITEM_STATES].sort()).toEqual([
      'ambiguous',
      'awaiting_xml',
      'suggested',
    ])
  })

  test('o evento de retenção é da prévia inteira, sem item', () => {
    expect(CARGO_PREVIEW_EVENT_KIND.retentionApplied).toBe('retention_applied')
    expect(CARGO_PREVIEW_EVENT_KINDS).toContain('retention_applied')
    expect(CARGO_PREVIEW_WIDE_EVENT_KINDS).toContain('retention_applied')
  })

  test('a lista de eventos da API é a mesma, valor por valor, e a retenção está nela', () => {
    const source = readFileSync(
      new URL('../../../api-transportada/src/shared/cargo-preview.constant.ts', import.meta.url),
      'utf8',
    )
    expect(source).toContain("retentionApplied: 'retention_applied',")
    expect(source).toContain('CARGO_PREVIEW_EVENT_KIND.retentionApplied,')
  })
})
