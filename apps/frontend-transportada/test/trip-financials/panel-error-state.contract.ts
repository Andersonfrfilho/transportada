/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import tripFinancials from '../../src/modules/trip-financials/locales/tripFinancials.locale.json'

const PANEL = new URL(
  '../../src/modules/trip-financials/components/TripFinancialPanel.component.tsx',
  import.meta.url,
)
const HOOK = new URL(
  '../../src/modules/trip-financials/hooks/useTripFinancials.hook.ts',
  import.meta.url,
)
const PAGE = new URL('../../src/modules/trip/pages/TripDetail.page.tsx', import.meta.url)

/**
 * Spec 137: GET /trips/:id (e as consultas de conta que dependem dela) podem falhar — e o painel
 * respondia com `panel.notFrozen`, uma mensagem de sucesso disfarçada. Falha vira falha, com nova
 * tentativa.
 */
describe('falha da conta da viagem (spec 137)', () => {
  const panel = readFileSync(PANEL, 'utf8')
  const hook = readFileSync(HOOK, 'utf8')
  const page = readFileSync(PAGE, 'utf8')

  it('o hook expõe o erro de qualquer uma das duas consultas', () => {
    expect(hook).toInclude('isError: result.isError || valuation.isError')
  })

  it('o hook refaz as duas consultas numa só chamada', () => {
    expect(hook).toMatch(/refetch\(\)\s*\{/u)
    expect(hook).toInclude('result.refetch()')
    expect(hook).toInclude('valuation.refetch()')
  })

  it('o painel mostra erro em vez da mensagem de sucesso quando a consulta falha', () => {
    expect(panel).toInclude('isError')
    expect(panel).toInclude("t('panel.error')")
    expect(panel).not.toMatch(/if \(isError\)[\s\S]{0,40}notFrozen/u)
  })

  it('oferece nova tentativa a partir do erro', () => {
    expect(panel).toInclude('onRetry')
    expect(panel).toInclude("t('panel.retry')")
  })

  it('a mensagem de erro é distinta da de sucesso sem congelamento', () => {
    expect(tripFinancials.panel.error).not.toEqual(tripFinancials.panel.notFrozen)
  })

  it('a página liga o erro e a nova tentativa do hook ao painel', () => {
    expect(page).toInclude('isError={financials.isError}')
    expect(page).toInclude('onRetry={financials.refetch}')
  })
})
