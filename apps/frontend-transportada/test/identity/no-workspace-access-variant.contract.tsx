/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

import '@/modules/shared/i18n/i18n.service'
import { NoWorkspaceAccess } from '@/modules/identity/components/NoWorkspaceAccess.component'
import enLocale from '@/modules/identity/locales/identity.en.locale.json'
import ptLocale from '@/modules/identity/locales/identity.locale.json'
import { resolveNoWorkspaceAccessVariant } from '@/modules/identity/shared/noWorkspaceAccessVariant.service'
import { resolveLandingWorkspace } from '@/modules/shared/workspaceAccess.service'

const DRIVER_APP_URL = 'https://motorista.example.test'
const NOOP = (): void => undefined

function renderScreen(input: Parameters<typeof resolveNoWorkspaceAccessVariant>[0]): string {
  return renderToStaticMarkup(
    <NoWorkspaceAccess variant={resolveNoWorkspaceAccessVariant(input)} onSignOut={NOOP} />,
  )
}

describe('sem acesso com destino (spec 239 T4, D5)', () => {
  test('só trip.read vira a variante de acompanhamento, com e sem a URL do app do motorista', () => {
    expect(
      resolveNoWorkspaceAccessVariant({ driverAppUrl: DRIVER_APP_URL, permissions: ['trip.read'] }),
    ).toEqual({ driverAppUrl: DRIVER_APP_URL, kind: 'tracking' })
    expect(
      resolveNoWorkspaceAccessVariant({ driverAppUrl: undefined, permissions: ['trip.read'] }),
    ).toEqual({ kind: 'tracking' })
  })

  test('sem trip.read segue a variante de sempre, mesmo com a URL configurada', () => {
    expect(
      resolveNoWorkspaceAccessVariant({ driverAppUrl: DRIVER_APP_URL, permissions: [] }),
    ).toEqual({ kind: 'default' })
  })

  test('com trip.read e uma área visível a conta nem chega a esta tela', () => {
    const decision = resolveLandingWorkspace({
      current: 'nfe',
      hasLanded: false,
      permissions: ['trip.read', 'fleet.read'],
      roles: [],
      source: 'default',
    })

    expect(decision.kind).not.toBe('no-access')
  })

  test('o acompanhamento diz para onde ir e oferece o app do motorista na mesma aba', () => {
    const html = renderScreen({ driverAppUrl: DRIVER_APP_URL, permissions: ['trip.read'] })

    expect(html).toContain(ptLocale.noWorkspaceAccess.trackingTitle)
    expect(html).toContain(ptLocale.noWorkspaceAccess.trackingBody)
    expect(html).toContain(`href="${DRIVER_APP_URL}"`)
    expect(html).toContain(ptLocale.noWorkspaceAccess.openDriverApp)
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('target=')
    expect(html).toContain(ptLocale.noWorkspaceAccess.signOut)
    expect(html).not.toContain(ptLocale.noWorkspaceAccess.body)
  })

  test('sem a URL só o texto e o botão de sair', () => {
    const html = renderScreen({ driverAppUrl: undefined, permissions: ['trip.read'] })

    expect(html).toContain(ptLocale.noWorkspaceAccess.trackingTitle)
    expect(html).not.toContain('<a ')
    expect(html).toContain(ptLocale.noWorkspaceAccess.signOut)
  })

  test('sem trip.read o texto atual permanece', () => {
    const html = renderScreen({ driverAppUrl: DRIVER_APP_URL, permissions: [] })

    expect(html).toContain(ptLocale.noWorkspaceAccess.title)
    expect(html).toContain(ptLocale.noWorkspaceAccess.body)
    expect(html).not.toContain('<a ')
  })

  test('os textos novos existem nos dois idiomas', () => {
    for (const locale of [ptLocale, enLocale]) {
      for (const key of ['trackingTitle', 'trackingBody', 'openDriverApp'] as const) {
        expect(locale.noWorkspaceAccess[key]).toBeString()
      }
    }
    expect(ptLocale.noWorkspaceAccess.trackingTitle).toBe(
      'Sua conta acompanha viagens pelo app do motorista',
    )
  })

  test('o main escolhe a variante pelas permissões e pela URL do app do motorista', () => {
    const main = readFileSync(new URL('../../src/main.tsx', import.meta.url), 'utf8')

    expect(main).toMatch(
      /<NoWorkspaceAccess\s+variant=\{resolveNoWorkspaceAccessVariant\(\{\s*driverAppUrl: readDriverAppUrl\(\),\s*permissions: permissions \?\? \[\],/u,
    )
  })
})
