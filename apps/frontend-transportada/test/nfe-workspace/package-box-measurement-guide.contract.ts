/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  hasSeenMeasurementGuide,
  markMeasurementGuideSeen,
  MEASUREMENT_GUIDE_STORAGE_KEY,
} from '../../src/modules/nfe-workspace/shared/measurementGuideSeen.service'

const ROOT = new URL('../..', import.meta.url)

function read(path: string): Promise<string> {
  return Bun.file(new URL(path, ROOT)).text()
}

type StorageStub = Readonly<{
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}>

function createStorage(): StorageStub & { readonly values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    values,
  }
}

const THROWING_STORAGE: StorageStub = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('guia "Como medir" da medida pela câmera', () => {
  test('abre sozinho só na primeira vez, e lembra depois de fechado', () => {
    const storage = createStorage()
    expect(hasSeenMeasurementGuide(storage)).toBe(false)
    markMeasurementGuideSeen(storage)
    expect(storage.values.get(MEASUREMENT_GUIDE_STORAGE_KEY)).toBe('1')
    expect(hasSeenMeasurementGuide(storage)).toBe(true)
  })

  test('armazenamento bloqueado nunca quebra a tela: o guia só volta a abrir sozinho', () => {
    expect(hasSeenMeasurementGuide(THROWING_STORAGE)).toBe(false)
    expect(() => markMeasurementGuideSeen(THROWING_STORAGE)).not.toThrow()
    expect(hasSeenMeasurementGuide(undefined)).toBe(false)
  })

  test('a etapa Medida oferece o guia por botão e o abre na primeira vez', async () => {
    const flow = await read(
      'src/modules/nfe-workspace/components/PackageBoxCameraFlow.component.tsx',
    )
    expect(flow).toContain('<PackageBoxMeasurementGuide')
    expect(flow).toContain("t('packageBoxes.guide.open')")
    expect(flow).toContain('hasSeenMeasurementGuide(')
  })

  test('o desenho é CSS do design system, sem <svg> cru', async () => {
    const illustration = await read('src/components/ui/box-measurement-illustration.tsx')
    expect(illustration).not.toContain('<svg')
    expect(illustration).toContain('export function BoxMeasurementIllustration')
    const guide = await read(
      'src/modules/nfe-workspace/components/PackageBoxMeasurementGuide.component.tsx',
    )
    expect(guide).toContain('<BoxMeasurementIllustration')
  })

  test('o preview ao vivo mostra onde vai o cartão, e a foto congelada diz qual é cada ponto', async () => {
    const scanner = await read('src/components/ui/box-dimension-scanner.tsx')
    expect(scanner).toContain('framingHintLabel')
    expect(scanner).toContain('markingHintLabel')
    expect(scanner).toContain('pointShortLabels[key]')
    expect(scanner).toContain('<BoxMeasurementIllustration')
  })

  test('todo passo do guia existe em pt-BR e em inglês', async () => {
    const [portuguese, english] = await Promise.all([
      read('src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'),
      read('src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'),
    ])
    type Guide = Readonly<{
      steps: Readonly<Record<string, string>>
      avoid: Readonly<Record<string, string>>
    }>
    const portugueseGuide = (JSON.parse(portuguese) as { packageBoxes: { guide: Guide } })
      .packageBoxes.guide
    const englishGuide = (JSON.parse(english) as { packageBoxes: { guide: Guide } }).packageBoxes
      .guide
    expect(Object.keys(portugueseGuide.steps).length).toBeGreaterThanOrEqual(5)
    expect(Object.keys(englishGuide.steps)).toEqual(Object.keys(portugueseGuide.steps))
    expect(Object.keys(englishGuide.avoid)).toEqual(Object.keys(portugueseGuide.avoid))
  })
})
