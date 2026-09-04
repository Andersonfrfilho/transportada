/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import type { ColorTheme } from './colorTheme.constant'
import {
  applyColorTheme,
  persistColorTheme,
  readEffectiveColorTheme as readEffectiveColorThemeOf,
  readStoredColorTheme,
  type ColorThemeStorage,
} from './colorTheme.service'

const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)'

function getColorThemeStorage(): ColorThemeStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function readEffectiveColorTheme(): ColorTheme {
  const prefersLight =
    typeof window !== 'undefined' && window.matchMedia(LIGHT_SCHEME_QUERY).matches
  return readEffectiveColorThemeOf({ storage: getColorThemeStorage(), prefersLight })
}

export type ColorThemeController = Readonly<{
  theme: ColorTheme
  toggleTheme: () => void
}>

/**
 * Sem escolha guardada, o hook segue o sistema operacional — por isso ele ouve a mudança de
 * `prefers-color-scheme` mesmo depois de montado, e não só na primeira leitura.
 */
export function useColorTheme(): ColorThemeController {
  const [theme, setTheme] = useState<ColorTheme>(readEffectiveColorTheme)

  useEffect(() => {
    if (readStoredColorTheme(getColorThemeStorage()) !== undefined) {
      return undefined
    }

    const media = window.matchMedia(LIGHT_SCHEME_QUERY)
    const handleChange = (): void => setTheme(readEffectiveColorTheme())

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  function toggleTheme(): void {
    const nextTheme: ColorTheme = theme === 'dark' ? 'light' : 'dark'

    applyColorTheme({ document, theme: nextTheme })
    persistColorTheme({ storage: getColorThemeStorage(), theme: nextTheme })
    setTheme(nextTheme)
  }

  return { theme, toggleTheme }
}
