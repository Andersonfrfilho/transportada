/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_VIEW_ANGLE,
  projectSolids,
  shadeHexColor,
  type IsometricBox,
} from '@/components/ui/cargo-isometric'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * Spec 131: o orçamento declarado do redesenho. Medido no navegador com 6000 caixas (quatro vezes o
 * antigo teto de 1500): antes da correção 100 ms de mediana ao girar a vista, pico 131 ms. O número
 * vive aqui para o contrato de projeção abaixo, que é a parte que roda sem DOM.
 */
const PROJECTION_BUDGET_MS = 100

function cubes(count: number): IsometricBox[] {
  return Array.from({ length: count }, (_, index) => ({
    color: index % 2 === 0 ? '#d77e5d' : '#bc2f97',
    complement: index % 17 === 0 ? ('outOfReach' as const) : null,
    depthM: 0.12,
    heightM: 0.12,
    id: String(index),
    isEstimated: index % 5 === 0,
    isGhost: index % 3 === 0,
    isSplit: index % 11 === 0,
    layer: Math.floor(index / 1000),
    stopSequence: (index % 60) + 1,
    widthM: 0.12,
    xM: (index % 60) * 0.12,
    yM: (Math.floor(index / 60) % 20) * 0.12,
    zM: Math.floor(index / 1200) * 0.12,
  }))
}

/**
 * ⚠️ **Não há teto de desenho** (decisão do usuário, spec 131): toda caixa que a API empacotou é
 * desenhada. Desenho lento é defeito do desenho — nunca motivo para esconder carga.
 */
describe('design system cargo isometric — toda caixa desenhada', () => {
  test('projeta cada caixa recebida, uma vez, na ordem do pintor', () => {
    const boxes = cubes(6000)
    const solids = projectSolids(boxes, DEFAULT_VIEW_ANGLE)

    expect(solids.length).toBe(6000)
    expect(new Set(solids.map((solid) => solid.box.id)).size).toBe(6000)
  })

  /** A projeção de 6000 caixas cabe com folga no orçamento do gesto; o resto é pintura do navegador. */
  test('projeta 6000 caixas dentro do orçamento do redesenho', () => {
    const boxes = cubes(6000)
    projectSolids(boxes, DEFAULT_VIEW_ANGLE)
    const startedAt = performance.now()
    projectSolids(boxes, { pitchRad: 0.62, yawRad: -0.4 })

    expect(performance.now() - startedAt).toBeLessThan(PROJECTION_BUDGET_MS)
  })

  /** A caixa apagada pelo foco continua desenhada, em cinza — nunca sumida. */
  test('desenha a caixa fantasma no cinza, sem apagá-la', () => {
    const [ghost] = projectSolids(
      [{ ...cubes(1)[0], isGhost: true } as IsometricBox],
      DEFAULT_VIEW_ANGLE,
    )

    expect(ghost?.fills[0]).toBe('#5a6b74')
  })

  /** O sombreado das faces verticais é cor calculada: o `filter` do CSS era pintado face a face. */
  test('escurece a face vertical pela cor, nunca por filtro', async () => {
    expect(shadeHexColor('#ffffff', 0.5)).toBe('#808080')
    expect(shadeHexColor('rgb(1, 2, 3)', 0.5)).toBe('rgb(1, 2, 3)')
    const css = await readApplicationFile('src/components/ui/cargo-isometric.module.css')
    expect(css).not.toContain('filter:')
  })

  /** Nenhum teto por outro nome no componente que monta o desenho. */
  test('o painel não corta a lista de caixas', async () => {
    const layers = await readApplicationFile(
      'src/modules/trip/components/TripCargoLayers.component.tsx',
    )

    expect(layers).not.toContain('MAX_DRAWN_BOXES')
    expect(layers).not.toMatch(/boxes\.slice\(/u)
  })
})
