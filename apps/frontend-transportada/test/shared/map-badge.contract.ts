/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { ICON_PATHS } from '@/components/ui/icon'
import { MAP_BADGE_IDS } from '@/modules/shared/mapBadge.constant'
import {
  MAP_BADGE_ICONS,
  MAP_BADGE_SHAPES,
  resolveMapBadgeColors,
  resolveMapBadgeKind,
} from '@/modules/shared/mapBadge.service'
import { BASEMAP_THEMES } from '@/modules/shared/vectorBasemap.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const echoToken = (token: string): string => token

function readApplicationFile(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

/**
 * O radar era `▲ 60` e o pedágio `●`, texto solto sobre o mapa — difícil de achar na vista da
 * rota inteira. Agora os dois são selos com fundo e borda, desenhados com os ícones do design system.
 */
describe('os selos de radar e de pedágio no mapa', () => {
  it('usa ícone do design system, nunca emoji — e o pedágio é o mesmo da linha da conta', () => {
    expect(MAP_BADGE_ICONS.radar).toBe('camera')
    expect(MAP_BADGE_ICONS.toll).toBe('invoice')
    expect(ICON_PATHS[MAP_BADGE_ICONS.radar].length).toBeGreaterThan(0)
    expect(ICON_PATHS[MAP_BADGE_ICONS.toll].length).toBeGreaterThan(0)
    expect(
      readApplicationFile('src/modules/trip/components/TripAssemblyMap.component.tsx'),
    ).toContain('<Icon name="invoice" />')
  })

  it('separa os dois pela forma, e não só pelo ícone — o tema contraste é preto e branco', () => {
    expect(MAP_BADGE_SHAPES.radar).not.toBe(MAP_BADGE_SHAPES.toll)
    expect(MAP_BADGE_IDS.radar).not.toBe(MAP_BADGE_IDS.toll)
  })

  it('reconhece só os próprios selos no pedido de imagem do mapa', () => {
    expect(resolveMapBadgeKind(MAP_BADGE_IDS.radar)).toBe('radar')
    expect(resolveMapBadgeKind(MAP_BADGE_IDS.toll)).toBe('toll')
    expect(resolveMapBadgeKind('outra-imagem')).toBeNull()
  })

  /** Token do painel muda de sentido entre temas; a paleta do mapa acompanha o tema do mapa. */
  it('tira fundo, borda e ícone da paleta do mapa em todos os temas', () => {
    for (const theme of BASEMAP_THEMES) {
      for (const kind of ['radar', 'toll'] as const) {
        const colors = resolveMapBadgeColors({ kind, resolveToken: echoToken, theme })
        for (const color of Object.values(colors)) expect(color).toStartWith('--color-basemap-')
        expect(colors.border).toBe(colors.glyph)
        expect(colors.background).not.toBe(colors.border)
      }
    }
    expect(
      resolveMapBadgeColors({ kind: 'radar', resolveToken: echoToken, theme: 'claro' }).border,
    ).toBe('--color-basemap-road-trunk')
    expect(
      resolveMapBadgeColors({ kind: 'toll', resolveToken: echoToken, theme: 'claro' }).border,
    ).toBe('--color-basemap-road-major')
  })

  /** Sem o evento, `setStyle` na troca de tema apagaria os selos e o mapa não os pediria de novo. */
  it('o mapa desenha os selos quando o estilo os pede, com o tema atual', () => {
    const component = readApplicationFile(
      'src/modules/trip/components/AssemblyVectorMap.component.tsx',
    )

    expect(component).toContain("map.on('styleimagemissing'")
    expect(component).toContain('resolveMapBadgeKind(event.id)')
    expect(component).toContain('theme: themeRef.current')
    expect(component).toContain("'icon-image': MAP_BADGE_IDS.toll")
  })
})
