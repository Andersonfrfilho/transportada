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
      loadFailed={false}
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

// Spec 154 T506 (revisão de design): a lista de extratos que falhou ao carregar caía no mesmo ramo
// de "lista vazia" e dizia "nenhum extrato registrado" — afirmação falsa sobre a instalação.
describe('bloco de recarga — leitura dos extratos (spec 154 T506)', () => {
  const NO_EXTRACTS = fleetLocale.tollBoothCharges.reload.noExtracts
  const LOAD_ERROR = fleetLocale.tollBoothCharges.reload.loadError

  function renderPanel(input: Readonly<{ loadFailed: boolean; loading: boolean }>): string {
    return renderToStaticMarkup(
      <TollBoothCatalogReloadGate
        canManageSettings
        catalogStatus="empty"
        extracts={undefined}
        isPending={false}
        loadFailed={input.loadFailed}
        loading={input.loading}
        result={undefined}
        onReload={() => {}}
      />,
    )
  }

  it('falha ao ler os extratos diz que falhou, nunca que não há extrato', () => {
    const html = renderPanel({ loadFailed: true, loading: false })

    expect(html).toContain(LOAD_ERROR)
    expect(html).not.toContain(NO_EXTRACTS)
  })

  it('enquanto carrega, nem erro nem "nenhum extrato"', () => {
    const html = renderPanel({ loadFailed: false, loading: true })

    expect(html).not.toContain(LOAD_ERROR)
    expect(html).not.toContain(NO_EXTRACTS)
  })
})
