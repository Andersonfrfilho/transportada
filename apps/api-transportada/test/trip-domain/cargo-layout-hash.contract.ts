/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 D6/G005: o hash que decide se um layout já calculado pode ser reaproveitado. Ele precisa
 * ser cego a rótulo — `label`/`clientName`/`noteNumbers` mudam a etiqueta, nunca o desenho — e
 * sensível a tudo que o empacotador de fato lê: ordem das paradas, dimensão e quantidade de caixa,
 * baú, acesso de carregamento, quem amarra e a versão da política.
 */
import { describe, expect, test } from 'bun:test'

import { CARGO_LAYOUT_POLICY_VERSION } from '@adatechnology/cargo-placement'

import {
  buildCargoLayoutInput,
  buildStoredCargoLayoutInput,
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

  test('trocar enclosedBody muda o hash (D23)', () => {
    const enclosed: BuildCargoLayoutInputParams = { ...BASE_PARAMS, enclosedBody: true }
    const open: BuildCargoLayoutInputParams = { ...BASE_PARAMS, enclosedBody: false }

    expect(hashOf(enclosed)).not.toBe(hashOf(open))
    expect(buildCargoLayoutInput(enclosed).enclosedBody).toBe(true)
  })

  test('enclosedBody ausente é baú aberto — o mesmo hash de false (D23)', () => {
    const open: BuildCargoLayoutInputParams = { ...BASE_PARAMS, enclosedBody: false }

    expect(buildCargoLayoutInput(BASE_PARAMS).enclosedBody).toBe(false)
    expect(hashOf(BASE_PARAMS)).toBe(hashOf(open))
  })

  test('a entrada guardada leva enclosedBody resolvido (D23)', () => {
    expect(buildStoredCargoLayoutInput({ ...BASE_PARAMS, enclosedBody: true }).enclosedBody).toBe(
      true,
    )
    expect(buildStoredCargoLayoutInput(BASE_PARAMS).enclosedBody).toBe(false)
  })

  test('trocar policyVersion muda o hash', () => {
    const changed: BuildCargoLayoutInputParams = {
      ...BASE_PARAMS,
      policyVersion: `${CARGO_LAYOUT_POLICY_VERSION}-next`,
    }

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

type StopPatch = Partial<BuildCargoLayoutInputParams['stops'][number]>
type BoxPatch = Record<string, unknown>

function withFirstStop(patch: StopPatch): BuildCargoLayoutInputParams {
  return {
    ...BASE_PARAMS,
    stops: BASE_PARAMS.stops.map((stop, index) => (index === 0 ? { ...stop, ...patch } : stop)),
  }
}

function withFirstBox(patch: BoxPatch): BuildCargoLayoutInputParams {
  const [firstStop] = BASE_PARAMS.stops
  const boxes = (firstStop?.boxes ?? []).map((box) => ({ ...box, ...patch }))
  return withFirstStop({ boxes } as StopPatch)
}

/**
 * Revisão final da spec 145 (A1): o empacotador também lê a faixa da parada (`volumeM3`,
 * `documentsWithoutVolume`), a caixa presumida (`estimatedVolumeM3`, `estimateSource`, spec 144) e as
 * restrições da spec 094. Cada um muda o desenho — logo muda o hash.
 */
describe('hashCargoLayoutInput — tudo que o empacotador lê', () => {
  test.each<[string, StopPatch]>([
    ['volumeM3 da parada', { volumeM3: '9.999' }],
    ['documentsWithoutVolume da parada', { documentsWithoutVolume: 3 }],
  ])('mudar %s muda o hash', (_field, patch) => {
    expect(hashOf(withFirstStop(patch))).not.toBe(hashOf(BASE_PARAMS))
  })

  test.each<[string, BoxPatch]>([
    ['estimatedVolumeM3', { estimatedVolumeM3: 0.2 }],
    ['estimateSource', { estimateSource: 'median' }],
    ['isFragile', { isFragile: true }],
    ['isStackable', { isStackable: false }],
    ['keepUpright', { keepUpright: true }],
    ['maxStackCount', { maxStackCount: 2 }],
  ])('mudar %s da caixa muda o hash', (_field, patch) => {
    expect(hashOf(withFirstBox(patch))).not.toBe(hashOf(BASE_PARAMS))
  })

  test.each<[string, BoxPatch, BoxPatch]>([
    ['isFragile', { isFragile: true }, { isFragile: false }],
    ['isStackable', { isStackable: true }, { isStackable: false }],
    ['keepUpright', { keepUpright: true }, { keepUpright: false }],
    ['maxStackCount', { maxStackCount: 2 }, { maxStackCount: 3 }],
    ['estimatedVolumeM3', { estimatedVolumeM3: 0.1 }, { estimatedVolumeM3: 0.2 }],
    ['estimateSource', { estimateSource: 'median' }, { estimateSource: 'note' }],
  ])('dois valores de %s dão hashes diferentes', (_field, first, second) => {
    expect(hashOf(withFirstBox(first))).not.toBe(hashOf(withFirstBox(second)))
  })

  test('campo ausente e campo nulo dão o mesmo hash', () => {
    const explicitNulls = withFirstBox({
      estimatedVolumeM3: null,
      estimateSource: null,
      isFragile: null,
      isStackable: null,
      keepUpright: null,
      maxStackCount: null,
    })

    expect(hashOf(explicitNulls)).toBe(hashOf(BASE_PARAMS))
  })

  test.each<[string, BoxPatch]>([
    ['label', { label: 'Outro produto' }],
    ['documentNumber', { documentNumber: '5555' }],
    ['productCode', { productCode: 'SKU-9' }],
  ])('mudar %s da caixa (etiqueta) não muda o hash', (_field, patch) => {
    expect(hashOf(withFirstBox(patch))).toBe(hashOf(BASE_PARAMS))
  })

  test('duas viagens com paradas sem caixa e volumeM3 diferentes têm hashes diferentes', () => {
    const withoutBoxes = (volumeM3: string): BuildCargoLayoutInputParams => ({
      ...BASE_PARAMS,
      stops: [{ documentsWithoutVolume: 0, label: 'Parada', sequence: 1, volumeM3 }],
    })

    expect(hashOf(withoutBoxes('1.200'))).not.toBe(hashOf(withoutBoxes('3.400')))
  })

  /** A forma do retrato mudou na revisão: com a mesma versão, todo hash gravado antes deixa de bater. */
  test('a forma nova do retrato muda o hash mesmo com a versão da política de antes', () => {
    const HASH_BEFORE_REVIEW = '401b320116afa277a3ce2f75437cc55bbd7491558cff924ce9c3a3c6dc2c77d9'

    expect(hashOf({ ...BASE_PARAMS, policyVersion: '1' })).not.toBe(HASH_BEFORE_REVIEW)
  })
})

/** Revisão final (M1): `measuredShapes` é conjunto — a ordem em que o banco devolve não é entrada. */
describe('hashCargoLayoutInput — ordem estável', () => {
  test('measuredShapes em outra ordem dão o mesmo hash', () => {
    const shapes = [
      { heightMm: 300, lengthMm: 400, widthMm: 300 },
      { heightMm: 200, lengthMm: 500, widthMm: 250 },
      { heightMm: 200, lengthMm: 500, widthMm: 100 },
    ]

    expect(hashOf({ ...BASE_PARAMS, measuredShapes: [...shapes].reverse() })).toBe(
      hashOf({ ...BASE_PARAMS, measuredShapes: shapes }),
    )
  })
})
