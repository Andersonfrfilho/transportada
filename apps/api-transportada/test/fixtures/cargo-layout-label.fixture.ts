/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 D20 (T16): a mesma viagem com a etiqueta de antes e a de agora. O hash ignora a etiqueta
 * (D6), então as duas entradas caem na mesma linha — e a planta que o worker desenhou com a de antes
 * é a que a leitura serve.
 */
import {
  resolveCargoLayout,
  type CargoLayoutStop,
  type CargoPlanBox,
  type ResolvedCargoLayout,
} from '@adatechnology/cargo-placement'

import type { BuildCargoLayoutInputParams } from '../../src/trips/domain/cargo-layout-hash.types.js'

export const LABEL_KEYS = ['clientName', 'documentNumber', 'label', 'noteNumbers', 'stopLabel']

function measuredBox(documentId: string, documentNumber: string): CargoPlanBox {
  return { count: 2, documentId, documentNumber, heightMm: 400, lengthMm: 500, widthMm: 400 }
}

function unmeasuredBox(documentId: string, documentNumber: string): CargoPlanBox {
  return {
    count: 1,
    documentId,
    documentNumber,
    heightMm: null,
    lengthMm: null,
    productCode: 'P-1',
    widthMm: null,
  }
}

export const OLD_STOPS: readonly CargoLayoutStop[] = [
  {
    boxes: [measuredBox('doc-1', '101'), unmeasuredBox('doc-1', '101')],
    clientName: 'Cliente Antigo',
    documentsWithoutVolume: 0,
    label: 'Rua Velha, 1',
    noteNumbers: ['101'],
    sequence: 1,
    volumeM3: '0.500000',
  },
  {
    boxes: [measuredBox('doc-2', '202'), measuredBox('doc-3', '303')],
    clientName: 'Outro Antigo',
    documentsWithoutVolume: 0,
    label: 'Rua B, 2',
    noteNumbers: ['202', '303'],
    sequence: 2,
    volumeM3: '0.800000',
  },
  {
    boxes: [],
    clientName: 'Sem Volume',
    documentsWithoutVolume: 1,
    label: 'Rua C, 3',
    noteNumbers: ['404'],
    sequence: 3,
    volumeM3: null,
  },
]

/** Cliente renomeado, endereço corrigido e a nota 303 renumerada para 313 — nada que mude o desenho. */
export const NEW_STOPS: readonly CargoLayoutStop[] = [
  {
    ...OLD_STOPS[0],
    boxes: [measuredBox('doc-1', '101'), unmeasuredBox('doc-1', '101')],
    clientName: 'Cliente Renomeado',
    label: 'Rua Nova, 10',
  } as CargoLayoutStop,
  {
    ...OLD_STOPS[1],
    boxes: [measuredBox('doc-2', '202'), measuredBox('doc-3', '313')],
    clientName: 'Outro Renomeado',
    noteNumbers: ['202', '313'],
  } as CargoLayoutStop,
  { ...OLD_STOPS[2], label: 'Rua C, 30' } as CargoLayoutStop,
]

const BASE_INPUT = {
  bedDimensions: { heightM: '2.500', lengthM: '6.000', source: 'measured', widthM: '2.400' },
  capacityM3: '36.000',
  fallbackBoxVolumeM3: 0.05,
  loadingAccess: 'rear',
} as const

export const OLD_INPUT: BuildCargoLayoutInputParams = { ...BASE_INPUT, stops: OLD_STOPS }
export const NEW_INPUT: BuildCargoLayoutInputParams = { ...BASE_INPUT, stops: NEW_STOPS }

export function drawnWith(input: BuildCargoLayoutInputParams): ResolvedCargoLayout {
  const layout = resolveCargoLayout(input)
  if (layout === null) throw new Error('Expected a cargo layout for the fixture')
  return layout
}

/** A planta com toda etiqueta apagada: o que sobra é o desenho, e ele não pode mudar. */
export function maskLabels(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => maskLabels(item))
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      LABEL_KEYS.includes(key) ? '*' : maskLabels(item),
    ]),
  )
}
