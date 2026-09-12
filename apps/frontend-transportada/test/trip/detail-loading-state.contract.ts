/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'

const DETAIL = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)
const CONSTANT = new URL('../../src/modules/trip/shared/trip.constant.ts', import.meta.url)

/**
 * Spec 137: GET /trips/:id medido em 13-15 s em viagem grande, e às vezes 503. A tela precisa
 * distinguir "carregando" de "travada" — hoje as duas telas eram iguais.
 */
describe('carregamento e falha do detalhe da viagem (spec 137)', () => {
  const source = readFileSync(DETAIL, 'utf8')
  const constants = readFileSync(CONSTANT, 'utf8')

  it('usa rótulo próprio no esqueleto do detalhe', () => {
    expect(source).toInclude("t('detail.loading')")
    expect(trip.detail.loading.toLowerCase()).toInclude('carregando')
  })

  it('avisa quando a viagem grande demora além do prazo', () => {
    expect(source).toInclude('useSlowLoadNotice')
    expect(source).toInclude('SLOW_LOAD_NOTICE_DELAY_MS')
    expect(source).toMatch(/aria-live=['"]polite['"]/u)
    expect(source).toInclude("t('detail.loadingSlow')")
  })

  /** O prazo mora no arquivo de constantes do módulo — não literal solto no componente. */
  it('declara o prazo do aviso lento como constante do módulo', () => {
    expect(constants).toMatch(/SLOW_LOAD_NOTICE_DELAY_MS\s*=\s*4000/u)
  })

  it('tem mensagem de erro própria do detalhe, distinta da lista', () => {
    expect(source).toInclude("t('detail.error')")
    expect(trip.detail.error).not.toEqual(trip.error)
  })

  /** 503 do banco (spec 137, commit b50a3952) ganha razão específica, via o código da API. */
  it('distingue a indisponibilidade do banco por código de erro', () => {
    expect(source).toInclude('DATABASE_UNAVAILABLE_ERROR_CODE')
    expect(source).toInclude("t('detail.errorUnavailable')")
  })

  it('oferece nova tentativa a partir do erro', () => {
    expect(source).toInclude("t('detail.retry')")
    expect(source).toInclude('workspace.refetchTrip()')
  })
})
