import { describe, expect, it } from 'bun:test'

import {
  detectIsIos,
  detectIsStandalone,
  resolveInstallGuidance,
} from '../../src/modules/shared/installPrompt.service'

describe('installPrompt (ADR-0075 §4/§8)', () => {
  it('já instalado não oferece nada, mesmo com beforeinstallprompt disponível', () => {
    expect(
      resolveInstallGuidance({ hasBeforeInstallPrompt: true, isIos: false, isStandalone: true }),
    ).toBe('unavailable')
  })

  it('Android com beforeinstallprompt oferece o prompt nativo', () => {
    expect(
      resolveInstallGuidance({ hasBeforeInstallPrompt: true, isIos: false, isStandalone: false }),
    ).toBe('android-prompt')
  })

  it('iOS sem beforeinstallprompt oferece a instrução', () => {
    expect(
      resolveInstallGuidance({ hasBeforeInstallPrompt: false, isIos: true, isStandalone: false }),
    ).toBe('ios-instructions')
  })

  it('nem Android nem iOS: nada para oferecer', () => {
    expect(
      resolveInstallGuidance({ hasBeforeInstallPrompt: false, isIos: false, isStandalone: false }),
    ).toBe('unavailable')
  })

  it('detecta iOS pelo user agent', () => {
    expect(detectIsIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true)
    expect(detectIsIos('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')).toBe(true)
    expect(detectIsIos('Mozilla/5.0 (Linux; Android 14)')).toBe(false)
  })

  it('standalone por media query ou por navigator.standalone (Safari)', () => {
    expect(
      detectIsStandalone({ matchesStandaloneMediaQuery: true, navigatorStandalone: undefined }),
    ).toBe(true)
    expect(
      detectIsStandalone({ matchesStandaloneMediaQuery: false, navigatorStandalone: true }),
    ).toBe(true)
    expect(
      detectIsStandalone({ matchesStandaloneMediaQuery: false, navigatorStandalone: false }),
    ).toBe(false)
    expect(
      detectIsStandalone({ matchesStandaloneMediaQuery: false, navigatorStandalone: undefined }),
    ).toBe(false)
  })
})
