import { describe, expect, test } from 'bun:test'
import sharp from 'sharp'
import { toWhiteLogoPng } from '../../src/occurrence-conversation/infrastructure/white-logo.gateway.js'

async function pixels(png: Uint8Array) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, height: info.height, width: info.width }
}

const at = (image: Awaited<ReturnType<typeof pixels>>, x: number, y: number) =>
  Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4))

describe('logo branco do e-mail', () => {
  test('PNG com transparência: o desenho vira branco e o alfa fica como estava', async () => {
    const source = await sharp({
      create: { background: { alpha: 0, b: 0, g: 0, r: 0 }, channels: 4, height: 20, width: 20 },
    })
      .composite([
        {
          input: await sharp({
            create: {
              background: { alpha: 1, b: 30, g: 40, r: 200 },
              channels: 4,
              height: 8,
              width: 8,
            },
          })
            .png()
            .toBuffer(),
          left: 6,
          top: 6,
        },
      ])
      .png()
      .toBuffer()

    const white = await pixels(await toWhiteLogoPng(source))

    expect(at(white, 10, 10)).toEqual([255, 255, 255, 255])
    expect(at(white, 1, 1)[3]).toBe(0)
  })

  test('JPG opaco de fundo chapado: o fundo some e o desenho vira branco', async () => {
    const source = await sharp({
      create: { background: { b: 255, g: 255, r: 255 }, channels: 3, height: 20, width: 20 },
    })
      .composite([
        {
          input: await sharp({
            create: { background: { b: 20, g: 20, r: 20 }, channels: 3, height: 8, width: 8 },
          })
            .png()
            .toBuffer(),
          left: 6,
          top: 6,
        },
      ])
      .jpeg({ quality: 95 })
      .toBuffer()

    const white = await pixels(await toWhiteLogoPng(source))

    expect(at(white, 1, 1)[3]).toBeLessThan(10)
    expect(at(white, 10, 10)).toEqual([255, 255, 255, 255])
  })

  test('logo grande é reduzido a 512 px e continua PNG', async () => {
    const source = await sharp({
      create: { background: { b: 0, g: 0, r: 0 }, channels: 3, height: 1000, width: 2000 },
    })
      .png()
      .toBuffer()

    const out = await sharp(await toWhiteLogoPng(source)).metadata()

    expect(out.format).toBe('png')
    expect(out.width).toBe(512)
  })
})
