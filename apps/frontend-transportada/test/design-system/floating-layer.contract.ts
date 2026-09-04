/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const SERVICE_PATH = 'src/components/ui/floatingLayer.service.ts'
const HOOK_PATH = 'src/components/ui/useFloatingLayer.hook.ts'
const SELECT_PATH = 'src/components/ui/select.tsx'
const DATE_PICKER_PATH = 'src/components/ui/date-picker.tsx'
const RANGE_PICKER_PATH = 'src/components/ui/date-range-picker.tsx'
const SELECT_STYLES_PATH = 'src/components/ui/select.module.css'
const SEARCHABLE_STYLES_PATH = 'src/components/ui/searchable-select.module.css'
const CALENDAR_STYLES_PATH = 'src/components/ui/date-range-picker.module.css'

type FloatingLayerModule = Readonly<{
  FLOATING_LAYER_GAP: number
  FLOATING_LAYER_MIN_HEIGHT: number
  isAnchorVisible: (input: {
    anchor: { bottom: number; left: number; right: number; top: number; width: number }
    viewport: { height: number; width: number }
  }) => boolean
  FLOATING_LAYER_VIEWPORT_MARGIN: number
  resolveFloatingLayerPosition: (
    input: Readonly<{
      align?: 'end' | 'start'
      anchor: Readonly<{ bottom: number; left: number; right: number; top: number; width: number }>
      layer: Readonly<{ height: number; width: number }>
      viewport: Readonly<{ height: number; width: number }>
    }>,
  ) => Readonly<{
    bottom: number | null
    left: number
    maxHeight: number
    minWidth: number
    placement: 'above' | 'below'
    top: number | null
  }>
}>

const ANCHOR = { bottom: 620, left: 200, right: 320, top: 580, width: 120 } as const
const LAYER = { height: 240, width: 160 } as const
const VIEWPORT = { height: 900, width: 1280 } as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function loadFloatingLayer(): Promise<FloatingLayerModule> {
  return await import('@/components/ui/floatingLayer.service')
}

describe('design system floating layer contract', () => {
  test('opens below the anchor while the space under it holds the layer', async () => {
    const { FLOATING_LAYER_GAP, FLOATING_LAYER_VIEWPORT_MARGIN, resolveFloatingLayerPosition } =
      await loadFloatingLayer()

    const position = resolveFloatingLayerPosition({
      anchor: ANCHOR,
      layer: LAYER,
      viewport: VIEWPORT,
    })

    expect(position.placement).toBe('below')
    expect(position.top).toBe(ANCHOR.bottom + FLOATING_LAYER_GAP)
    expect(position.bottom).toBeNull()
    expect(position.left).toBe(ANCHOR.left)
    expect(position.minWidth).toBe(ANCHOR.width)
    expect(position.maxHeight).toBe(
      VIEWPORT.height - ANCHOR.bottom - FLOATING_LAYER_GAP - FLOATING_LAYER_VIEWPORT_MARGIN,
    )
  })

  /** É o defeito relatado: dentro do modal a lista abria para baixo e o rodapé cortava as opções. */
  test('flips above the anchor when the space below no longer holds the layer', async () => {
    const { FLOATING_LAYER_GAP, resolveFloatingLayerPosition } = await loadFloatingLayer()

    const position = resolveFloatingLayerPosition({
      anchor: ANCHOR,
      layer: LAYER,
      viewport: { height: 700, width: VIEWPORT.width },
    })

    expect(position.placement).toBe('above')
    expect(position.bottom).toBe(700 - ANCHOR.top + FLOATING_LAYER_GAP)
    expect(position.top).toBeNull()
  })

  /**
   * É o defeito relatado no cadastro de veículo: o conteúdo mede muito mais que o teto de CSS do
   * painel, e a camada ancorada pelo topo calculado subia até a borda da janela.
   */
  test('anchors an above layer by its bottom edge, whatever height the content reports', async () => {
    const { FLOATING_LAYER_GAP, resolveFloatingLayerPosition } = await loadFloatingLayer()
    const anchor = { bottom: 880, left: 200, right: 320, top: 840, width: 120 } as const

    const position = resolveFloatingLayerPosition({
      anchor,
      layer: { height: 900, width: 160 },
      viewport: VIEWPORT,
    })

    expect(position.placement).toBe('above')
    expect(position.bottom).toBe(VIEWPORT.height - anchor.top + FLOATING_LAYER_GAP)
    expect(position.top).toBeNull()
  })

  test('never lets the layer grow past the visible space, keeping a scrollable minimum', async () => {
    const { FLOATING_LAYER_MIN_HEIGHT, resolveFloatingLayerPosition } = await loadFloatingLayer()

    const cramped = resolveFloatingLayerPosition({
      anchor: { bottom: 240, left: 200, right: 320, top: 200, width: 120 },
      layer: { height: 600, width: 160 },
      viewport: { height: 320, width: VIEWPORT.width },
    })

    expect(cramped.maxHeight).toBeGreaterThanOrEqual(FLOATING_LAYER_MIN_HEIGHT)
    expect(cramped.maxHeight).toBeLessThan(600)
    expect(cramped.bottom).toBeGreaterThanOrEqual(0)
  })

  /**
   * O piso de altura é o que mantinha a camada vazando: com pouco espaço abaixo e uma lista curta,
   * a camada ficava colada no gatilho com 96px e terminava fora da janela, empurrando o scroll da
   * página. Aqui o que se afirma é a borda de baixo, não a altura.
   */
  test('keeps a short layer inside the viewport when the minimum height exceeds the space below', async () => {
    const { FLOATING_LAYER_VIEWPORT_MARGIN, resolveFloatingLayerPosition } =
      await loadFloatingLayer()

    const viewport = { height: 320, width: VIEWPORT.width }
    const position = resolveFloatingLayerPosition({
      anchor: { bottom: 300, left: 200, right: 320, top: 268, width: 120 },
      layer: { height: 10, width: 160 },
      viewport,
    })

    expect(position.top).not.toBeNull()
    expect((position.top ?? 0) + position.maxHeight).toBeLessThanOrEqual(
      viewport.height - FLOATING_LAYER_VIEWPORT_MARGIN,
    )
  })

  test('never asks for a layer taller than the viewport', async () => {
    const { FLOATING_LAYER_VIEWPORT_MARGIN, resolveFloatingLayerPosition } =
      await loadFloatingLayer()

    const viewport = { height: 200, width: VIEWPORT.width }
    const position = resolveFloatingLayerPosition({
      anchor: { bottom: 190, left: 200, right: 320, top: 170, width: 120 },
      layer: { height: 10, width: 160 },
      viewport,
    })

    expect(position.maxHeight).toBeLessThanOrEqual(
      viewport.height - FLOATING_LAYER_VIEWPORT_MARGIN * 2,
    )
  })

  test('keeps the layer inside the viewport on both edges', async () => {
    const { FLOATING_LAYER_VIEWPORT_MARGIN, resolveFloatingLayerPosition } =
      await loadFloatingLayer()

    const overflowing = resolveFloatingLayerPosition({
      anchor: { bottom: 120, left: 1200, right: 1270, top: 80, width: 70 },
      layer: { height: 200, width: 320 },
      viewport: VIEWPORT,
    })
    const negative = resolveFloatingLayerPosition({
      anchor: { bottom: 120, left: -40, right: 30, top: 80, width: 70 },
      layer: { height: 200, width: 320 },
      viewport: VIEWPORT,
    })

    expect(overflowing.left + 320).toBeLessThanOrEqual(
      VIEWPORT.width - FLOATING_LAYER_VIEWPORT_MARGIN,
    )
    expect(negative.left).toBeGreaterThanOrEqual(FLOATING_LAYER_VIEWPORT_MARGIN)
  })

  test('aligns the layer by the right edge of the anchor when asked', async () => {
    const { resolveFloatingLayerPosition } = await loadFloatingLayer()

    const position = resolveFloatingLayerPosition({
      align: 'end',
      anchor: ANCHOR,
      layer: LAYER,
      viewport: VIEWPORT,
    })

    expect(position.left).toBe(ANCHOR.right - LAYER.width)
  })

  test('resolves the position with no browser dependency', async () => {
    const service = await readApplicationFile(SERVICE_PATH)

    expect(service).not.toContain('window')
    expect(service).not.toContain('document')
    expect(service).not.toContain('useState')
  })

  /** Fora de um portal a camada volta a ser recortada por qualquer ancestral com `overflow`. */
  test('escapes every scrolling ancestor through one shared floating layer', async () => {
    const [hook, select, datePicker, rangePicker] = await Promise.all([
      readApplicationFile(HOOK_PATH),
      readApplicationFile(SELECT_PATH),
      readApplicationFile(DATE_PICKER_PATH),
      readApplicationFile(RANGE_PICKER_PATH),
    ])

    expect(hook).toContain('export function useFloatingLayer')
    expect(hook).toContain('resolveFloatingLayerPosition')
    expect(hook).toContain('getBoundingClientRect')
    expect(hook).toContain("addEventListener('scroll'")
    expect(hook).toContain("addEventListener('resize'")

    for (const component of [select, datePicker, rangePicker]) {
      expect(component).toContain('useFloatingLayer')
      expect(component).toContain('createPortal')
      expect(component).toContain('document.body')
    }
  })

  test('positions every floating skin by the shared custom properties', async () => {
    const [selectStyles, searchableStyles, calendarStyles] = await Promise.all([
      readApplicationFile(SELECT_STYLES_PATH),
      readApplicationFile(SEARCHABLE_STYLES_PATH),
      readApplicationFile(CALENDAR_STYLES_PATH),
    ])

    for (const styles of [selectStyles, searchableStyles, calendarStyles]) {
      expect(styles).toContain('position: fixed')
      expect(styles).toContain('--floating-layer-top')
      // Sem a borda de baixo o painel acima do gatilho volta a ser posicionado por altura medida.
      expect(styles).toContain('--floating-layer-bottom')
      expect(styles).toContain('--floating-layer-left')
      expect(styles).toContain('--floating-layer-max-height')
      expect(styles).toContain('overflow-y: auto')
    }
    expect(selectStyles).toContain('--floating-layer-min-width')
  })

  test('states the rule for every future floating layer', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/selects.md'),
      readApplicationFile('../../CLAUDE.md'),
    ])

    expect(rule).toContain('useFloatingLayer')
    expect(projectContext).toContain('useFloatingLayer')
  })

  /**
   * Camada aberta com o gatilho fora da janela é camada órfã: ela continua no meio da tela e desliza
   * com a rolagem, sem nada ao lado que explique de onde saiu.
   */
  test('treats an anchor scrolled past either edge as no longer visible', async () => {
    const { isAnchorVisible } = await loadFloatingLayer()
    const viewport = { height: 900, width: 1440 }

    expect(
      isAnchorVisible({
        anchor: { bottom: 952, left: 200, right: 320, top: 904, width: 120 },
        viewport,
      }),
    ).toBe(false)
    expect(
      isAnchorVisible({
        anchor: { bottom: -4, left: 200, right: 320, top: -52, width: 120 },
        viewport,
      }),
    ).toBe(false)
  })

  test('keeps a partially cut anchor visible, so the list is not taken from under the reader', async () => {
    const { isAnchorVisible } = await loadFloatingLayer()

    expect(
      isAnchorVisible({
        anchor: { bottom: 920, left: 200, right: 320, top: 872, width: 120 },
        viewport: { height: 900, width: 1440 },
      }),
    ).toBe(true)
  })
})

describe('a rolagem da lista não fecha a própria lista', () => {
  const LISTAS_FLUTUANTES = [
    'select.module.css',
    'multi-select.module.css',
    'searchable-select.module.css',
    'date-range-picker.module.css',
  ] as const

  /**
   * ⚠️ **A rolagem encadeada fechava a camada, e o gesto era o de chegar ao fim das opções.**
   * `useFloatingLayer` dispensa a camada quando a **página** rola — por desenho: presa ao gatilho
   * ela atravessaria a tela enquanto alguém rola para ler outra coisa. Só que uma lista com
   * `overflow-y: auto` e sem contenção encadeia a rolagem para a página ao bater no fim, e aí o
   * próprio ato de alcançar a última opção fecha a lista.
   *
   * Foi assim que ele apareceu: o smoke de faturamento clicava numa opção, o navegador rolou a
   * lista para trazê-la à vista, o encadeamento rolou a página, a camada fechou e o clique esperou
   * por um elemento que já não existia. Só reprovava na CI, onde a máquina carregada muda o
   * enquadramento — aqui a opção cabia na tela sem rolagem nenhuma.
   */
  for (const arquivo of LISTAS_FLUTUANTES) {
    test(`${arquivo} contém a rolagem dentro da camada`, async () => {
      const css = await readApplicationFile(`src/components/ui/${arquivo}`)
      expect(css).toContain('overflow-y: auto')
      expect(css).toContain('overscroll-behavior: contain')
    })
  }
})
