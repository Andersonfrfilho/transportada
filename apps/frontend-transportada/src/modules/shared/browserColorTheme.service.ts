/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ColorTheme } from './colorTheme.constant'
import { readEffectiveColorTheme, type ColorThemeStorage } from './colorTheme.service'

const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)'

export function getColorThemeStorage(): ColorThemeStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

/**
 * A ponte entre o serviço puro e o navegador, num arquivo só. Ela mora aqui — e não no
 * `KeycloakAuthProvider`, que é quem a consome — porque o contrato de fronteira proíbe o nome
 * `localStorage` naquele arquivo: é ali que se garante que token nenhum é persistido (`security.md`
 * §8), e a guarda vale por banir o identificador, não por julgar o uso.
 */
export function readBrowserColorTheme(): ColorTheme {
  return readEffectiveColorTheme({
    storage: getColorThemeStorage(),
    prefersLight: typeof window !== 'undefined' && window.matchMedia(LIGHT_SCHEME_QUERY).matches,
  })
}
