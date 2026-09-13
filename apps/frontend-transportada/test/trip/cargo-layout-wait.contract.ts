/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import tripEnglish from '../../src/modules/trip/locales/trip.en.locale.json'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import {
  type CargoLayoutView,
  rememberShownCargoLayout,
  withRememberedCargoLayout,
} from '../../src/modules/trip/shared/cargoLayoutPolling.service'
import {
  applyCargoLayoutTransition,
  easeCargoTransition,
  listCargoBoxMatchKeys,
  planCargoLayoutTransition,
  shouldAnimateCargoLayout,
} from '../../src/modules/trip/shared/cargoLayoutTransition.service'
import {
  CARGO_LAYOUT_TRANSITION_MAX_BOXES,
  CARGO_LAYOUT_TRANSITION_MS,
} from '../../src/modules/trip/shared/trip.constant'
import type { TripCargoLayout, TripPlacedBox } from '../../src/modules/trip/shared/trip.types'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
}

function placedBox(overrides: Partial<TripPlacedBox> = {}): TripPlacedBox {
  return {
    depthM: 0.4,
    documentId: 'nota-1',
    documentNumber: '101',
    heightM: 0.3,
    isFragile: false,
    label: 'caixa',
    layer: 0,
    reasons: [],
    source: 'measured',
    stopSequence: 1,
    widthM: 0.5,
    xM: 0,
    yM: 0,
    zM: 0,
    ...overrides,
  }
}

function layoutWith(boxes: readonly TripPlacedBox[]): TripCargoLayout {
  return {
    bedHeightM: '2.00',
    bedLengthM: '4.00',
    bedSource: 'measured',
    bedWidthM: '2.00',
    placement: { layers: [{ boxes, heightM: 0.3, index: 0 }], source: 'measured', unplaced: [] },
  } as unknown as TripCargoLayout
}

function view(overrides: Partial<CargoLayoutView>): CargoLayoutView {
  return {
    errorCode: null,
    layout: null,
    phase: 'ready',
    stale: false,
    truncated: false,
    ...overrides,
  }
}

const LAYERS = 'src/modules/trip/components/TripCargoLayers.component.tsx'
const WAIT = 'src/modules/trip/components/TripCargoLayoutWait.component.tsx'
const TRANSITION_HOOK = 'src/modules/trip/hooks/useCargoLayoutTransition.hook.ts'

describe('a tela durante a espera da planta (spec 145 T13, D4/D13/D16/D18)', () => {
  const layers = readApplicationFile(LAYERS)
  const wait = readApplicationFile(WAIT)

  describe('pending (D4)', () => {
    it('mostra o selo "reorganizando a carga" como status educado, com texto', () => {
      expect(wait).toContain("t('cargoLayers.wait.reorganizing')")
      expect(wait).toMatch(/role="status"/u)
      expect(wait).toMatch(/aria-live="polite"/u)
      expect(trip.cargoLayers.wait.reorganizing.toLowerCase()).toContain('reorganizando a carga')
    })

    it('desenha o esqueleto do baú no mesmo sistema de escala da planta', () => {
      expect(wait).toContain('<CargoIsometric')
      expect(wait).toContain('styles.cargoWireframe')
      /** Sem medida nenhuma, o esqueleto do design system — nunca texto solto nem `null`. */
      expect(wait).toContain('<Skeleton')
    })

    it('desenha a planta anterior como fantasma translúcido', () => {
      expect(wait).toContain('styles.cargoGhost')
      expect(wait).toContain("t('cargoLayers.wait.ghostLabel')")
    })

    it('marca "desatualizada" quando a planta mostrada é a anterior', () => {
      expect(wait).toContain("t('cargoLayers.wait.stale')")
      expect(trip.cargoLayers.wait.stale.toLowerCase()).toContain('desatualizada')
    })

    it('despacha pending, failed e timedOut para a espera', () => {
      expect(layers).toContain('<TripCargoLayoutWait')
      for (const phase of ['pending', 'failed', 'timedOut']) expect(layers).toContain(`'${phase}'`)
    })
  })

  describe('failed / timedOut (D16/D18)', () => {
    it('diz que não foi possível calcular agora, sem botão de tentar de novo', () => {
      expect(wait).toContain("t('cargoLayers.wait.failed')")
      expect(trip.cargoLayers.wait.failed.toLowerCase()).toContain(
        'não foi possível calcular a planta agora',
      )
      const code = withoutComments(wait)
      expect(code).not.toContain('<Button')
      expect(code).not.toMatch(/refetch|retry/iu)
    })

    it('sem mascote nem personagem (G012)', () => {
      expect(withoutComments(wait)).not.toMatch(/mascot|mascote/iu)
    })
  })

  describe('truncated (D13)', () => {
    it('avisa discretamente que a planta ficou incompleta por tempo', () => {
      expect(layers).toContain("t('cargoLayers.wait.truncated')")
      expect(trip.cargoLayers.wait.truncated.toLowerCase()).toContain('planta incompleta')
    })

    it('dá rótulo legível ao motivo time_budget na lista do que ficou de fora', () => {
      expect(trip.cargoLayers.unplaced.time_budget).toContain('tempo')
      expect(tripEnglish.cargoLayers.unplaced.time_budget.length).toBeGreaterThan(0)
    })
  })

  describe('unavailable / null (API antiga)', () => {
    it('segue a planta de hoje, com "meça o caminhão"', () => {
      expect(layers).toContain('layout.bedLengthM === null || layout.bedWidthM === null')
      expect(layers).toContain("t('cargoLayers.missingBed')")
      /** `null` e `unavailable` nunca caem na espera. */
      expect(layers).toMatch(/WAITING_PHASES/u)
      expect(withoutComments(layers)).not.toMatch(/WAITING_PHASES[^\n]*'unavailable'/u)
    })
  })

  describe('design system e textos', () => {
    it('nenhum <svg> cru nos componentes da espera', () => {
      expect(withoutComments(wait)).not.toContain('<svg')
      expect(withoutComments(layers)).not.toContain('<svg')
    })

    it('sem estilo inline nos componentes da espera', () => {
      expect(withoutComments(wait)).not.toContain('style={')
    })

    it('todo texto novo mora nos dois locales', () => {
      for (const key of [
        'reorganizing',
        'stale',
        'failed',
        'truncated',
        'ghostLabel',
        'skeletonLabel',
      ]) {
        expect(trip.cargoLayers.wait).toHaveProperty(key)
        expect(tripEnglish.cargoLayers.wait).toHaveProperty(key)
      }
    })
  })

  describe('fiação nas três telas', () => {
    it('o painel repassa o estado e a medida do baú à planta', () => {
      const panel = readApplicationFile('src/modules/trip/components/TripCargoPanel.component.tsx')
      expect(panel).toContain('view={layoutView ?? null}')
      expect(panel).toContain('bedDimensions={occupancy.capacityDimensions}')
    })

    it('detalhe, criação rápida e proposta passam o estado da planta', () => {
      expect(readApplicationFile('src/modules/trip/components/TripDetail.component.tsx')).toContain(
        'layoutView={workspace.cargoLayoutView}',
      )
      expect(
        readApplicationFile('src/modules/trip/components/TripQuickCreateDialog.component.tsx'),
      ).toContain('layoutView={cargoPreview.cargoLayoutView}')
      expect(
        readApplicationFile('src/modules/trip/components/TripProposalDetail.component.tsx'),
      ).toContain('layoutView={cargo.cargoLayoutView}')
    })

    it('a prévia guarda a última planta exibida para o fantasma', () => {
      const hook = readApplicationFile('src/modules/trip/hooks/useTripCargoPreview.hook.ts')
      expect(hook).toContain('rememberShownCargoLayout')
      expect(hook).toContain('withRememberedCargoLayout')
    })
  })
})

describe('prévia: a última planta exibida vira fantasma (D4 derivada)', () => {
  const shown = layoutWith([placedBox()])

  it('lembra a planta pronta que a tela mostrou', () => {
    expect(rememberShownCargoLayout({ previous: null, view: view({ layout: shown }) })).toBe(shown)
  })

  it('não esquece a anterior enquanto a nova calcula', () => {
    const pending = view({ phase: 'pending' })
    expect(rememberShownCargoLayout({ previous: shown, view: pending })).toBe(shown)
    expect(rememberShownCargoLayout({ previous: shown, view: null })).toBe(shown)
  })

  it('pending sem planta servida recebe a lembrada, marcada como desatualizada', () => {
    const result = withRememberedCargoLayout({
      remembered: shown,
      view: view({ phase: 'pending' }),
    })
    expect(result?.layout).toBe(shown)
    expect(result?.stale).toBe(true)
  })

  it('failed e timedOut também mostram a anterior', () => {
    for (const phase of ['failed', 'timedOut'] as const) {
      expect(withRememberedCargoLayout({ remembered: shown, view: view({ phase }) })?.layout).toBe(
        shown,
      )
    }
  })

  it('sem planta anterior: só esqueleto e selo', () => {
    const pending = view({ phase: 'pending' })
    expect(withRememberedCargoLayout({ remembered: null, view: pending })).toBe(pending)
  })

  it('não mexe em ready, unavailable nem na API antiga', () => {
    const unavailable = view({ phase: 'unavailable' })
    expect(withRememberedCargoLayout({ remembered: shown, view: unavailable })).toBe(unavailable)
    expect(withRememberedCargoLayout({ remembered: shown, view: null })).toBeNull()
  })
})

describe('a planta nova chega animada (D4)', () => {
  it('casa caixas por nota, medida (qualquer giro) e ordinal', () => {
    const keys = listCargoBoxMatchKeys([
      placedBox(),
      placedBox({ xM: 1 }),
      placedBox({ depthM: 0.5, widthM: 0.4 }),
      placedBox({ documentId: null, stopSequence: 2 }),
    ])
    expect(keys[0]).not.toBe(keys[1])
    /** A mesma caixa girada é a mesma caixa: a terceira é a terceira ocorrência da medida. */
    expect(keys[2]).toBe(listCargoBoxMatchKeys([placedBox(), placedBox(), placedBox()])[2])
    expect(keys[3]).toContain('stop-2')
  })

  it('separa quem desliza, quem entra e quem sai', () => {
    const previous = [placedBox({ xM: 0 }), placedBox({ documentId: 'nota-sai' })]
    const next = [placedBox({ xM: 2 }), placedBox({ documentId: 'nota-entra' })]
    const plan = planCargoLayoutTransition({ next, previous })
    const [movedKey, enteringKey] = listCargoBoxMatchKeys(next)

    expect(plan.origins.get(movedKey ?? '')).toEqual({ xM: 0, yM: 0, zM: 0 })
    expect(plan.entering.has(enteringKey ?? '')).toBe(true)
    expect(plan.leaving.map((entry) => entry.box.documentId)).toEqual(['nota-sai'])
  })

  it('interpola a posição e marca entrada e saída no quadro', () => {
    const previous = [placedBox({ xM: 0 }), placedBox({ documentId: 'nota-sai' })]
    const next = [placedBox({ xM: 2 }), placedBox({ documentId: 'nota-entra' })]
    const plan = planCargoLayoutTransition({ next, previous })
    const drawn = applyCargoLayoutTransition({
      boxes: next.map((box, index) => ({ id: String(index), xM: box.xM, yM: box.yM, zM: box.zM })),
      frame: { plan, progress: 0.5 },
      keys: listCargoBoxMatchKeys(next),
      toLeaving: (box, key) => ({ id: `leaving-${key}`, xM: box.xM, yM: box.yM, zM: box.zM }),
    })

    expect(drawn[0]?.xM).toBe(1)
    expect(drawn[1]?.appearance).toBe('entering')
    expect(drawn.at(-1)?.appearance).toBe('leaving')
  })

  it('sem quadro, a planta sai como veio', () => {
    const boxes = [{ id: 'a', xM: 2, yM: 0, zM: 0 }]
    expect(
      applyCargoLayoutTransition({
        boxes,
        frame: null,
        keys: ['k'],
        toLeaving: (box, key) => ({ id: key, xM: box.xM, yM: box.yM, zM: box.zM }),
      }),
    ).toBe(boxes)
  })

  it('suaviza o começo e o fim', () => {
    expect(easeCargoTransition(0)).toBe(0)
    expect(easeCargoTransition(1)).toBe(1)
    expect(easeCargoTransition(0.5)).toBeCloseTo(0.5)
    expect(easeCargoTransition(2)).toBe(1)
  })

  it('prefers-reduced-motion desliga a animação: troca direta', () => {
    expect(shouldAnimateCargoLayout({ boxCount: 10, prefersReducedMotion: true })).toBe(false)
    expect(shouldAnimateCargoLayout({ boxCount: 10, prefersReducedMotion: false })).toBe(true)
    expect(
      shouldAnimateCargoLayout({
        boxCount: CARGO_LAYOUT_TRANSITION_MAX_BOXES + 1,
        prefersReducedMotion: false,
      }),
    ).toBe(false)
  })

  it('o hook consulta prefers-reduced-motion e anima por quadro, com limpeza', () => {
    const hook = readApplicationFile(TRANSITION_HOOK)
    expect(hook).toContain("'(prefers-reduced-motion: reduce)'")
    expect(hook).toContain('requestAnimationFrame')
    expect(hook).toContain('cancelAnimationFrame')
    expect(readApplicationFile(LAYERS)).toContain('useCargoLayoutTransition')
  })

  it('o CSS de entrada e saída dura o mesmo que o hook, e para sob reduced-motion', () => {
    const isometric = readApplicationFile('src/components/ui/cargo-isometric.module.css')
    expect(isometric).toContain('.boxEntering')
    expect(isometric).toContain('.boxLeaving')
    expect(isometric).toContain(`${String(CARGO_LAYOUT_TRANSITION_MS)}ms`)
    expect(isometric).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/u)

    const module = readApplicationFile('src/modules/trip/styles/trip.module.css')
    expect(module).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.cargoWireframe\s*\{\s*animation: none/u,
    )
  })
})
