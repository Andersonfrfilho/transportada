/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * ADR-0075 §4/§8: instalar é instalar a viagem. No Android, o `beforeinstallprompt` do navegador
 * oferece o botão; no iOS não existe esse evento, e a única saída é "Compartilhar → Adicionar à
 * Tela de Início" — o texto que a tela mostra quando `isIos` é verdadeiro. Já instalado
 * (`display-mode: standalone`), não há nada para oferecer.
 */
export type InstallGuidance = 'android-prompt' | 'ios-instructions' | 'unavailable'

export function resolveInstallGuidance(input: {
  readonly hasBeforeInstallPrompt: boolean
  readonly isIos: boolean
  readonly isStandalone: boolean
}): InstallGuidance {
  if (input.isStandalone) return 'unavailable'
  if (input.hasBeforeInstallPrompt) return 'android-prompt'
  if (input.isIos) return 'ios-instructions'
  return 'unavailable'
}

/** `navigator.standalone` é só do Safari/iOS; os demais navegadores usam a media query. */
export function detectIsIos(userAgent: string): boolean {
  return /iphone|ipad|ipod/iu.test(userAgent)
}

export function detectIsStandalone(input: {
  readonly matchesStandaloneMediaQuery: boolean
  readonly navigatorStandalone: boolean | undefined
}): boolean {
  return input.matchesStandaloneMediaQuery || input.navigatorStandalone === true
}
