/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  applyViewPreset,
  DEFAULT_CARGO_VIEW,
  dragView,
  panViewBy,
  rotateView,
  zoomViewBy,
} from '@/modules/trip/shared/cargoView.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

/**
 * Spec 095 G005: girar, mover e enquadrar o baú.
 *
 * A botoeira existe porque **arrastar é descoberta**: quem não tenta, não descobre — e no toque o
 * arrasto ainda disputa com a rolagem da página.
 */
describe('trip cargo view contract', () => {
  /**
   * ⚠️ Giro **zero olha a lateral**, não a traseira: o comprimento do baú corre no eixo `x`. E a
   * lateral é **meia volta**, porque a porta lateral fica no plano `y = 0` — sem giro quem aparece é
   * a parede cega do outro lado.
   */
  it('aims the side shortcut at the side door', () => {
    expect(applyViewPreset(DEFAULT_CARGO_VIEW, 'side').angle.yawRad).toBe(Math.PI)
    expect(applyViewPreset(DEFAULT_CARGO_VIEW, 'rear').angle.yawRad).toBe(-Math.PI / 2)
  })

  /** O tombo trava antes da horizontal e antes do zênite: passar disso vira o desenho de cabeça para baixo. */
  it('never tips the drawing past the horizon', () => {
    let view = DEFAULT_CARGO_VIEW
    for (let step = 0; step < 40; step += 1) view = rotateView(view, 'up')
    expect(view.angle.pitchRad).toBeLessThanOrEqual(1.45)

    view = DEFAULT_CARGO_VIEW
    for (let step = 0; step < 40; step += 1) view = rotateView(view, 'down')
    expect(view.angle.pitchRad).toBeGreaterThanOrEqual(-0.2)
  })

  /** A volta é livre: o baú gira quantas vezes se quiser, e não há "fim" do giro horizontal. */
  it('turns around without a stop', () => {
    let view = DEFAULT_CARGO_VIEW
    for (let step = 0; step < 40; step += 1) view = rotateView(view, 'right')
    expect(view.angle.yawRad).toBeGreaterThan(DEFAULT_CARGO_VIEW.angle.yawRad + Math.PI)
  })

  /** O arrasto para cima olha por cima — o mesmo sentido do botão, senão o gesto contradiz o botão. */
  it('drags in the same direction the pad points', () => {
    expect(dragView(DEFAULT_CARGO_VIEW, { x: 0, y: -10 }).angle.pitchRad).toBeGreaterThan(
      DEFAULT_CARGO_VIEW.angle.pitchRad,
    )
    expect(dragView(DEFAULT_CARGO_VIEW, { x: 10, y: 0 }).angle.yawRad).toBeGreaterThan(
      DEFAULT_CARGO_VIEW.angle.yawRad,
    )
  })

  /** A aproximação tem piso e teto: sem eles, dois cliques a mais deixam a tela vazia. */
  it('bounds the zoom on both ends', () => {
    let view = DEFAULT_CARGO_VIEW
    for (let step = 0; step < 40; step += 1) view = zoomViewBy(view, 1)
    expect(view.zoom).toBe(3)

    view = DEFAULT_CARGO_VIEW
    for (let step = 0; step < 40; step += 1) view = zoomViewBy(view, -1)
    expect(view.zoom).toBe(0.5)
  })

  /** Mover é só enquadramento: o ângulo não muda quando se desloca o desenho. */
  it('keeps the angle while panning', () => {
    const panned = panViewBy(panViewBy(DEFAULT_CARGO_VIEW, 'left'), 'up')

    expect(panned.angle).toEqual(DEFAULT_CARGO_VIEW.angle)
    expect(panned.panX).toBeLessThan(0)
    expect(panned.panY).toBeLessThan(0)
  })

  /** Restaurar desfaz tudo de uma vez — inclusive o que o arrasto fez sem o operador perceber. */
  it('restores every part of the view at once', () => {
    expect(applyViewPreset(DEFAULT_CARGO_VIEW, 'default')).toEqual(DEFAULT_CARGO_VIEW)
  })

  /**
   * ⚠️ O painel obedece a `prefers-reduced-motion` e o alvo de toque sai do token de controle: a
   * botoeira é a parte desta tela que se usa no celular, dentro do galpão.
   */
  it('respects reduced motion and the touch target', () => {
    const css = readApplicationFile('src/modules/trip/styles/trip.module.css')

    expect(css).toContain('prefers-reduced-motion')
    expect(css).toContain('--control-height')
  })
})
