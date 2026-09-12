/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 D6: a chave que diz se um layout já calculado pode ser reaproveitado. `buildCargoLayoutInput`
 * monta o retrato canônico a partir do mesmo objeto que `resolveCargoLayout` já recebe hoje
 * (`drizzle-trip.repository.ts` e `preview-trip-cargo.use-case.ts`); `hashCargoLayoutInput` resume esse
 * retrato num hexadecimal.
 *
 * ⚠️ `label`/`clientName`/`noteNumbers` nunca entram: são a etiqueta, não o desenho — mudar o nome do
 * cliente não pode invalidar um layout que já custou o orçamento de tempo do worker para calcular.
 */
import { createHash } from 'node:crypto'

import type { CargoLayoutStop, CargoPlanBox } from '@adatechnology/cargo-placement'
import { CARGO_LAYOUT_POLICY_VERSION } from '@adatechnology/cargo-placement'

import { canonicalJson } from '../../shared/canonical-json.service.js'
import type {
  BuildCargoLayoutInputParams,
  CargoLayoutBoxInput,
  CargoLayoutInput,
  CargoLayoutStopInput,
} from './cargo-layout-hash.types.js'

/** As três dimensões vindas da ficha — ausente qualquer uma, a caixa é presumida (spec 094/144). */
function isMeasuredBox(box: CargoPlanBox): boolean {
  return box.heightMm !== null && box.lengthMm !== null && box.widthMm !== null
}

function buildBoxInput(box: CargoPlanBox): CargoLayoutBoxInput {
  return {
    dims: { heightMm: box.heightMm, lengthMm: box.lengthMm, widthMm: box.widthMm },
    documentId: box.documentId ?? null,
    measured: isMeasuredBox(box),
    quantity: box.count,
  }
}

function buildStopInput(stop: CargoLayoutStop): CargoLayoutStopInput {
  return {
    boxes: (stop.boxes ?? []).map((box) => buildBoxInput(box)),
    sequence: stop.sequence,
  }
}

/**
 * A ordem em que as paradas chegam **é** a sequência — nenhuma reordenação aqui, quem monta `stops`
 * já entrega na ordem que o desenho lê.
 */
export function buildCargoLayoutInput(params: BuildCargoLayoutInputParams): CargoLayoutInput {
  const bed = params.bedDimensions ?? null

  return {
    bed:
      bed === null
        ? null
        : { heightM: bed.heightM, lengthM: bed.lengthM, source: bed.source, widthM: bed.widthM },
    capacityM3: params.capacityM3,
    fallbackBoxVolumeM3: params.fallbackBoxVolumeM3 ?? null,
    /** Ausente assume `rear`, o mais restritivo — a mesma omissão de `resolveCargoLayout`. */
    loadingAccess: params.loadingAccess ?? 'rear',
    measuredShapes: params.measuredShapes ?? [],
    payloadRatio: params.payloadRatio ?? null,
    policyVersion: params.policyVersion ?? CARGO_LAYOUT_POLICY_VERSION,
    /** Ausente é ninguém amarrando (spec 100) — supor cinta desenharia pilha que não existe. */
    securesCargo: params.securesCargo ?? false,
    stops: params.stops.map((stop) => buildStopInput(stop)),
  }
}

export function hashCargoLayoutInput(input: CargoLayoutInput): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex')
}
