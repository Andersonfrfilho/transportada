/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const SERVICE_PATH = 'src/components/ui/floatingLayer.service.ts'
const HOOK_PATH = 'src/components/ui/useFloatingLayer.hook.ts'
const SELECT_PATH = 'src/components/ui/select.tsx'
const DATE_PICKER_PATH = 'src/components/ui/date-picker.tsx'
const RANGE_PICKER_PATH = 'src/components/ui/date-range-picker.tsx'
const SELECT_STYLES_PATH = 'src/components/ui/select.module.css'
const CALENDAR_STYLES_PATH = 'src/components/ui/date-range-picker.module.css'

type FloatingLayerModule = Readonly<{
  FLOATING_LAYER_GAP: number
  FLOATING_LAYER_MIN_HEIGHT: number
  FLOATING_LAYER_VIEWPORT_MARGIN: number
  resolveFloatingLayerPosition: (
    input: Readonly<{
      align?: 'end' | 'start'
      anchor: Readonly<{ bottom: number; left: number; right: number; top: number; width: number }>
      layer: Readonly<{ height: number; width: number }>
      viewport: Readonly<{ height: number; width: number }>
    }>,
  ) => Readonly<{
    left: number
    maxHeight: number
    minWidth: number
    placement: 'above' | 'below'
    top: number
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
    expect(position.top).toBe(ANCHOR.top - FLOATING_LAYER_GAP - LAYER.height)
    expect(position.top).toBeGreaterThanOrEqual(0)
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
    expect(cramped.top).toBeGreaterThanOrEqual(0)
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

  test('positions both floating skins by the shared custom properties', async () => {
    const [selectStyles, calendarStyles] = await Promise.all([
      readApplicationFile(SELECT_STYLES_PATH),
      readApplicationFile(CALENDAR_STYLES_PATH),
    ])

    for (const styles of [selectStyles, calendarStyles]) {
      expect(styles).toContain('position: fixed')
      expect(styles).toContain('--floating-layer-top')
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
})
