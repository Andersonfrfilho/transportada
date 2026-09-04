/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  DRIVER_OCCURRENCE_KINDS,
  DRIVER_RETURN_REASONS,
} from '@/modules/driver-trip/shared/driverTrip.types'

/**
 * ⚠️ **Três fatos tinham duas portas cada, na mesma tela.**
 *
 * `TRIP_STOP_OCCURRENCE_KINDS` nasceu para o que acontece **na parada** — espera longa, doca
 * fechada, cobrança inesperada, agendamento exigido. Junto dele entraram três que não são da
 * parada: `damaged_goods` e `address_not_found` são da **nota** (e já são motivo de devolução), e
 * `customer_closed` é o mesmo fato que `establishment_closed` com outro nome.
 *
 * O motorista via os dois caminhos e escolhia um. Dois registros do mesmo evento, com vocabulários
 * diferentes, e o escritório reconciliando depois.
 *
 * **Medido em 2026-09-03 antes de encolher**, nos dois ambientes: `trip_stop_occurrences` tinha
 * zero linhas, e produção tinha zero viagens. Sem dado para migrar, o CHECK do banco encolheu junto
 * com o catálogo — a primeira versão deste conserto mexeu só na tela, porque o acesso ao banco não
 * estava disponível, e a medição depois mostrou que dava para fechar a porta dos dois lados.
 */
describe('a sobreposição entre os catálogos do campo (spec 079)', () => {
  it('o catálogo da parada não tem o que é da nota', () => {
    const kinds = new Set<string>(DRIVER_OCCURRENCE_KINDS)

    expect(kinds.has('damaged_goods')).toBe(false)
    expect(kinds.has('address_not_found')).toBe(false)
  })

  /** `customer_closed` e `establishment_closed` eram o mesmo fato: ficou o da devolução. */
  it('não tem o sinônimo de estabelecimento fechado', () => {
    expect(new Set<string>(DRIVER_OCCURRENCE_KINDS).has('customer_closed')).toBe(false)
    expect(DRIVER_RETURN_REASONS).toContain('establishment_closed')
  })

  /** O que sobra é o que só a parada sabe dizer — nenhum outro catálogo o cobre. */
  it('tem o que é mesmo da parada', () => {
    expect([...DRIVER_OCCURRENCE_KINDS]).toEqual([
      'unexpected_charge',
      'long_wait',
      'dock_closed',
      'appointment_required',
      'other',
    ])
  })

  /**
   * ⚠️ Os três motivos de devolução **continuam**: eles nunca foram o problema. O defeito era o
   * segundo caminho para o mesmo fato, não o primeiro.
   */
  it('a devolução continua sabendo dizer os três', () => {
    expect(DRIVER_RETURN_REASONS).toContain('damaged_goods')
    expect(DRIVER_RETURN_REASONS).toContain('address_not_found')
    expect(DRIVER_RETURN_REASONS).toContain('establishment_closed')
  })
})
