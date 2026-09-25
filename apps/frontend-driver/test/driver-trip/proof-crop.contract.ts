/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  boundsToCorners,
  cornersToBounds,
  detectDocumentBounds,
  toLuminanceGrid,
  type LuminanceGrid,
} from '@/modules/driver-trip/shared/proofCrop.service'

/** Um quadro sintético: fundo escuro com um retângulo claro onde o documento estaria. */
function buildGrid(input: {
  readonly background: number
  readonly document?: Readonly<{ bottom: number; left: number; right: number; top: number }>
  readonly documentValue?: number
  readonly height: number
  readonly width: number
}): LuminanceGrid {
  const data = new Array<number>(input.width * input.height).fill(input.background)
  if (input.document !== undefined) {
    for (let y = input.document.top; y < input.document.bottom; y += 1) {
      for (let x = input.document.left; x < input.document.right; x += 1) {
        data[y * input.width + x] = input.documentValue ?? 230
      }
    }
  }
  return { data, height: input.height, width: input.width }
}

describe('o recorte do comprovante (D5/T052)', () => {
  it('acha o documento centrado: caixa envolvente do claro sobre o escuro', () => {
    const grid = buildGrid({
      background: 20,
      document: { bottom: 80, left: 25, right: 75, top: 20 },
      height: 100,
      width: 100,
    })
    expect(detectDocumentBounds(grid)).toEqual({ bottom: 80, left: 25, right: 75, top: 20 })
  })

  it('sem contraste devolve null — a tela oferece o original, nunca um recorte inventado', () => {
    const flat = buildGrid({ background: 128, height: 50, width: 50 })
    expect(detectDocumentBounds(flat)).toBeNull()
  })

  it('claro tomando o quadro inteiro também é null: já está enquadrado, não há o que recortar', () => {
    const full = buildGrid({
      background: 10,
      document: { bottom: 50, left: 0, right: 50, top: 0 },
      height: 50,
      width: 50,
    })
    expect(detectDocumentBounds(full)).toBeNull()
  })

  it('cantos ajustados à mão viram a caixa envolvente, presa aos limites da imagem', () => {
    const corners = boundsToCorners({ bottom: 80, left: 25, right: 75, top: 20 })
    const adjusted = {
      ...corners,
      bottomRight: { x: 120, y: 95 },
      topLeft: { x: -10, y: 5 },
    }
    expect(cornersToBounds({ corners: adjusted, height: 100, width: 100 })).toEqual({
      bottom: 95,
      left: 0,
      right: 100,
      top: 5,
    })
  })

  it('a área nunca colapsa: cantos empilhados ainda rendem um pixel de recorte', () => {
    const corner = { x: 10, y: 10 }
    const bounds = cornersToBounds({
      corners: { bottomLeft: corner, bottomRight: corner, topLeft: corner, topRight: corner },
      height: 100,
      width: 100,
    })
    expect(bounds.right).toBeGreaterThan(bounds.left)
    expect(bounds.bottom).toBeGreaterThan(bounds.top)
  })

  it('RGBA do canvas vira luminância por pixel', () => {
    const imageData = {
      data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]),
      height: 1,
      width: 2,
    }
    const grid = toLuminanceGrid(imageData)
    expect(Math.round(grid.data[0] ?? 0)).toBe(255)
    expect(Math.round(grid.data[1] ?? 0)).toBe(0)
  })
})
