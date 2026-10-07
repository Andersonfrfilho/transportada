/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6, CA2 e casos hostis: cada barreira recusa com um código estável, registra a recusa sem
 * endereço/corpo e — o que mais importa — NÃO deixa passar o trabalho caro (download, bucket, prévia)
 * além da barreira que a recusou.
 */
import { describe, expect, test } from 'bun:test'

import type { CargoPreviewEmailRejectionCode } from '../../src/shared/cargo-preview.constant.js'
import { CargoPreviewEmailDkimUnverifiableError } from '../../src/cargo-preview-email/domain/cargo-preview-email.error.js'
import { ResendDownloadTooLargeError } from '../../src/contractor-mail/domain/resend-provider.error.js'
import { CARGO_PREVIEW_OBJECT_MAX_BYTES } from '../../src/cargo-preview/domain/cargo-preview-object.policy.js'
import {
  buildMime,
  buildOriginalMime,
  gmailForwardText,
  WORKBOOK_BYTES,
  type MimeAttachment,
} from './mime.fixture.js'
import {
  CONTRACTOR_ID,
  FORWARDER,
  ORIGINAL,
  READY_PROFILE,
  runIntake,
  validRawEmail,
  type HarnessOptions,
} from './intake.harness.js'

async function expectRejected(options: HarnessOptions, reason: CargoPreviewEmailRejectionCode) {
  const run = runIntake(options)
  expect(await run.result).toEqual({ contractorId: CONTRACTOR_ID, kind: 'rejected', reason })
  expect(run.calls.created).toEqual([])
  expect(run.calls.stored).toEqual([])
  expect(run.calls.rejections).toHaveLength(1)
  expect(run.calls.rejections[0]?.reason).toBe(reason)
  expect(JSON.stringify(run.calls.rejections)).not.toContain('@')
  return run
}

const inline = (
  from: string,
  attachments: readonly MimeAttachment[] = [{ fileName: 'FR-06-10.xlsm' }],
) => buildMime({ attachments, from: FORWARDER, text: gmailForwardText({ from }) })

describe('o que a prévia por e-mail não é (spec 237 T4.6)', () => {
  test('sem candidato a token, ou token sem perfil, não é prévia e nada acontece', async () => {
    for (const options of [
      { received: { to: ['alguem@entrada.example'] } },
      { profiles: [] },
      { profiles: [READY_PROFILE, { ...READY_PROFILE, contractorId: 'outro' }] },
    ] satisfies HarnessOptions[]) {
      const run = runIntake(options)
      expect(await run.result).toEqual({ kind: 'not_a_preview' })
      expect(run.calls.downloads).toEqual([])
      expect(run.calls.rejections).toEqual([])
      expect(run.calls.stored).toEqual([])
    }
  })
})

describe('as recusas antes de baixar o e-mail (spec 237 T4.6, CA2)', () => {
  test.each([
    [
      'perfil ainda não pronto para prévia',
      { profiles: [{ ...READY_PROFILE, isPreviewReady: false }] },
      'PREVIEW_NOT_ENABLED',
    ],
    [
      'encaminhador fora da lista',
      { received: { from: 'Outro <outro@transportadora.example>' } },
      'FORWARDER_NOT_ALLOWED',
    ],
    [
      'lista de encaminhador ausente',
      { profiles: [{ ...READY_PROFILE, forwarderAllowlist: null }] },
      'FORWARDER_NOT_ALLOWED',
    ],
    [
      'encaminhador por domínio da lista',
      { profiles: [{ ...READY_PROFILE, forwarderAllowlist: ['transportadora.example'] }] },
      'FORWARDER_NOT_ALLOWED',
    ],
  ] as const)('%s', async (_name, options, reason) => {
    const run = await expectRejected(options as HarnessOptions, reason)
    expect(run.calls.downloads).toEqual([])
    expect(run.calls.rejections[0]?.dkimResult).toBeUndefined()
  })
})

describe('as recusas depois de baixar o e-mail (spec 237 T4.6, CA2)', () => {
  test('e-mail maior que o teto do ramo', async () => {
    const run = await expectRejected(
      {
        download: async () => {
          throw new ResendDownloadTooLargeError()
        },
      },
      'RAW_EMAIL_TOO_LARGE',
    )
    expect(run.calls.downloads).toHaveLength(1)
  })

  test.each(['not_aligned', 'absent'] as const)(
    'DKIM do encaminhador %s: recusa com o resultado registrado',
    async (dkim) => {
      const run = await expectRejected({ dkim }, 'FORWARDER_DKIM_NOT_ALIGNED')
      expect(run.calls.rejections[0]).toMatchObject({
        dkimResult: dkim,
        isOriginalSenderRead: false,
      })
    },
  )

  test('DKIM sem veredito (DNS fora) não grava nada e devolve o erro que a fila repete', async () => {
    const run = runIntake({ dkim: 'unverifiable' })
    await expect(run.result).rejects.toBeInstanceOf(CargoPreviewEmailDkimUnverifiableError)
    expect(run.calls.rejections).toEqual([])
    expect(run.calls.stored).toEqual([])
    expect(run.calls.created).toEqual([])
  })

  test('na última entrega, DKIM sem veredito vira recusa própria, não NOT_ALIGNED', async () => {
    const run = await expectRejected(
      { dkim: 'unverifiable', isLastAttempt: true },
      'FORWARDER_DKIM_UNVERIFIABLE',
    )
    expect(run.calls.rejections[0]).toMatchObject({
      dkimResult: 'unverifiable',
      isOriginalSenderRead: false,
    })
  })

  test('o From do MIME (o que o DKIM cobre) fora da lista recusa, mesmo que o do provedor esteja', async () => {
    const forged = buildMime({
      attachments: [{ fileName: 'a.xlsm' }],
      from: 'mallory@evil.example',
      text: gmailForwardText({ from: ORIGINAL }),
    })
    await expectRejected(
      { headerFrom: ['mallory@evil.example'], rawEmail: forged },
      'FORWARDER_NOT_ALLOWED',
    )
  })

  test('MIME ilegível', async () => {
    await expectRejected({ rawEmail: 'lixo sem cabeçalho nenhum' }, 'MIME_UNREADABLE')
  })
})

describe('o remetente original (spec 237 T4.6, D6)', () => {
  test.each([
    [
      'fora da lista',
      inline('Mallory <mallory@evil.example>'),
      'ORIGINAL_SENDER_NOT_ALLOWED',
      true,
    ],
    [
      'nome de exibição imitando o permitido',
      inline(`"${ORIGINAL}" <mallory@evil.example>`),
      'ORIGINAL_SENDER_NOT_ALLOWED',
      true,
    ],
    [
      'subdomínio do permitido',
      inline('x@sub.contratante.example'),
      'ORIGINAL_SENDER_NOT_ALLOWED',
      true,
    ],
    [
      'ausente',
      buildMime({ attachments: [{ fileName: 'a.xlsm' }], from: FORWARDER, text: 'sem bloco' }),
      'ORIGINAL_SENDER_MISSING',
      false,
    ],
    [
      'dois endereços',
      inline(`${ORIGINAL}, outro@contratante.example`),
      'ORIGINAL_SENDER_AMBIGUOUS',
      false,
    ],
    [
      'cabeçalho duplicado na mensagem anexada',
      buildMime({
        forwardedMessages: [
          buildOriginalMime({ extraHeaders: ['From: mallory@evil.example'], from: ORIGINAL }),
        ],
        from: FORWARDER,
      }),
      'ORIGINAL_SENDER_AMBIGUOUS',
      false,
    ],
  ] as const)('%s', async (_name, rawEmail, reason, isRead) => {
    const run = await expectRejected({ rawEmail }, reason)
    expect(run.calls.rejections[0]).toMatchObject({
      dkimResult: 'aligned',
      isOriginalSenderRead: isRead,
    })
  })

  test('a lista do remetente original ausente recusa', async () => {
    await expectRejected(
      { profiles: [{ ...READY_PROFILE, senderAllowlist: null }] },
      'ORIGINAL_SENDER_NOT_ALLOWED',
    )
  })
})

describe('o anexo (spec 237 T4.6, RF4)', () => {
  const big = new Uint8Array(CARGO_PREVIEW_OBJECT_MAX_BYTES + 1).fill(1)
  big.set([0x50, 0x4b, 0x03, 0x04])
  test.each([
    ['sem anexo', inline(ORIGINAL, []), 'ATTACHMENT_MISSING'],
    [
      'dois anexos',
      inline(ORIGINAL, [{ fileName: 'a.xlsm' }, { fileName: 'b.xlsm' }]),
      'ATTACHMENT_AMBIGUOUS',
    ],
    [
      'extensão de planilha, bytes de PDF',
      inline(ORIGINAL, [
        { bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 1]), fileName: 'a.xlsx' },
      ]),
      'ATTACHMENT_NOT_A_WORKBOOK',
    ],
    [
      'acima do teto do upload',
      inline(ORIGINAL, [{ bytes: big, fileName: 'a.xlsm' }]),
      'ATTACHMENT_TOO_LARGE',
    ],
  ] as const)('%s', async (_name, rawEmail, reason) => {
    const run = await expectRejected({ rawEmail }, reason)
    expect(run.calls.rejections[0]).toMatchObject({
      dkimResult: 'aligned',
      isOriginalSenderRead: true,
    })
  })

  test('a mensagem anexada com a planilha dentro é aceita', async () => {
    const forwarded = buildMime({
      forwardedMessages: [buildOriginalMime({ from: ORIGINAL })],
      from: FORWARDER,
    })
    const run = runIntake({ rawEmail: forwarded })
    expect(await run.result).toMatchObject({ kind: 'accepted' })
    expect(run.calls.created[0]?.file.sizeBytes).toBe(WORKBOOK_BYTES.byteLength)
  })

  test('o limite de prévias abertas recusa, registra e não deixa objeto no bucket', async () => {
    const run = runIntake({ createOutcome: { kind: 'too_many_open' } })
    expect(await run.result).toEqual({
      contractorId: CONTRACTOR_ID,
      kind: 'rejected',
      reason: 'TOO_MANY_OPEN_PREVIEWS',
    })
    expect(run.calls.deleted).toHaveLength(2)
  })

  test('o e-mail válido do harness continua sendo aceito', async () => {
    expect(await runIntake({ rawEmail: validRawEmail() }).result).toMatchObject({
      kind: 'accepted',
    })
  })
})
