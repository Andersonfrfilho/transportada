/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A viagem e a tela de notas respondem à **mesma** pergunta — para que documento esta nota vai — e
 * havia duas contas para ela: a do município e a do perfil de emissão. Duas contas discordam, e a
 * discordância aparece como um botão que emite o documento errado.
 */
import { describe, expect, it } from 'bun:test'

import {
  readDocumentClassification,
  readDocumentReason,
} from '../../src/trips/infrastructure/trip-fiscal-readiness.query.js'

const NFSE_PROFILE_ID = '00000000-0000-4000-8000-0000000000aa'

const IDLE_ROW = { attemptStatus: null, cteStatus: null }

describe('o documento que a viagem espera sai do perfil de emissão', () => {
  it('leva o veredito do perfil, não uma tradução dele', () => {
    expect(readDocumentClassification({ output: 'cte' })).toEqual({
      expectedDocument: 'cte',
      nfseProfileId: null,
    })
    expect(readDocumentClassification({ output: 'blocked', reason: 'qualquer' })).toEqual({
      expectedDocument: 'blocked',
      nfseProfileId: null,
    })
    expect(readDocumentClassification({ output: 'no_profile', reason: 'unmatched' })).toEqual({
      expectedDocument: 'no_profile',
      nfseProfileId: null,
    })
  })

  it('o perfil de NFS-e viaja junto do documento esperado', () => {
    expect(readDocumentClassification({ nfseProfileId: NFSE_PROFILE_ID, output: 'nfse' })).toEqual({
      expectedDocument: 'nfse',
      nfseProfileId: NFSE_PROFILE_ID,
    })
  })

  /** Nota que a classificação não alcançou não vira CT-e por omissão: escolher por omissão é inventar. */
  it('nota fora da classificação fica sem perfil, nunca em CT-e', () => {
    expect(readDocumentClassification(undefined)).toEqual({
      expectedDocument: 'no_profile',
      nfseProfileId: null,
    })
  })
})

describe('o motivo da linha carrega os quatro estados', () => {
  it('bloqueio e ausência de perfil chegam inteiros, sem virar outro motivo', () => {
    expect(readDocumentReason({ expectedDocument: 'blocked', row: IDLE_ROW })).toBe('blocked')
    expect(readDocumentReason({ expectedDocument: 'no_profile', row: IDLE_ROW })).toBe('no_profile')
  })

  /**
   * A classificação manda sobre o estado do CT-e: nota que vai para NFS-e com um CT-e autorizado por
   * acaso é divergência, e dizer "ok" ali esconderia a divergência.
   */
  it('a classificação vence o CT-e que por acaso exista', () => {
    expect(
      readDocumentReason({
        expectedDocument: 'nfse',
        row: { attemptStatus: null, cteStatus: 'authorized' },
      }),
    ).toBe('nfse_expected')
    expect(
      readDocumentReason({
        expectedDocument: 'blocked',
        row: { attemptStatus: null, cteStatus: 'authorized' },
      }),
    ).toBe('blocked')
  })

  it('o caminho do CT-e segue como estava', () => {
    expect(
      readDocumentReason({
        expectedDocument: 'cte',
        row: { attemptStatus: null, cteStatus: 'authorized' },
      }),
    ).toBe('ok')
    expect(
      readDocumentReason({
        expectedDocument: 'cte',
        row: { attemptStatus: 'rejected', cteStatus: null },
      }),
    ).toBe('cte_rejected')
    expect(readDocumentReason({ expectedDocument: 'cte', row: IDLE_ROW })).toBe('no_cte')
  })
})

/**
 * Invariante estática por leitura do fonte, e não por `goto-definition`: o que se proíbe é uma
 * **tela ou rota** voltar a decidir o documento de saída pelo município, e isso é uma propriedade
 * dos arquivos que compõem esses caminhos — não do grafo de chamadas, onde a mesma função continua
 * legítima dentro do domínio que alimenta a fonte única.
 */
describe('nenhuma tela ou rota decide o documento pelo município', () => {
  const SOURCES = [
    '../../src/trips/infrastructure/trip-fiscal-readiness.query.ts',
    '../../src/trips/application/read-trip-fiscal-readiness.use-case.ts',
    '../../src/trips/presentation/trip.routes.ts',
  ] as const

  it('a prontidão fiscal não chama a conta de município', async () => {
    for (const source of SOURCES) {
      const file = Bun.file(new URL(source, import.meta.url))
      /** Caminho que não existe é guarda que não guarda: o arquivo mudou de lugar e ninguém soube. */
      expect(await file.exists()).toBe(true)
      expect(await file.text()).not.toContain('resolveFiscalDocumentKind')
    }
  })
})
