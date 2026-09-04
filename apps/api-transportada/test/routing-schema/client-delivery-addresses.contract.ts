/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  buildClientStreetKey,
  resolveClientAddress,
} from '../../src/addresses/domain/client-address-key.js'
import { clientDeliveryAddresses } from '../../src/database/database.schema.js'

const uniqueColumns = (name: string): readonly string[] =>
  getTableConfig(clientDeliveryAddresses)
    .uniqueConstraints.find((constraint) => constraint.name === name)
    ?.columns.map((column) => column.name) ?? []

describe('agenda de endereços por cliente (spec 084, P5)', () => {
  /**
   * ⚠️ **O aceite da T02.** A parada agrupa por endereço e **não** por CNPJ de propósito: *"a mesma
   * rede em cinco lojas é cinco paradas"*. Se a chave fosse só o cliente, as cinco lojas virariam
   * uma e o caminhão entregaria tudo na primeira — defeito pior que o atual, porque teria cara de
   * melhoria.
   */
  test('não colapsa duas lojas do mesmo cliente: o lugar entra na chave', () => {
    const columns = uniqueColumns('client_delivery_addresses_client_place_unique')

    expect(columns).toEqual([
      'company_id',
      'client_tax_id',
      'city_code',
      'address_number',
      'street_key',
    ])
  })

  /**
   * ⚠️ **A rua está no unique de propósito.** Medido nesta base, três casos de mesma cidade e mesmo
   * número com CEPs diferentes ("PORTO FERREIRA nº 25" tem três) — sem o eixo da rua, duas lojas do
   * mesmo cliente no mesmo número seriam recusadas pelo banco. Recusar cadastro legítimo é tão
   * errado quanto colapsar dois lugares num.
   */
  test('deixa duas lojas no mesmo número coexistirem, em ruas diferentes', () => {
    const loja = (street: string) => buildClientStreetKey(street)

    expect(loja('RUA DAS FLORES')).not.toEqual(loja('AVENIDA BRASIL'))
    expect(uniqueColumns('client_delivery_addresses_client_place_unique')).toContain('street_key')
  })

  /**
   * ⚠️ **Canonicalização, não semelhança.** Medido: casar nome de rua por distância de edição deu
   * 14% de acerto **com falsos positivos** mandando `RUA 02` para `Rua 12`. Aqui só se colapsa o que
   * é indiscutivelmente a mesma escrita — tipo de via, acento e pontuação.
   */
  test('colapsa tipo de via, acento e pontuação — e nada além disso', () => {
    expect(buildClientStreetKey('R. Dr. Matta')).toBe(buildClientStreetKey('RUA DR MATTA'))
    expect(buildClientStreetKey('Av. Brasil')).toBe(buildClientStreetKey('AVENIDA BRASIL'))
    expect(buildClientStreetKey('Travessa São João')).toBe(buildClientStreetKey('TV SAO JOAO'))

    /** ⚠️ Rua numerada difere por um caractere e é outro lugar. Nunca colapsar. */
    expect(buildClientStreetKey('RUA 02')).not.toBe(buildClientStreetKey('RUA 12'))
    expect(buildClientStreetKey('RUA 7 DE SETEMBRO')).not.toBe(buildClientStreetKey('RUA 5'))
    /** E `MATTA` não é `MATA`: duas grafias viram duas linhas, e a consulta trata como ambíguo. */
    expect(buildClientStreetKey('R DR. MATTA')).not.toBe(buildClientStreetKey('RUA DR MATA'))
  })

  test('endereço nunca visto é ausência, não palpite', () => {
    expect(resolveClientAddress({ candidates: [], streetKey: 'BRASIL' })).toEqual({
      outcome: 'unknown',
    })
  })

  test('candidata única resolve, mesmo com a rua grafada de outro jeito', () => {
    const match = resolveClientAddress({
      candidates: [{ addressKey: '3540705|13660328|25', streetKey: 'EMILIO MALAMAN' }],
      streetKey: 'EMILIO MALLAMAN',
    })

    expect(match).toEqual({ addressKey: '3540705|13660328|25', outcome: 'resolved' })
  })

  /**
   * ⚠️ **Candidato ambíguo não se aplica sozinho.** Com duas ruas gravadas para o mesmo cliente,
   * cidade e número, escolher uma manda o caminhão para a outra. Vai ao relatório, não vira
   * coordenada.
   */
  test('duas ruas para o mesmo lugar não viram coordenada', () => {
    const match = resolveClientAddress({
      candidates: [
        { addressKey: 'a', streetKey: 'DAS FLORES' },
        { addressKey: 'b', streetKey: 'BRASIL' },
      ],
      streetKey: 'OUTRA COISA',
    })

    expect(match.outcome).toBe('ambiguous')
  })

  /** Havendo duas candidatas, a rua que bate exatamente desempata — aí não há dúvida. */
  test('a rua exata desempata entre duas candidatas', () => {
    const match = resolveClientAddress({
      candidates: [
        { addressKey: 'a', streetKey: 'DAS FLORES' },
        { addressKey: 'b', streetKey: 'BRASIL' },
      ],
      streetKey: 'BRASIL',
    })

    expect(match).toEqual({ addressKey: 'b', outcome: 'resolved' })
  })
})
