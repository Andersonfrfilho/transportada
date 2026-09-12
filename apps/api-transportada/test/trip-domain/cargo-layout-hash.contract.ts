/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 D6/G005: o hash que decide se um layout já calculado pode ser reaproveitado. Ele precisa
 * ser cego a rótulo — `label`/`clientName`/`noteNumbers` mudam a etiqueta, nunca o desenho — e
 * sensível a tudo que o empacotador de fato lê: ordem das paradas, dimensão e quantidade de caixa,
 * baú, acesso de carregamento, quem amarra e a versão da política.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildCargoLayoutInput,
  hashCargoLayoutInput,
} from '../../src/trips/domain/cargo-layout-hash.policy.js'
import type { BuildCargoLayoutInputParams } from '../../src/trips/domain/cargo-layout-hash.types.js'
import { canonicalJson } from '../../src/shared/canonical-json.service.js'

const BASE_PARAMS: BuildCargoLayoutInputParams = {
  bedDimensions: { heightM: '2', lengthM: '6', source: 'measured', widthM: '2.4' },
  capacityM3: '28.8',
  fallbackBoxVolumeM3: 0.05,
  loadingAccess: 'rear',
  measuredShapes: [{ heightMm: 300, lengthMm: 400, widthMm: 300 }],
  payloadRatio: '0.4',
  securesCargo: true,
  stops: [
    {
      boxes: [
        {
          count: 3,
          documentId: 'doc-1',
          documentNumber: '1001',
          heightMm: 300,
          label: 'Caixa A',
          lengthMm: 400,
          widthMm: 300,
        },
      ],
      clientName: 'Cliente 1',
      documentsWithoutVolume: 0,
      label: 'Parada 1',
      noteNumbers: ['1001'],
      sequence: 1,
      volumeM3: '0.108',
    },
    {
      boxes: [
        {
          count: 2,
          documentId: 'doc-2',
          documentNumber: '1002',
          heightMm: 250,
          label: 'Caixa B',
          lengthMm: 350,
          widthMm: 280,
        },
      ],
      clientName: 'Cliente 2',
      documentsWithoutVolume: 0,
      label: 'Parada 2',
      noteNumbers: ['1002'],
      sequence: 2,
      volumeM3: '0.049',
    },
  ],
}

function hashOf(params: BuildCargoLayoutInputParams): string {
  return hashCargoLayoutInput(buildCargoLayoutInput(params))
}

describe('canonicalJson', () => {
  test('ignora a ordem das chaves', () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }))
  })

  test('omite chave com valor undefined', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }))
  })

  test('preserva a ordem dos itens do array', () => {
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]))
  })

  test('é determinístico entre chamadas', () => {
    const value = { stops: [{ sequence: 1 }, { sequence: 2 }], z: 'último', a: 'primeiro' }
    expect(canonicalJson(value)).toBe(canonicalJson(value))
  })
})

describe('hashCargoLayoutInput', () => {
  test('é hexadecimal de 64 caracteres', () => {
    expect(hashOf(BASE_PARAMS)).toMatch(/^[0-9a-f]{64}$/u)
  })

  test('mudar label da parada não muda o hash', () => {
    const changed: BuildCargoLayoutInputParams = {
      ...BASE_PARAMS,
      stops: BASE_PARAMS.stops.map((stop) => ({ ...stop, label: 'Outro rótulo qualquer' })),
    }

    expect(hashOf(changed)).toBe(hashOf(BASE_PARAMS))
  })

  test('mudar clientName da parada não muda o hash', () => {
    const changed: BuildCargoLayoutInputParams = {
      ...BASE_PARAMS,
      stops: BASE_PARAMS.stops.map((stop) => ({ ...stop, clientName: 'Outro cliente' })),
    }

    expect(hashOf(changed)).toBe(hashOf(BASE_PARAMS))
  })

  test('mudar noteNumbers da parada não muda o hash', () => {
    const changed: BuildCargoLayoutInputParams = {
      ...BASE_PARAMS,
      stops: BASE_PARAMS.stops.map((stop) => ({ ...stop, noteNumbers: ['9999'] })),
    }

    expect(hashOf(changed)).toBe(hashOf(BASE_PARAMS))
  })

  test('reordenar as paradas muda o hash', () => {
    const reordered: BuildCargoLayoutInputParams = {
      ...BASE_PARAMS,
      stops: [...BASE_PARAMS.stops].reverse(),
    }

    expect(hashOf(reordered)).not.toBe(hashOf(BASE_PARAMS))
  })

  test('trocar a dimensão de uma caixa muda o hash', () => {
    const changed: BuildCargoLayoutInputParams = {
      ...BASE_PARAMS,
      stops: BASE_PARAMS.stops.map((stop, index) =>
        index === 0
          ? { ...stop, boxes: (stop.boxes ?? []).map((box) => ({ ...box, heightMm: 999 })) }
          : stop,
      ),
    }

    expect(hashOf(changed)).not.toBe(hashOf(BASE_PARAMS))
  })

  test('trocar a quantidade de uma caixa muda o hash', () => {
    const changed: BuildCargoLayoutInputParams = {
      ...BASE_PARAMS,
      stops: BASE_PARAMS.stops.map((stop, index) =>
        index === 0
          ? { ...stop, boxes: (stop.boxes ?? []).map((box) => ({ ...box, count: 40 })) }
          : stop,
      ),
    }

    expect(hashOf(changed)).not.toBe(hashOf(BASE_PARAMS))
  })

  test('trocar o baú muda o hash', () => {
    const changed: BuildCargoLayoutInputParams = {
      ...BASE_PARAMS,
      bedDimensions: { heightM: '2', lengthM: '8', source: 'measured', widthM: '2.4' },
    }

    expect(hashOf(changed)).not.toBe(hashOf(BASE_PARAMS))
  })

  test('trocar loadingAccess muda o hash', () => {
    const changed: BuildCargoLayoutInputParams = { ...BASE_PARAMS, loadingAccess: 'open' }

    expect(hashOf(changed)).not.toBe(hashOf(BASE_PARAMS))
  })

  test('trocar securesCargo muda o hash', () => {
    const changed: BuildCargoLayoutInputParams = { ...BASE_PARAMS, securesCargo: false }

    expect(hashOf(changed)).not.toBe(hashOf(BASE_PARAMS))
  })

  test('trocar policyVersion muda o hash', () => {
    const changed: BuildCargoLayoutInputParams = { ...BASE_PARAMS, policyVersion: '2' }

    expect(hashOf(changed)).not.toBe(hashOf(BASE_PARAMS))
  })

  test('caixa medida e caixa presumida do mesmo tamanho produzem hash diferente', () => {
    const singleStop = {
      boxes: [{ count: 1, documentId: 'doc-1', heightMm: 300, lengthMm: 400, widthMm: 300 }],
      documentsWithoutVolume: 0,
      label: 'Parada única',
      sequence: 1,
      volumeM3: '0.036',
    }
    const measured: BuildCargoLayoutInputParams = { ...BASE_PARAMS, stops: [singleStop] }
    const estimated: BuildCargoLayoutInputParams = {
      ...BASE_PARAMS,
      stops: [
        {
          ...singleStop,
          boxes: [
            {
              count: 1,
              documentId: 'doc-1',
              estimatedVolumeM3: 0.036,
              estimateSource: 'median',
              heightMm: null,
              lengthMm: null,
              widthMm: null,
            },
          ],
        },
      ],
    }

    expect(hashOf(measured)).not.toBe(hashOf(estimated))
  })
})
