/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7b (revisão HIGH-1): a prévia que o worker cria pela caixa de entrada aparece na lista e no
 * detalhe com o rótulo da origem — e SÓ com ele: ninguém clicou, então não há autor, nome nem endereço de
 * e-mail para mostrar. A prévia por envio no painel segue como antes. Dados sintéticos.
 */
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { CargoPreviewDetailScreen } from '@/modules/cargo-receiving/components/CargoPreviewDetailScreen.component'
import { CargoPreviewListPanel } from '@/modules/cargo-receiving/components/CargoPreviewListPanel.component'

import {
  buildPreviewSummary,
  PREVIEW_ID,
  PREVIEW_SECOND_ID,
} from '../fixtures/cargoPreview.fixture'
import { installCargoPreviewDouble } from './cargoPreviewHarness.helper'
import { installCargoReceivingDouble, resetLocation } from './cargoReceivingHarness.helper'
import { stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const UPLOAD = buildPreviewSummary({ id: PREVIEW_ID, source: 'upload' })
const EMAIL = buildPreviewSummary({
  fileName: 'FR-06-10.xlsx',
  id: PREVIEW_SECOND_ID,
  source: 'email',
})

const LABEL_EMAIL = 'Enviada por e-mail'
const LABEL_UPLOAD = 'Enviada no painel'

let restoreLayout: () => void = () => undefined

beforeEach(() => {
  document.body.innerHTML = ''
  restoreLayout = stubVisibleLayout()
})

afterEach(() => restoreLayout())

async function mountList() {
  resetLocation('/recebimento/previas')
  installCargoReceivingDouble()
  installCargoPreviewDouble({ previews: [UPLOAD, EMAIL] })
  const rendered = await renderWithQueryClient(
    createElement(CargoPreviewListPanel, { canManage: true }),
  )
  await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBe(2))
  return rendered
}

async function mountDetail(source: 'email' | 'upload') {
  const summary = source === 'email' ? EMAIL : UPLOAD
  resetLocation(`/recebimento/previas/${summary.id}`)
  installCargoReceivingDouble()
  installCargoPreviewDouble({ summary })
  const rendered = await renderWithQueryClient(
    createElement(CargoPreviewDetailScreen, { canManage: true, previewId: summary.id }),
  )
  await waitFor(() => expect(document.querySelectorAll('[data-item-id]').length).toBeGreaterThan(0))
  return rendered
}

const sourceBadges = () => [...document.querySelectorAll('[data-preview-source]')]

describe('a lista de prévias mostra a origem (spec 237 T4.7b)', () => {
  test('a prévia por e-mail e a por envio no painel carregam juntas, cada uma com o seu rótulo', async () => {
    const rendered = await mountList()

    const rows = [...document.querySelectorAll('tbody tr')]
    expect(rows[0]?.textContent).toContain(LABEL_UPLOAD)
    expect(rows[0]?.textContent).not.toContain(LABEL_EMAIL)
    expect(rows[1]?.textContent).toContain(LABEL_EMAIL)
    expect(rows[1]?.textContent).not.toContain(LABEL_UPLOAD)
    expect(sourceBadges().map((badge) => badge.getAttribute('data-preview-source'))).toEqual([
      'upload',
      'email',
    ])
    rendered.unmount()
  })

  test('a prévia por e-mail não expõe endereço nem autor, e continua abrindo', async () => {
    const rendered = await mountList()

    const emailRow = document.querySelectorAll('tbody tr')[1]
    expect(emailRow?.textContent).not.toContain('@')
    expect(emailRow?.textContent).toContain('FR-06-10.xlsx')
    expect(emailRow?.querySelectorAll('button').length).toBe(1)
    rendered.unmount()
  })
})

describe('o detalhe da prévia mostra a origem (spec 237 T4.7b)', () => {
  test('a prévia por e-mail abre e diz que veio por e-mail', async () => {
    const rendered = await mountDetail('email')

    expect(sourceBadges()).toHaveLength(1)
    expect(sourceBadges()[0]?.textContent).toBe(LABEL_EMAIL)
    expect(document.body.textContent).not.toContain('@')
    rendered.unmount()
  })

  test('a prévia por envio no painel segue como antes, com o rótulo da origem', async () => {
    const rendered = await mountDetail('upload')

    expect(sourceBadges()).toHaveLength(1)
    expect(sourceBadges()[0]?.textContent).toBe(LABEL_UPLOAD)
    expect(document.body.textContent).toContain('FR-05-10.xlsm')
    rendered.unmount()
  })
})
