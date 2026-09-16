/* Copyright (c) 2026 Ada Technology. MIT License. */

export const MEASUREMENT_GUIDE_STORAGE_KEY = 'transportada:package-box-measurement-guide-seen'

type GuideStorage = Readonly<{
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}>

/** Conveniência por aparelho: storage bloqueado (aba anônima) só faz o guia abrir de novo. */
export function hasSeenMeasurementGuide(storage: GuideStorage | undefined): boolean {
  try {
    return storage?.getItem(MEASUREMENT_GUIDE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function markMeasurementGuideSeen(storage: GuideStorage | undefined): void {
  try {
    storage?.setItem(MEASUREMENT_GUIDE_STORAGE_KEY, '1')
  } catch {
    // Sem storage o guia só volta a abrir sozinho na próxima medida.
  }
}

export function readMeasurementGuideStorage(): GuideStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}
