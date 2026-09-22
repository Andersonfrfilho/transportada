/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T503 (revisão final, defeito 1): `TollBoothCatalogReloadPanel` e
 * `TollBoothCatalogReloadDialog` chamavam `t(errors.${errorCode}, { defaultValue: t(errors.default) })`
 * sem passar `{ code: errorCode }` — nem no `t` externo, nem no `t` interno do `defaultValue`. A
 * frase default (`"Não foi possível recarregar o catálogo. Código: {{code}}."`) interpola
 * `{{code}}`, então um código desconhecido (ex.: `STORAGE_UNAVAILABLE`, sem frase própria em
 * `fleet.locale.json` — storage fora do ar responde 503 com esse código) aparecia como
 * "Código: {{code}}." literal, em vez do código de verdade.
 *
 * A frase foi duplicada nos dois componentes; extraída para `TollBoothCatalogReloadError`, usada
 * pelos dois. `TollBoothCatalogReloadDialog` monta com `createPortal(..., document.body)`, e o
 * renderizador de servidor não suporta portal nenhum ("Portals are not currently supported by the
 * server renderer") — confirmado ao tentar; por isso o contrato renderiza o próprio
 * `TollBoothCatalogReloadError` (o que o painel e o diálogo efetivamente montam dentro do `<p
 * role="alert">`), no molde de `toll-booth-catalog-reload-gate.contract.tsx`
 * (`renderToStaticMarkup`, i18n real) — cobre os dois usos com uma render só, sem introduzir jsdom.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

// Efeito colateral: inicializa o i18next real com os dicionários de produção.
import '@/modules/shared/i18n/i18n.service'
import { TollBoothCatalogReloadError } from '@/modules/fleet/components/TollBoothCatalogReloadError.component'

const UNKNOWN_ERROR_CODE = 'STORAGE_UNAVAILABLE'
const KNOWN_ERROR_CODE = 'TOLL_BOOTH_EXTRACT_NOT_FOUND'

describe('código de erro na frase da recarga do catálogo (spec 154 T503, defeito 1)', () => {
  it('código desconhecido: o operador vê o código real, nunca o literal {{code}}', () => {
    const html = renderToStaticMarkup(
      <TollBoothCatalogReloadError errorCode={UNKNOWN_ERROR_CODE} />,
    )

    expect(html).toContain(UNKNOWN_ERROR_CODE)
    expect(html).not.toContain('{{code}}')
  })

  it('código conhecido: continua com a frase própria do catálogo de erros', () => {
    const html = renderToStaticMarkup(<TollBoothCatalogReloadError errorCode={KNOWN_ERROR_CODE} />)

    expect(html).toContain('Esse extrato não está mais registrado')
    expect(html).not.toContain(KNOWN_ERROR_CODE)
  })
})
