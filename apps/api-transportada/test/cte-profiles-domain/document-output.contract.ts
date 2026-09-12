/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { CTE_BATCH_BLOCK_REASON } from '../../src/cte-batches/domain/cte-batch-eligibility.policy.js'
import { CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE } from '../../src/cte-profiles/domain/cte-profile.error.js'
import { classifyDocumentOutput } from '../../src/cte-profiles/domain/document-output.policy.js'

const NFSE_PROFILE_ID = '00000000-0000-4000-8000-000000000a01'

const CTE_PROFILE = {
  nfseEmissionProfileId: null,
  nfseProfileStatus: null,
  outputDocument: 'cte',
} as const

const NFSE_PROFILE = {
  nfseEmissionProfileId: NFSE_PROFILE_ID,
  nfseProfileStatus: 'active',
  outputDocument: 'nfse',
} as const

const NO_VERDICT = { cteBlockReason: null, nfseBlockReason: null } as const

/**
 * A classificação **não refaz** elegibilidade: ela lê os dois vereditos que a listagem já calcula e
 * escolhe qual deles vale pelo documento que o perfil manda emitir. Cada linha desta tabela é uma
 * combinação de perfil × veredito, e a saída esperada ao lado.
 */
describe('classifyDocumentOutput (spec 144 D3)', () => {
  test('perfil cte sem bloqueio vai para CT-e', () => {
    expect(classifyDocumentOutput({ ...NO_VERDICT, profile: CTE_PROFILE })).toEqual({
      output: 'cte',
    })
  })

  test('perfil cte com bloqueio de CT-e sai bloqueada pelo motivo do CT-e', () => {
    expect(
      classifyDocumentOutput({
        cteBlockReason: CTE_BATCH_BLOCK_REASON.missingWeight,
        nfseBlockReason: null,
        profile: CTE_PROFILE,
      }),
    ).toEqual({ output: 'blocked', reason: CTE_BATCH_BLOCK_REASON.missingWeight })
  })

  /** O portão municipal vence no ramo `cte`: a nota não é desviada para NFS-e (D3 ⚠️). */
  test('perfil cte com portão municipal sai bloqueada, não desviada', () => {
    expect(
      classifyDocumentOutput({
        cteBlockReason: CTE_BATCH_BLOCK_REASON.municipalService,
        nfseBlockReason: null,
        profile: CTE_PROFILE,
      }),
    ).toEqual({ output: 'blocked', reason: CTE_BATCH_BLOCK_REASON.municipalService })
  })

  /** O bloqueio só da NFS-e não pesa numa nota que vai para CT-e. */
  test('perfil cte ignora o veredito da NFS-e', () => {
    expect(
      classifyDocumentOutput({
        cteBlockReason: null,
        nfseBlockReason: CTE_BATCH_BLOCK_REASON.linkedToNfse,
        profile: CTE_PROFILE,
      }),
    ).toEqual({ output: 'cte' })
  })

  test('perfil nfse sem bloqueio vai para NFS-e com o perfil apontado', () => {
    expect(classifyDocumentOutput({ ...NO_VERDICT, profile: NFSE_PROFILE })).toEqual({
      nfseProfileId: NFSE_PROFILE_ID,
      output: 'nfse',
    })
  })

  /**
   * A nota sem peso é elegível para NFS-e (spec 067): o veredito do CT-e — que agora também carrega
   * `OUTPUT_NFSE` para esta nota — não pode contaminar o ramo da NFS-e.
   */
  test('perfil nfse ignora o veredito do CT-e', () => {
    for (const cteBlockReason of [
      CTE_BATCH_BLOCK_REASON.missingWeight,
      CTE_BATCH_BLOCK_REASON.outputNfse,
    ]) {
      expect(
        classifyDocumentOutput({ cteBlockReason, nfseBlockReason: null, profile: NFSE_PROFILE }),
      ).toEqual({ nfseProfileId: NFSE_PROFILE_ID, output: 'nfse' })
    }
  })

  test('perfil nfse com bloqueio de NFS-e sai bloqueada pelo motivo da NFS-e', () => {
    expect(
      classifyDocumentOutput({
        cteBlockReason: CTE_BATCH_BLOCK_REASON.outputNfse,
        nfseBlockReason: CTE_BATCH_BLOCK_REASON.linkedToNfse,
        profile: NFSE_PROFILE,
      }),
    ).toEqual({ output: 'blocked', reason: CTE_BATCH_BLOCK_REASON.linkedToNfse })
  })

  /**
   * A FK impede apontar para perfil de outra empresa, não para um `draft`/`inactive`, e ativar o
   * perfil de CT-e não confere o NFS-e depois disso. O status é lido na mesma consulta da página.
   */
  test('perfil nfse apontando para perfil NFS-e não ativo sai bloqueada', () => {
    for (const nfseProfileStatus of ['draft', 'inactive'] as const) {
      expect(
        classifyDocumentOutput({ ...NO_VERDICT, profile: { ...NFSE_PROFILE, nfseProfileStatus } }),
      ).toEqual({ output: 'blocked', reason: CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE })
    }
  })

  /** O perfil inativo é causa anterior: consertá-lo vem antes de desfazer vínculo. */
  test('perfil NFS-e não ativo vence o bloqueio da própria NFS-e', () => {
    expect(
      classifyDocumentOutput({
        cteBlockReason: null,
        nfseBlockReason: CTE_BATCH_BLOCK_REASON.notAuthorized,
        profile: { ...NFSE_PROFILE, nfseProfileStatus: 'inactive' },
      }),
    ).toEqual({ output: 'blocked', reason: CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE })
  })

  /** Nota sem perfil não cai em CT-e por padrão: escolher o documento por omissão é inventar regra. */
  test('sem perfil sai no_profile com o motivo, ignorando os dois vereditos', () => {
    for (const noProfileReason of ['ambiguous', 'not_cnpj', 'unmatched'] as const) {
      expect(
        classifyDocumentOutput({
          cteBlockReason: CTE_BATCH_BLOCK_REASON.missingWeight,
          nfseBlockReason: CTE_BATCH_BLOCK_REASON.notAuthorized,
          noProfileReason,
          profile: null,
        }),
      ).toEqual({ output: 'no_profile', reason: noProfileReason })
    }
  })
})
