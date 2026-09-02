/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { VEHICLE_TYPES } from '../../src/shared/vehicle-type.constant.js'
import {
  VEHICLE_CAPACITY_SOURCE,
  resolveVehicleCapacity,
  resolveVolumeReferenceKey,
} from '../../src/fleet/domain/vehicle-capacity.policy.js'

/** O Fiorino da frota real: 1,70 × 1,30 × 1,40. */
const DIMENSOES = { cargoHeightM: '1.400', cargoLengthM: '1.700', cargoWidthM: '1.300' }
const SEM_DIMENSOES = { cargoHeightM: null, cargoLengthM: null, cargoWidthM: null }

describe('capacidade do veículo (spec 075 RF3)', () => {
  /**
   * O primeiro degrau, e o único que é medida: quem mediu o baú sabe mais que qualquer tabela.
   * ⚠️ O m³ é **derivado** — o valor publicado da carreta erra 3,1% contra as próprias medidas.
   */
  test('as dimensões da ficha vencem, e o m³ sai delas', () => {
    const resolved = resolveVehicleCapacity({
      ...DIMENSOES,
      capacityM3: '99.00',
      referenceM3: '3.090000',
    })

    expect(resolved).toEqual({ capacityM3: '3.094000', source: VEHICLE_CAPACITY_SOURCE.measured })
  })

  /** Veículo antigo tem o m³ na ficha e não tem as medidas: ele continua valendo. */
  test('sem dimensões, vale o m³ da ficha', () => {
    const resolved = resolveVehicleCapacity({
      ...SEM_DIMENSOES,
      capacityM3: '12.00',
      referenceM3: '10.030000',
    })

    expect(resolved).toEqual({ capacityM3: '12.000000', source: VEHICLE_CAPACITY_SOURCE.declared })
  })

  /**
   * A referência é o **último** degrau, e é palpite: a dispersão por tipo chega a 2× — VUC existe
   * de 13 e de 26 m³. Por isso ela nunca vence a ficha, e a origem viaja para a tela dizer isso.
   */
  test('sem dimensões e sem m³ na ficha, cai na referência do tipo', () => {
    const resolved = resolveVehicleCapacity({
      ...SEM_DIMENSOES,
      capacityM3: '0.00',
      referenceM3: '13.167000',
    })

    expect(resolved).toEqual({ capacityM3: '13.167000', source: VEHICLE_CAPACITY_SOURCE.reference })
  })

  /** ⚠️ Sem os três degraus é ausência — nunca zero, que a tela leria como baú sem espaço. */
  test('sem nenhum dos três, não há capacidade', () => {
    expect(
      resolveVehicleCapacity({ ...SEM_DIMENSOES, capacityM3: '0.00', referenceM3: null }),
    ).toBeNull()
  })

  /** Dimensão incompleta não estima: duas medidas e um palpite não são um volume. */
  test('dimensão pela metade não vira volume', () => {
    const resolved = resolveVehicleCapacity({
      cargoHeightM: null,
      cargoLengthM: '1.700',
      cargoWidthM: '1.300',
      capacityM3: '3.00',
      referenceM3: null,
    })

    expect(resolved?.source).toBe(VEHICLE_CAPACITY_SOURCE.declared)
  })

  /** Medida zerada é ausência de medida, não baú de volume zero. */
  test('dimensão zerada não vira volume zero', () => {
    const resolved = resolveVehicleCapacity({
      cargoHeightM: '0.000',
      cargoLengthM: '1.700',
      cargoWidthM: '1.300',
      capacityM3: '0.00',
      referenceM3: '3.090000',
    })

    expect(resolved?.source).toBe(VEHICLE_CAPACITY_SOURCE.reference)
  })

  /** As três origens, e nada além: um estado a mais é uma tela que não sabe o que imprimir. */
  test('tem três origens', () => {
    expect(Object.values(VEHICLE_CAPACITY_SOURCE)).toEqual(['measured', 'declared', 'reference'])
  })
})

describe('a chave da referência de cubagem (spec 075 D2b)', () => {
  /**
   * ⚠️ O teste que a task 🧠 exige. Um cavalo mecânico com carreta acoplada: **a carga vai na
   * carreta**, e é a linha dela que responde. O cavalo não tem baú.
   *
   * No nosso modelo o implemento tem `vehicle_type` **vazio** — o tipo pertence a quem traciona —,
   * então a linha da carreta é `('', '02')`, nunca `('tractor_unit', …)`. Indexar por
   * `vehicle_type` sozinho faria o cavalo responder pela capacidade de uma carga que ele não leva.
   */
  test('com carreta acoplada, quem responde é a carreta', () => {
    const cavalo = { bodyType: '00', role: 'traction' as const, vehicleType: 'tractor_unit' }
    const carreta = { bodyType: '02', role: 'trailer' as const, vehicleType: '' }

    expect(resolveVolumeReferenceKey({ traction: cavalo, trailer: carreta })).toEqual({
      bodyType: '02',
      vehicleType: '',
    })
  })

  /** Sider é `05`, não `04` — `04` é porta container. O `tpCar` do MDF-e está no fleet.schema. */
  test('a carreta sider tem chave própria', () => {
    expect(
      resolveVolumeReferenceKey({
        traction: { bodyType: '00', role: 'traction', vehicleType: 'tractor_unit' },
        trailer: { bodyType: '05', role: 'trailer', vehicleType: '' },
      }),
    ).toEqual({ bodyType: '05', vehicleType: '' })
  })

  /** Sem implemento, quem carrega é o próprio veículo — o caso de toda a frota real de hoje. */
  test('sem carreta, responde o veículo que traciona', () => {
    expect(
      resolveVolumeReferenceKey({
        traction: { bodyType: '02', role: 'traction', vehicleType: 'utility' },
        trailer: null,
      }),
    ).toEqual({ bodyType: '02', vehicleType: 'utility' })
  })

  /** `three_quarter` não está na lista do cliente: entra sem referência, e sem ela não há ocupação. */
  test('tipo sem referência devolve a chave mesmo assim, e quem não acha decide', () => {
    expect(
      resolveVolumeReferenceKey({
        traction: { bodyType: '02', role: 'traction', vehicleType: 'three_quarter' },
        trailer: null,
      }),
    ).toEqual({ bodyType: '02', vehicleType: 'three_quarter' })
  })
})

describe('a referência cobre o catálogo (spec 075 T008)', () => {
  /**
   * ⚠️ Não é paridade entre apps: a referência é **dado de servidor**, e o frontend não a carrega.
   * O que precisa ser cobrado é outra coisa — que o catálogo e a semente não divirjam em silêncio.
   *
   * Tipo novo em `VEHICLE_TYPES` sem linha de referência **e sem estar nomeado aqui** faz a
   * ocupação sumir para aquele veículo, sem erro nenhum. Esta lista é a decisão, por extenso.
   */
  const SEM_REFERENCIA: readonly string[] = [
    /** Não carregam carga paletizada; ocupação em m³ não os descreve. */
    'motorcycle',
    'car',
    /** Quem traciona não tem baú: quem responde é o implemento (D2b). */
    'tractor_unit',
    /** Escapatória do catálogo — por definição sem dimensão conhecida. */
    'other',
    /** ⚠️ Existe no nosso catálogo e não está na tabela do cliente. Entra sem referência. */
    'three_quarter',
  ]

  const SEMEADOS: readonly string[] = ['utility', 'van', 'vuc', 'toco', 'truck']

  test('todo tipo do catálogo ou tem referência semeada ou está nomeado como exceção', () => {
    for (const vehicleType of VEHICLE_TYPES) {
      const coberto = SEMEADOS.includes(vehicleType) || SEM_REFERENCIA.includes(vehicleType)
      expect({ coberto, vehicleType }).toEqual({ coberto: true, vehicleType })
    }
  })

  /** A semente da migration é a fonte: se ela mudar, esta lista tem de mudar junto. */
  test('a semente da migration cobre exatamente os tipos declarados', async () => {
    const sql = await Bun.file(
      new URL(
        '../../drizzle/20260902150000_vehicle_volume_references/migration.sql',
        import.meta.url,
      ),
    ).text()

    for (const vehicleType of SEMEADOS) expect(sql).toInclude(`'${vehicleType}'`)
    for (const vehicleType of SEM_REFERENCIA) expect(sql).not.toInclude(`'${vehicleType}'`)
    /** As duas linhas de implemento, com `vehicle_type` vazio: baú e sider. */
    expect(sql).toInclude("('',        '02'")
    expect(sql).toInclude("('',        '05'")
  })
})
