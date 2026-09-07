/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ScalePlanBand } from '@/components/ui/scale-plan'

import { stopColorOf } from './stopColor.service'
import type { TripCargoLayout } from './trip.types'

export type CargoPlanBed = Readonly<{ lengthM: number; widthM: number }>

export type CargoPlanView = Readonly<{
  bands: readonly ScalePlanBand[]
  bed: CargoPlanBed
  /** Metros que atravessaram a porta. Zero quando a carga coube. */
  overflowM: number
}>

/**
 * Spec 088 R2/R3: a planta do baú vista de cima, em escala.
 *
 * `null` sem a medida do baú — que é o estado de toda a frota hoje. A tela mantém as fileiras
 * proporcionais da 085, que não prometem metro nenhum, e diz qual campo da ficha falta (R6).
 * Nunca uma planta desenhada com medida de referência: ela erra por 2× dentro do mesmo tipo.
 *
 * ⚠️ A origem do eixo é a **parede do fundo**, e a porta fica à direita — a mesma orientação do
 * desenho de lado da 085, para as duas figuras não se contradizerem na mesma tela. Daí a conta:
 * a borda da faixa que olha para a porta está a `bedLength − distanceFromDoor` do fundo.
 */
export function buildCargoPlanView(layout: TripCargoLayout | null): CargoPlanView | null {
  if (layout === null || layout.bedLengthM === null || layout.bedWidthM === null) return null

  const bedLength = Number.parseFloat(layout.bedLengthM)
  const bedWidth = Number.parseFloat(layout.bedWidthM)
  if (!Number.isFinite(bedLength) || !Number.isFinite(bedWidth)) return null
  if (bedLength <= 0 || bedWidth <= 0) return null

  /** A ordem de carregamento é a que o desenho segue: `1` encosta no fundo, e é a última entrega. */
  const ordered = [...layout.slices].sort((first, second) => first.loadOrder - second.loadOrder)

  const bands = ordered.flatMap<ScalePlanBand>((slice) => {
    if (slice.depthM === null || slice.distanceFromDoorM === null) return []
    const depth = Number.parseFloat(slice.depthM)
    const right = bedLength - Number.parseFloat(slice.distanceFromDoorM)
    const offset = right - depth
    if (!Number.isFinite(depth) || !Number.isFinite(offset) || depth <= 0) return []

    return [
      {
        /**
         * ⚠️ `stopColorOf` da **sequência**, e não uma paleta local pela ordem de carregamento: o
         * mapa da mesma tela pinta pela sequência, e as duas aritméticas dariam duas cores para a
         * mesma parada — exatamente o que a R3 proíbe, e o que `stopColor.service.ts` existe para
         * impedir. Com três paradas, a de `sequence: 3` é `loadOrder: 1`: pelo índice ela sairia
         * verde na planta e roxa no mapa, lado a lado.
         */
        color: stopColorOf(slice.sequence),
        id: String(slice.sequence),
        /** O número da ordem, não o nome: o rótulo inteiro não cabe numa faixa de meio metro. */
        label: String(slice.loadOrder),
        lengthM: depth,
        offsetM: offset,
        /** O que passa da porta é hachurado, e o contorno do baú continua onde sempre esteve. */
        ...(right > bedLength ? { outside: true } : {}),
        /** Em `rear` a ordem é obrigação e não há borda alcançável para marcar. */
        ...(layout.orderIsBinding ? {} : { sideMarked: true }),
      },
    ]
  })

  return {
    bands,
    bed: { lengthM: bedLength, widthM: bedWidth },
    overflowM: layout.overflowDepthM === null ? 0 : Number.parseFloat(layout.overflowDepthM),
  }
}
