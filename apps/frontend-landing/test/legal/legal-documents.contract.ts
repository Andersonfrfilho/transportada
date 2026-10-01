/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  LEGAL_DOCUMENT_PATHS,
  resolveLegalDocument,
  resolveLegalDocumentKey,
  type LegalDocumentKey,
} from '../../src/modules/legal/shared/legalDocuments.service.js'
import {
  DEFAULT_LANDING_SETTINGS,
  type LandingSettings,
} from '../../src/modules/shared/landingSettings.service.js'

const DOCUMENT_KEYS: readonly LegalDocumentKey[] = [
  'privacyPolicy',
  'termsOfService',
  'dataDeletion',
]

function settingsWith(overrides: Partial<LandingSettings>): LandingSettings {
  return { ...DEFAULT_LANDING_SETTINGS, ...overrides }
}

describe('legal document routes', () => {
  /**
   * Os três caminhos estão declarados no cadastro do aplicativo da Meta. Renomear um deles sem
   * atualizar o painel deixa a URL declarada apontando para a home, que responde 200 — a Meta não
   * reclama, e a quebra só aparece na próxima revisão do app.
   */
  test('the paths are the ones declared in the Meta app registration', () => {
    expect(LEGAL_DOCUMENT_PATHS).toEqual({
      dataDeletion: '/exclusao-de-dados',
      privacyPolicy: '/privacidade',
      termsOfService: '/termos',
    })
  })

  test('each path resolves to its document', () => {
    expect(resolveLegalDocumentKey('/privacidade')).toBe('privacyPolicy')
    expect(resolveLegalDocumentKey('/termos')).toBe('termsOfService')
    expect(resolveLegalDocumentKey('/exclusao-de-dados')).toBe('dataDeletion')
  })

  test('a trailing slash still resolves — a link shared with one is the same page', () => {
    expect(resolveLegalDocumentKey('/privacidade/')).toBe('privacyPolicy')
  })

  test('an unrelated path resolves to no document, so the home page keeps answering', () => {
    expect(resolveLegalDocumentKey('/')).toBeUndefined()
    expect(resolveLegalDocumentKey('/cadastro')).toBeUndefined()
    expect(resolveLegalDocumentKey('/privacidade-antiga')).toBeUndefined()
  })
})

describe('legal document content', () => {
  test('every document has a title, a summary and sections with text', () => {
    for (const documentKey of DOCUMENT_KEYS) {
      const document = resolveLegalDocument({ documentKey, settings: DEFAULT_LANDING_SETTINGS })

      expect(document.title.length).toBeGreaterThan(0)
      expect(document.summary.length).toBeGreaterThan(0)
      expect(document.sections.length).toBeGreaterThan(0)
      for (const section of document.sections) {
        expect(section.heading.length).toBeGreaterThan(0)
        expect(section.body.length + section.items.length).toBeGreaterThan(0)
      }
    }
  })

  /** Marcador que vaza vira "a {{brand}} é a controladora" na tela — num documento legal, público. */
  test('no placeholder survives into the rendered text', () => {
    for (const documentKey of DOCUMENT_KEYS) {
      const document = resolveLegalDocument({
        documentKey,
        settings: settingsWith({ brandName: 'Fernandes Transportadora' }),
      })
      const rendered = [
        document.summary,
        document.contactLine,
        ...document.sections.flatMap((section) => [...section.body, ...section.items]),
      ].join('\n')

      expect(rendered).not.toContain('{{')
    }
  })

  test('the configured brand name replaces the platform default', () => {
    const document = resolveLegalDocument({
      documentKey: 'privacyPolicy',
      settings: settingsWith({ brandName: 'Fernandes Transportadora' }),
    })

    expect(document.summary).toContain('Fernandes Transportadora')
  })

  test('without a configured brand the text still names someone', () => {
    const document = resolveLegalDocument({
      documentKey: 'privacyPolicy',
      settings: DEFAULT_LANDING_SETTINGS,
    })

    expect(document.summary).toContain('TransportAdA')
  })
})

describe('legal document data protection officer contact', () => {
  test('the site contact email becomes the officer channel', () => {
    const document = resolveLegalDocument({
      documentKey: 'dataDeletion',
      settings: settingsWith({ contactEmail: 'privacidade@exemplo.com.br' }),
    })

    expect(document.contactLine).toContain('privacidade@exemplo.com.br')
  })

  test('the registered contact list answers when the site has no contact email', () => {
    const document = resolveLegalDocument({
      documentKey: 'dataDeletion',
      settings: settingsWith({
        contacts: [
          { isWhatsapp: true, kind: 'phone', label: '', value: '11999990000' },
          { isWhatsapp: false, kind: 'email', label: 'Encarregado', value: 'dpo@exemplo.com.br' },
        ],
      }),
    })

    expect(document.contactLine).toContain('dpo@exemplo.com.br')
  })

  /** Sem e-mail nenhum a frase muda; um documento legal não publica destinatário em branco. */
  test('with no email at all the sentence points to the published contact channels', () => {
    const document = resolveLegalDocument({
      documentKey: 'dataDeletion',
      settings: DEFAULT_LANDING_SETTINGS,
    })

    expect(document.contactLine).toContain('página inicial')
    expect(document.contactLine).not.toContain('undefined')
  })
})

describe('legal document configuration override', () => {
  test('configured title, summary and date win over the locale default', () => {
    const document = resolveLegalDocument({
      documentKey: 'termsOfService',
      settings: settingsWith({
        sections: {
          termsOfService: {
            summary: 'Resumo revisado pelo jurídico.',
            title: 'Termos de Uso',
            updatedAt: '15 de novembro de 2026',
          },
        },
      }),
    })

    expect(document.title).toBe('Termos de Uso')
    expect(document.summary).toBe('Resumo revisado pelo jurídico.')
    expect(document.updatedAt).toBe('15 de novembro de 2026')
  })

  test('an override of the wrong type falls back instead of leaking to the page', () => {
    const document = resolveLegalDocument({
      documentKey: 'termsOfService',
      settings: settingsWith({ sections: { termsOfService: { title: 42, summary: '   ' } } }),
    })

    expect(document.title).toBe('Termos de Serviço')
    expect(document.summary).toContain('condições de uso')
  })
})
