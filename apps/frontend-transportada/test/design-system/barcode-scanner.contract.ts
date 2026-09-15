/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { decodeBarcodeFrame, type BarcodeFrame } from '@/components/ui/barcodeDecoder.service'
import {
  createNativeBarcodeDetector,
  isCameraCapable,
  NATIVE_BARCODE_FORMATS,
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

/**
 * ⚠️ A leitura é de **código de barras**, não de QR — os dois continuam suportados, mas o linear
 * vem primeiro. Code-128 é a chave da DANFE; ITF cobre a caixa de papelão (DUN-14); QR fica por
 * último por ser o formato mais caro de decodificar e o menos comum numa etiqueta de caixa.
 */
describe('ordem dos formatos: lineares primeiro, QR por último', () => {
  it('a lista nativa pede os lineares antes do QR', () => {
    expect(NATIVE_BARCODE_FORMATS).toEqual([
      'code_128',
      'ean_13',
      'ean_8',
      'upc_a',
      'upc_e',
      'itf',
      'code_39',
      'qr_code',
    ])
  })

  it('o zxing tenta os leitores lineares antes do QRCodeReader, na mesma ordem', async () => {
    const source = await readApplicationFile('src/components/ui/barcodeDecoder.service.ts')
    const order = [
      'Code128Reader',
      'EAN13Reader',
      'EAN8Reader',
      'UPCAReader',
      'UPCEReader',
      'ITFReader',
      'Code39Reader',
      'QRCodeReader',
    ]
    const positions = order.map((name) => source.indexOf(`new ${name}()`))
    expect(positions.every((position) => position !== -1)).toBe(true)
    expect(positions).toEqual([...positions].sort((first, second) => first - second))
  })

  it('só pede ao navegador os formatos que getSupportedFormats() devolve', async () => {
    const requested: string[] = []
    class FakeBarcodeDetector {
      static getSupportedFormats(): Promise<readonly string[]> {
        return Promise.resolve(['qr_code', 'code_128', 'itf'])
      }
      constructor(options: Readonly<{ formats: readonly string[] }>) {
        requested.push(...options.formats)
      }
      detect(): Promise<readonly Readonly<{ rawValue: string }>[]> {
        return Promise.resolve([])
      }
    }
    const detector = await createNativeBarcodeDetector({ BarcodeDetector: FakeBarcodeDetector })
    expect(detector).toBeDefined()
    /** A ordem pedida ainda é a de `NATIVE_BARCODE_FORMATS`, não a devolvida pelo navegador. */
    expect(requested).toEqual(['code_128', 'itf', 'qr_code'])
  })

  it('sem getSupportedFormats, cai para trás pedindo a lista inteira', async () => {
    const requested: string[] = []
    class FakeBarcodeDetector {
      constructor(options: Readonly<{ formats: readonly string[] }>) {
        requested.push(...options.formats)
      }
      detect(): Promise<readonly Readonly<{ rawValue: string }>[]> {
        return Promise.resolve([])
      }
    }
    await createNativeBarcodeDetector({ BarcodeDetector: FakeBarcodeDetector })
    expect(requested).toEqual([...NATIVE_BARCODE_FORMATS])
  })

  it('nenhum formato suportado é indisponibilidade, não detector sem formato', async () => {
    class FakeBarcodeDetector {
      static getSupportedFormats(): Promise<readonly string[]> {
        return Promise.resolve(['aztec'])
      }
      constructor() {
        throw new Error('não deveria construir sem formato suportado')
      }
      detect(): Promise<readonly Readonly<{ rawValue: string }>[]> {
        return Promise.resolve([])
      }
    }
    const detector = await createNativeBarcodeDetector({ BarcodeDetector: FakeBarcodeDetector })
    expect(detector).toBeUndefined()
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

  it('a regra está documentada e referenciada no CLAUDE.md da app', async () => {
    const doc = await Bun.file(
      new URL('../../../../docs/frontend/barcode-scanner.md', import.meta.url),
    ).text()
    expect(doc).toContain('worker')
    expect(doc).toContain('BarcodeDetector')
    const claudeMd = await Bun.file(new URL('../../CLAUDE.md', import.meta.url)).text()
    expect(claudeMd).toContain('docs/frontend/barcode-scanner.md')
  })
})

/**
 * ⚠️ O defeito relatado: "Ler etiqueta" pedia a permissão da câmera, mas nenhum preview aparecia —
 * o componente nascia depois da lista inteira de caixas, fora da área visível, e nada rolava até
 * ele. A correção é estrutural: o primitivo se desenha em camada por cima da página, nunca como
 * conteúdo inline no fluxo de quem o hospeda.
 */
describe('a câmera abre em camada por cima da página, não atrás da lista', () => {
  it('usa portal para o body — nasce fora do fluxo de quem o hospeda', async () => {
    const component = await readApplicationFile('src/components/ui/barcode-scanner.tsx')
    expect(component).toContain("from 'react-dom'")
    expect(component).toContain('createPortal')
    expect(component).toContain('document.body')
  })

  it('usa o diálogo modal compartilhado — foco entra ao abrir, Esc fecha, foco volta ao fechar', async () => {
    const component = await readApplicationFile('src/components/ui/barcode-scanner.tsx')
    expect(component).toContain("from '@/modules/shared/useModalDialog.hook'")
    expect(component).toContain('useModalDialog')
    expect(component).toContain('handleKeyDown')
  })

  it('declara papel de diálogo modal com rótulo', async () => {
    const component = await readApplicationFile('src/components/ui/barcode-scanner.tsx')
    expect(component).toContain('role="dialog"')
    expect(component).toContain('aria-modal="true"')
    expect(component).toContain('aria-labelledby={TITLE_ID}')
  })

  it('é mobile-first: tela cheia no celular, caixa centralizada só a partir de tablet: (40rem)', async () => {
    const css = await readApplicationFile('src/components/ui/barcode-scanner.module.css')
    expect(css).not.toContain('max-width')
    expect(css).toMatch(/@media \(min-width: 40rem\)/)
    expect(css).toContain('position: fixed')
    expect(css).toContain('inset: 0')
  })
})

describe('a moldura de mira sobre o vídeo', () => {
  it('tem cantos marcados, faixa de leitura e escurece o que fica fora dela', async () => {
    const css = await readApplicationFile('src/components/ui/barcode-scanner.module.css')
    expect(css).toContain('.corner')
    expect(css).toContain('.guideBand')
    expect(css).toContain('box-shadow')
  })

  it('a faixa de leitura anima, mas trava parada sob prefers-reduced-motion: reduce', async () => {
    const css = await readApplicationFile('src/components/ui/barcode-scanner.module.css')
    expect(css).toContain('@keyframes barcodeScannerSweep')
    expect(css).toContain('animation: barcodeScannerSweep')
    const reducedMotionBlock = css.split('@media (prefers-reduced-motion: reduce)')[1]
    expect(reducedMotionBlock).toBeDefined()
    expect(reducedMotionBlock).toContain('animation: none')
  })

  it('o texto de instrução não depende só de cor — aparece como texto sobre a moldura', async () => {
    const component = await readApplicationFile('src/components/ui/barcode-scanner.tsx')
    expect(component).toContain('readingMessage')
    expect(component).toContain('styles.instruction')
  })
})

/**
 * ⚠️ Quem decide se a leitura serve é o módulo que hospeda o leitor (achou a caixa? achou a
 * nota?) — o primitivo só mostra o resultado dessa decisão e não para de ler sozinho.
 */
describe('resultado da leitura decidido por quem hospeda', () => {
  it('o laço de decodificação não cancela mais no primeiro acerto', async () => {
    const hook = await readApplicationFile('src/components/ui/useBarcodeScanner.hook.ts')
    /** Só resta uma atribuição — a do cleanup de desmontagem, não a de cada leitura bem-sucedida. */
    expect(hook.match(/isCancelled = true/g)).toHaveLength(1)
    expect(hook).toContain('REPEAT_ANNOUNCE_COOLDOWN_MS')
  })

  it('a prop feedback pinta achou de --color-ready e não achou de --color-alert', async () => {
    const component = await readApplicationFile('src/components/ui/barcode-scanner.tsx')
    expect(component).toContain('BarcodeScannerFeedback')
    expect(component).toContain("feedback?.kind !== 'found'")
    const css = await readApplicationFile('src/components/ui/barcode-scanner.module.css')
    expect(css).toContain("[data-feedback='found']")
    expect(css).toContain('var(--color-ready)')
    expect(css).toContain("[data-feedback='notFound']")
    expect(css).toContain('var(--color-alert)')
  })

  it('vibra uma vez por acerto quando o aparelho suporta', async () => {
    const component = await readApplicationFile('src/components/ui/barcode-scanner.tsx')
    expect(component).toContain('navigator.vibrate?.(FOUND_VIBRATION_MS)')
  })
})
