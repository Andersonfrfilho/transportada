/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { IconName } from '@/components/ui/icon'

import {
  MAP_BADGE_IDS,
  RADAR_SPEED_BADGE_PREFIX,
  type MapBadgeId,
  type MapBadgeKind,
} from './mapBadge.constant'
import {
  resolveBasemapOutline,
  resolveBasemapRadarColor,
  resolveBasemapTollColor,
  type BasemapTheme,
} from './vectorBasemap.service'

/**
 * O ícone de cada selo, do design system — nunca emoji (`web.md` §9). O pedágio usa `invoice`,
 * o mesmo da linha de pedágio da conta: o mesmo ícone significa a mesma coisa em todo o produto.
 */
export const MAP_BADGE_ICONS: Readonly<Record<MapBadgeKind, IconName>> = {
  radar: 'camera',
  toll: 'invoice',
}

/**
 * A forma também separa os dois, e não só o ícone: no tema `contraste` o mapa inteiro é preto e
 * branco, e é o contorno do selo que continua dizendo radar ou pedágio de relance.
 */
export const MAP_BADGE_SHAPES: Readonly<Record<MapBadgeKind, 'circle' | 'rounded-square'>> = {
  radar: 'circle',
  toll: 'rounded-square',
}

export type MapBadgeColors = Readonly<{ background: string; border: string; glyph: string }>

export function resolveMapBadgeKind(id: string): MapBadgeKind | null {
  const entries = Object.entries(MAP_BADGE_IDS) as [MapBadgeKind, MapBadgeId][]
  return entries.find(([, badgeId]) => badgeId === id)?.[0] ?? null
}

/** Limite de velocidade que vira placa: só número, até três dígitos — `BR:urban` não vira placa. */
const SPEED_PATTERN = /^\d{1,3}$/u

export type MapBadgeRequest = Readonly<{ kind: MapBadgeKind; speed: string | null }>

/**
 * O que o mapa pediu no `styleimagemissing`. `selo-radar-60` é o radar com a placa de 60; um valor
 * que não é número volta como radar sem placa — o selo existe mesmo quando o limite não é legível,
 * e desenhar texto qualquer numa placa seria inventar o que o motorista obedece.
 */
export function resolveMapBadgeRequest(id: string): MapBadgeRequest | null {
  const kind = resolveMapBadgeKind(id)
  if (kind !== null) return { kind, speed: null }
  if (!id.startsWith(RADAR_SPEED_BADGE_PREFIX)) return null

  const speed = id.slice(RADAR_SPEED_BADGE_PREFIX.length).trim()
  return { kind: 'radar', speed: SPEED_PATTERN.test(speed) ? speed : null }
}

export type SpeedPlateColors = Readonly<{ digits: string; fill: string; ring: string }>

/**
 * A placa R-19 do CTB: anel vermelho, fundo branco, número preto — igual em todos os temas, porque
 * é a placa que o motorista encontra na estrada. As cores ainda saem da paleta do mapa, nunca de
 * valor literal.
 */
export function resolveSpeedPlateColors(resolveToken: (token: string) => string): SpeedPlateColors {
  return {
    digits: resolveToken('--color-basemap-ink'),
    fill: resolveToken('--color-basemap-white'),
    ring: resolveToken('--color-basemap-road-major'),
  }
}

/**
 * Fundo no papel do tema (o mesmo anel do pino da parada), borda e ícone no tom da categoria —
 * troncal para o radar, rodovia para o pedágio. Tudo da paleta `--color-basemap-*`, que acompanha
 * o tema **do mapa**; token do painel mudaria de sentido entre os temas.
 */
export function resolveMapBadgeColors(input: {
  readonly kind: MapBadgeKind
  readonly resolveToken: (token: string) => string
  readonly theme: BasemapTheme
}): MapBadgeColors {
  const accent =
    input.kind === 'radar'
      ? resolveBasemapRadarColor(input.resolveToken, input.theme)
      : resolveBasemapTollColor(input.resolveToken, input.theme)

  return {
    background: resolveBasemapOutline(input.resolveToken, input.theme),
    border: accent,
    glyph: accent,
  }
}
