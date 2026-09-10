/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_VIEW_ANGLE,
  depthAlongView,
  projectIsometric,
  visibleFaces,
} from '@/components/ui/cargo-isometric'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * Spec 095 G004: o desenho da carga é **isométrico e giratório**, e as três funções puras abaixo são
 * tudo o que se confere sem DOM — o resto é SVG.
 */
describe('design system cargo isometric contract', () => {
  /**
   * ⚠️ `zM` sobe na tela (y diminui): em SVG o eixo vertical cresce para baixo, e esquecer isso
   * desenha a pilha crescendo para dentro do chão.
   */
  test('lifts the drawing when the box goes up', () => {
    const floor = projectIsometric({ xM: 1, yM: 1, zM: 0 }, DEFAULT_VIEW_ANGLE)
    const above = projectIsometric({ xM: 1, yM: 1, zM: 1 }, DEFAULT_VIEW_ANGLE)

    expect(above.y).toBeLessThan(floor.y)
    expect(above.x).toBe(floor.x)
  })

  /**
   * ⚠️ **Ordenar por `xM + yM + zM` só funciona no ângulo padrão.** Girado meia volta, a soma passa a
   * apontar para trás e as caixas do fundo cobrem as da frente — o defeito que faz um isométrico
   * parecer quebrado. A profundidade tem de seguir o ângulo.
   */
  test('reverses depth when the view turns around', () => {
    const near = { xM: 0, yM: 0, zM: 0 }
    const far = { xM: 5, yM: 0, zM: 0 }
    const turned = {
      pitchRad: DEFAULT_VIEW_ANGLE.pitchRad,
      yawRad: DEFAULT_VIEW_ANGLE.yawRad + Math.PI,
    }

    const ahead = depthAlongView(far, DEFAULT_VIEW_ANGLE) - depthAlongView(near, DEFAULT_VIEW_ANGLE)
    const behind = depthAlongView(far, turned) - depthAlongView(near, turned)

    expect(Math.sign(ahead)).toBe(-Math.sign(behind))
  })

  /**
   * ⚠️ Desenhar sempre topo, `+X` e `+Y` deixava a caixa **vazada** assim que o giro passava de 90°:
   * as faces desenhadas iam para trás e as visíveis não existiam no SVG. É o sinal da derivada da
   * profundidade em cada eixo que diz qual das duas faces do par está de frente.
   */
  test('swaps each pair of faces when the view turns around', () => {
    const front = visibleFaces(DEFAULT_VIEW_ANGLE)
    const back = visibleFaces({
      pitchRad: DEFAULT_VIEW_ANGLE.pitchRad,
      yawRad: DEFAULT_VIEW_ANGLE.yawRad + Math.PI,
    })

    expect(back.x).not.toBe(front.x)
    expect(back.y).not.toBe(front.y)
    /** A face horizontal só troca com o olhar por baixo, que o pitch positivo nunca produz. */
    expect(back.z).toBe(front.z)
  })

  test('looks from below only when the pitch does', () => {
    expect(visibleFaces({ pitchRad: 0.6, yawRad: 0 }).z).toBe('top')
    expect(visibleFaces({ pitchRad: -0.6, yawRad: 0 }).z).toBe('bottom')
  })

  /**
   * ⚠️ A caixa presumida é marcada pelo **contorno pontilhado** (spec 119) — nunca hachura. O risco diagonal cruza as arestas
   * e lê como rachadura na quina, e com o dado de hoje ele cobriria quase toda a carga: a tela
   * inteira ficava riscada. E um padrão SVG tem fundo transparente, então usá-lo como preenchimento
   * deixava a caixa **vazada**.
   */
  test('never marks the presumed box with a hatch pattern', async () => {
    const source = await readApplicationFile('src/components/ui/cargo-isometric.tsx')

    expect(source).not.toContain('pattern')
    expect(source).not.toContain('faceWash')
    expect(source).toContain('facePresumed')
  })
})
