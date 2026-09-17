/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T303/T402 item 6 — o contrato original ("sem settings.manage o bloco de recarga não
 * renderiza") assere sobre o texto-fonte de `FleetWorkspace.page.tsx`, o que prova só que a string
 * existe no arquivo, nunca o que a tela produz. Este contrato assere sobre o **renderizado**
 * (`renderToStaticMarkup`, i18n real), no molde de `test/trip/route-toll-adjustment.contract.tsx`.
 * `TollBoothCatalogReloadGate.component.tsx` foi extraído da página exatamente para isso: a mesma
 * função que a página usa para decidir, testável isolada, sem montar a página inteira (React Query,
 * `useAuthMeQuery`, etc.).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

// Efeito colateral: inicializa o i18next real com os dicionários de produção — o mesmo `t()` que a
// tela usa, nunca uma cópia de texto no teste.
import '@/modules/shared/i18n/i18n.service'
import { TollBoothCatalogReloadGate } from '@/modules/fleet/components/TollBoothCatalogReloadGate.component'
import fleetLocale from '@/modules/fleet/locales/fleet.locale.json'

const RELOAD_TITLE = fleetLocale.tollBoothCharges.reload.title

function renderGate(canManageSettings: boolean): string {
  return renderToStaticMarkup(
    <TollBoothCatalogReloadGate
      canManageSettings={canManageSettings}
      catalogStatus="empty"
      extracts={[]}
      isPending={false}
      loading={false}
      result={undefined}
      onReload={() => {}}
    />,
  )
}

describe('bloco de recarga do catálogo só renderiza com settings.manage (spec 154 T303/T402)', () => {
  it('sem settings.manage, nada é renderizado', () => {
    const html = renderGate(false)

    expect(html).toBe('')
    expect(html).not.toContain(RELOAD_TITLE)
  })

  it('com settings.manage, o painel de recarga aparece', () => {
    const html = renderGate(true)

    expect(html).toContain(RELOAD_TITLE)
  })
})
