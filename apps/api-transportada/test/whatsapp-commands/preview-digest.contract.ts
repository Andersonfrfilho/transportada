/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 (D5) — o hash cobre o que o usuário viu. Mesmos ids com outro valor é outra prévia;
 * reordenar a entrada, ou mudar o vencimento do pedido (`expires_at`), não é.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildPreviewDigest,
  type PreviewDigestInput,
} from '../../src/whatsapp-commands/domain/issuance-preview-digest.policy.js'

const PROFILE_ID = '00000000-0000-4000-8000-000000001201'
const NFSE_PROFILE_ID = '00000000-0000-4000-8000-000000001202'
const FIRST = '00000000-0000-4000-8000-000000001203'
const SECOND = '00000000-0000-4000-8000-000000001204'

function buildInput(overrides: Partial<PreviewDigestInput> = {}): PreviewDigestInput {
  return {
    dueDate: '2026-09-26',
    entries: [
      {
        classification: { output: 'cte' },
        documentId: FIRST,
        freightAmount: '35.0000',
        nfseProfileId: null,
        profileId: PROFILE_ID,
        takerTaxId: '11111111000191',
      },
      {
        classification: { nfseProfileId: NFSE_PROFILE_ID, output: 'nfse' },
        documentId: SECOND,
        freightAmount: '12.5000',
        nfseProfileId: NFSE_PROFILE_ID,
        profileId: PROFILE_ID,
        takerTaxId: '22222222000191',
      },
    ],
    period: 'setembro/2026',
    profileVersions: [
      { kind: 'cte', profileId: PROFILE_ID, version: '3' },
      { kind: 'nfse', profileId: NFSE_PROFILE_ID, version: '1' },
    ],
    ...overrides,
  }
}

describe('buildPreviewDigest', () => {
  test('é SHA-256 em hexadecimal minúsculo — o formato que o CHECK do pedido aceita', () => {
    expect(buildPreviewDigest(buildInput())).toMatch(/^[0-9a-f]{64}$/)
  })

  test('é estável sob reordenação das notas e das versões de perfil', () => {
    const input = buildInput()
    const reordered = buildInput({
      entries: [...input.entries].reverse(),
      profileVersions: [...input.profileVersions].reverse(),
    })
    expect(buildPreviewDigest(reordered)).toBe(buildPreviewDigest(input))
  })

  test('muda quando o valor muda com os mesmos ids', () => {
    const input = buildInput()
    const [first, second] = input.entries
    if (first === undefined || second === undefined) throw new Error('fixture incompleta')
    const repriced = buildInput({ entries: [{ ...first, freightAmount: '36.0000' }, second] })
    expect(buildPreviewDigest(repriced)).not.toBe(buildPreviewDigest(input))
  })

  test('muda com a classificação, o motivo, o tomador, o período, o vencimento e a versão', () => {
    const input = buildInput()
    const [first, second] = input.entries
    if (first === undefined || second === undefined) throw new Error('fixture incompleta')
    const base = buildPreviewDigest(input)
    const variants: PreviewDigestInput[] = [
      buildInput({
        entries: [{ ...first, classification: { output: 'blocked', reason: 'A' } }, second],
      }),
      buildInput({
        entries: [{ ...first, classification: { output: 'blocked', reason: 'B' } }, second],
      }),
      buildInput({ entries: [{ ...first, takerTaxId: '33333333000191' }, second] }),
      buildInput({ period: 'outubro/2026' }),
      buildInput({ period: null }),
      buildInput({ dueDate: '2026-10-11' }),
      buildInput({
        profileVersions: [
          { kind: 'cte', profileId: PROFILE_ID, version: '4' },
          { kind: 'nfse', profileId: NFSE_PROFILE_ID, version: '1' },
        ],
      }),
    ]
    const digests = variants.map(buildPreviewDigest)
    for (const digest of digests) expect(digest).not.toBe(base)
    expect(new Set(digests).size).toBe(digests.length)
  })

  test('o tomador entra canônico: máscara e caixa não mudam o hash', () => {
    const input = buildInput()
    const [first, second] = input.entries
    if (first === undefined || second === undefined) throw new Error('fixture incompleta')
    const masked = buildInput({ entries: [{ ...first, takerTaxId: '11.111.111/0001-91' }, second] })
    expect(buildPreviewDigest(masked)).toBe(buildPreviewDigest(input))
  })

  test('não conhece `expires_at`, id de mensagem nem rótulo: o que fica fora do hash não entra', () => {
    const input = buildInput()
    const decorated = {
      ...input,
      expiresAt: new Date('2026-09-11T12:15:00.000Z'),
      label: '51 notas',
      messageId: 'wamid.1',
    } as PreviewDigestInput
    expect(buildPreviewDigest(decorated)).toBe(buildPreviewDigest(input))
  })
})
