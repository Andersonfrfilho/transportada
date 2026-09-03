/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'

const ROW = new URL('../../src/modules/trip/components/TripStopList.component.tsx', import.meta.url)

/**
 * Spec 079 P2. O dado **já vem na nota** — `<enderDest><fone>` está em `nfe_addresses.phone` desde
 * a spec 013 — e o uso é operacional: quem entrega avisa que chegou, quem atende retorna a ligação.
 */
describe('contato do cliente e contratante na entrega (spec 079 P2)', () => {
  const source = readFileSync(ROW, 'utf8')

  it('mostra quem recebe e o contratante na linha da nota', () => {
    expect(source).toInclude('document.contact')
    expect(trip.contact.recipient).toInclude('{{name}}')
    expect(trip.contact.contractor).toInclude('{{name}}')
  })

  /**
   * ⚠️ **Nota sem telefone diz que não tem.** Esconder a linha faria o operador procurar o número
   * em outra tela; imprimir vazio faria ele tentar ligar para o nada.
   */
  it('diz quando a nota não trouxe telefone', () => {
    expect(source).toInclude("t('contact.withoutPhone')")
    expect(trip.contact.withoutPhone.toLowerCase()).toInclude('sem telefone')
  })

  /**
   * ⚠️ O telefone fica **no detalhe da viagem e em nenhum outro lugar**: não vai para listagem, nem
   * para relatório, nem para canal automático. É o que mantém o uso dentro do que se declarou.
   */
  it('o telefone não vaza para a tabela de viagens', () => {
    const table = readFileSync(
      new URL('../../src/modules/trip/components/TripTable.component.tsx', import.meta.url),
      'utf8',
    )

    expect(table).not.toInclude('contact')
  })
})
