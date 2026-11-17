/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A foto do balão da conversa (SDK conversations-ui 0.14.0) saía pela borda direita: o anexo é um `<figure>` com margem
 * lateral do navegador e sem `min-width: 0`. O painel e o app do motorista carregam o mesmo SDK e prendem o anexo ao balão no próprio CSS.
 * O contrato lê os dois, para um não corrigir sem o outro.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const STYLESHEETS = {
  driver: new URL('../../../frontend-driver/src/styles/index.css', import.meta.url),
  panel: new URL('../../src/styles/index.css', import.meta.url),
} as const

describe('foto no balão da conversa fica dentro do balão', () => {
  for (const [app, url] of Object.entries(STYLESHEETS)) {
    test(`${app}: o anexo do balão não passa da largura do balão`, () => {
      const css = readFileSync(url, 'utf8')
      expect(css).toMatch(
        /\.cv-p-bubble > \.cv-p-attachment \{[^}]*min-width: 0;[^}]*max-width: 100%;[^}]*margin-inline: 0;[^}]*\}/u,
      )
      expect(css).toMatch(
        /\.cv-p-attachment__image \{[^}]*max-width: 100%;[^}]*height: auto;[^}]*\}/u,
      )
    })
  }
})
