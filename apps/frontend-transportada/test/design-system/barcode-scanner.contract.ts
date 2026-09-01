/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { decodeBarcodeFrame, type BarcodeFrame } from '@/components/ui/barcodeDecoder.service'
import {
  isCameraCapable,
  openCameraStream,
  stopCameraStream,
  toLuminance,
} from '@/components/ui/barcodeScanner.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/** Code-128: cada padrão são larguras alternadas começando por barra. */
const CODE_128_START_C = 105
const CODE_128_STOP = 106
const MODULE_WIDTH = 3
const QUIET_ZONE_MODULES = 12

async function loadCode128Patterns(): Promise<readonly (readonly number[])[]> {
  const module = (await import('@zxing/library/esm/core/oned/Code128Reader.js')) as unknown as {
    default: Readonly<{ CODE_PATTERNS?: readonly (readonly number[])[] }>
  }
  const patterns = module.default.CODE_PATTERNS
  if (patterns === undefined) throw new Error('Code128Reader.CODE_PATTERNS saiu do zxing')
  return patterns
}

function toCode128CValues(digits: string): readonly number[] {
  const values: number[] = []
  for (let index = 0; index < digits.length; index += 2) {
    values.push(Number(digits.slice(index, index + 2)))
  }
  return values
}

async function renderCode128C(digits: string): Promise<BarcodeFrame> {
  const patterns = await loadCode128Patterns()
  const values = toCode128CValues(digits)
  const checksum =
    values.reduce((total, value, index) => total + value * (index + 1), CODE_128_START_C) % 103
  const symbols = [CODE_128_START_C, ...values, checksum, CODE_128_STOP]

  const modules: number[] = Array.from({ length: QUIET_ZONE_MODULES }, () => 255)
  for (const symbol of symbols) {
    const pattern = patterns[symbol]
    if (pattern === undefined) throw new Error(`padrão ausente: ${symbol}`)
    pattern.forEach((width, position) => {
      const tone = position % 2 === 0 ? 0 : 255
      for (let repeat = 0; repeat < width; repeat += 1) modules.push(tone)
    })
  }
  modules.push(...Array.from({ length: QUIET_ZONE_MODULES }, () => 255))

  const width = modules.length * MODULE_WIDTH
  const height = 24
  const luminance = new Uint8ClampedArray(width * height)
  modules.forEach((tone, index) => {
    for (let column = 0; column < MODULE_WIDTH; column += 1) {
      for (let row = 0; row < height; row += 1) {
        luminance[row * width + index * MODULE_WIDTH + column] = tone
      }
    }
  })
  return { height, luminance, width }
}

describe('primitivo de leitura de etiqueta', () => {
  it('não promete câmera quando o navegador não tem getUserMedia', () => {
    expect(isCameraCapable(undefined)).toBe(false)
    expect(isCameraCapable({})).toBe(false)
    expect(isCameraCapable({ mediaDevices: {} })).toBe(false)
    expect(isCameraCapable({ mediaDevices: { getUserMedia: () => undefined } })).toBe(true)
  })

  it('devolve indisponibilidade em vez de exceção quando não há câmera', async () => {
    expect(await openCameraStream(undefined)).toEqual({ status: 'unavailable' })
    expect(await openCameraStream({ mediaDevices: {} })).toEqual({ status: 'unavailable' })
  })

  it('distingue permissão negada de indisponibilidade, sem lançar', async () => {
    const denied = {
      mediaDevices: {
        getUserMedia: () =>
          Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })),
      },
    }
    const broken = {
      mediaDevices: {
        getUserMedia: () =>
          Promise.reject(Object.assign(new Error('no'), { name: 'NotReadableError' })),
      },
    }
    expect(await openCameraStream(denied)).toEqual({ status: 'denied' })
    expect(await openCameraStream(broken)).toEqual({ status: 'unavailable' })
  })

  it('pede a câmera traseira e devolve a trilha aberta', async () => {
    const stream = { getTracks: () => [] }
    let received: unknown
    const source = {
      mediaDevices: {
        getUserMedia: (constraints: unknown) => {
          received = constraints
          return Promise.resolve(stream)
        },
      },
    }
    const result = await openCameraStream(source)
    expect(result).toEqual({ status: 'ready', stream })
    expect(JSON.stringify(received)).toContain('environment')
  })

  it('encerra toda trilha ao fechar', () => {
    const stopped: string[] = []
    const stream = {
      getTracks: () => [
        { stop: () => stopped.push('video') },
        { stop: () => stopped.push('audio') },
      ],
    }
    stopCameraStream(stream)
    stopCameraStream(undefined)
    expect(stopped).toEqual(['video', 'audio'])
  })

  it('converte RGBA em um byte de luminância por pixel', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 255, 255, 255, 255])
    expect(Array.from(toLuminance(rgba))).toEqual([64, 255])
  })

  it('lê a chave de 44 caracteres de um Code-128 sem DOM', async () => {
    expect(typeof document).toBe('undefined')
    const key = '35260812345678000199550010000123456100000001'
    const frame = await renderCode128C(key)
    expect(decodeBarcodeFrame(frame)).toBe(key)
  })

  it('devolve nulo — não exceção — no quadro sem etiqueta', () => {
    const width = 64
    const height = 32
    const luminance = new Uint8ClampedArray(width * height).fill(255)
    expect(decodeBarcodeFrame({ height, luminance, width })).toBeNull()
  })
})

describe('convenção do leitor de etiqueta', () => {
  it('empacota o worker pelo Vite, nunca por blob:', async () => {
    const hook = await readApplicationFile('src/components/ui/useBarcodeScanner.hook.ts')
    expect(hook).toContain('import.meta.url')
    expect(hook).toContain("type: 'module'")
    expect(hook).toContain('barcodeDecoder.worker')
    for (const filePath of [
      'src/components/ui/barcode-scanner.tsx',
      'src/components/ui/useBarcodeScanner.hook.ts',
      'src/components/ui/barcodeScanner.service.ts',
      'src/components/ui/barcodeDecoder.service.ts',
      'src/components/ui/barcodeDecoder.worker.ts',
    ]) {
      const source = await readApplicationFile(filePath)
      expect(source).not.toContain('blob:')
      expect(source).not.toContain('createObjectURL')
      expect(source).not.toContain('<svg')
    }
  })

  it('libera a câmera e o worker ao desmontar', async () => {
    const hook = await readApplicationFile('src/components/ui/useBarcodeScanner.hook.ts')
    expect(hook).toContain('stopCameraStream')
    expect(hook).toContain('terminate()')
  })

  it('o botão só de ícone declara aria-label e usa o primitivo de ícone', async () => {
    const component = await readApplicationFile('src/components/ui/barcode-scanner.tsx')
    expect(component).toContain("from '@/components/ui/icon'")
    expect(component).toContain('aria-label')
  })

  it('a regra está documentada e referenciada na raiz', async () => {
    const doc = await Bun.file(
      new URL('../../../../docs/frontend/barcode-scanner.md', import.meta.url),
    ).text()
    expect(doc).toContain('worker')
    expect(doc).toContain('BarcodeDetector')
    const claudeMd = await Bun.file(new URL('../../../../CLAUDE.md', import.meta.url)).text()
    expect(claudeMd).toContain('docs/frontend/barcode-scanner.md')
  })
})
