/* Copyright (c) 2026 Ada Technology. MIT License. */
import { COLOR_THEMES, COLOR_THEME_STORAGE_KEY, type ColorTheme } from './colorTheme.constant'

export type ColorThemeStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

type ThemedDocumentElement = {
  dataset: { theme?: string }
}

type ThemedDocument = {
  documentElement: ThemedDocumentElement
}

function isColorTheme(value: string): value is ColorTheme {
  return COLOR_THEMES.some((theme) => theme === value)
}

export function readStoredColorTheme(storage: ColorThemeStorage | null): ColorTheme | undefined {
  const stored = storage?.getItem(COLOR_THEME_STORAGE_KEY) ?? undefined
  return stored !== undefined && isColorTheme(stored) ? stored : undefined
}

/**
 * Sem escolha guardada o tema segue o sistema — por isso `undefined` aqui não vira `dark` nem
 * `light`: o atributo `data-theme` só é escrito quando alguém escolheu, e a CSS decide o resto
 * por `prefers-color-scheme`.
 */
export function resolveEffectiveColorTheme(input: {
  readonly stored: ColorTheme | undefined
  readonly prefersLight: boolean
}): ColorTheme {
  return input.stored ?? (input.prefersLight ? 'light' : 'dark')
}

export function applyColorTheme(input: {
  readonly document: ThemedDocument
  readonly theme: ColorTheme | undefined
}): void {
  if (input.theme === undefined) {
    delete input.document.documentElement.dataset.theme
    return
  }

  input.document.documentElement.dataset.theme = input.theme
}

export function persistColorTheme(input: {
  readonly storage: ColorThemeStorage | null
  readonly theme: ColorTheme
}): void {
  input.storage?.setItem(COLOR_THEME_STORAGE_KEY, input.theme)
}
