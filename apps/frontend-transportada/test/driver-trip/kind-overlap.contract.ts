/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  DRIVER_OCCURRENCE_KINDS,
  DRIVER_RETURN_REASONS,
  driverStopOccurrenceKinds,
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
 * diferentes, e o escritório tentando reconciliar depois.
 *
 * ⚠️ **O CHECK do banco não muda**, e isso é decisão: remover valor de um CHECK quebra linha já
 * gravada, e **não foi possível medir** quantas existem — o acesso ao banco não estava disponível
 * nesta sessão. O que muda é a **fronteira do campo**: a tela deixa de oferecer a segunda porta.
 */
describe('a sobreposição entre os catálogos do campo (spec 079)', () => {
  it('a tela da parada não oferece o que é da nota', () => {
    const oferecidos = new Set(driverStopOccurrenceKinds())

    expect(oferecidos.has('damaged_goods')).toBe(false)
    expect(oferecidos.has('address_not_found')).toBe(false)
  })

  /** `customer_closed` e `establishment_closed` são o mesmo fato: fica o da devolução. */
  it('não oferece o sinônimo de estabelecimento fechado', () => {
    expect(new Set(driverStopOccurrenceKinds()).has('customer_closed')).toBe(false)
    expect(DRIVER_RETURN_REASONS).toContain('establishment_closed')
  })

  /** O que sobra é o que só a parada sabe dizer — nenhum outro catálogo o cobre. */
  it('oferece o que é mesmo da parada', () => {
    expect([...driverStopOccurrenceKinds()]).toEqual([
      'unexpected_charge',
      'long_wait',
      'dock_closed',
      'appointment_required',
      'other',
    ])
  })

  /**
   * ⚠️ A cópia por valor **continua fiel** à API: o contrato de paridade compara a lista inteira, e
   * é ela que o banco aceita. O subconjunto é escolha de tela, não de vocabulário — misturar os dois
   * faria a paridade reprovar por um motivo que não é divergência.
   */
  it('a cópia do catálogo continua completa', () => {
    for (const kind of ['damaged_goods', 'address_not_found', 'customer_closed']) {
      expect<readonly string[]>([...DRIVER_OCCURRENCE_KINDS]).toContain(kind)
    }
  })
})
