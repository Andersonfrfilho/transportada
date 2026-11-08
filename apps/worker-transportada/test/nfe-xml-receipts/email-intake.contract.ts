/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  intakeNfeXmlEmail,
  NFE_XML_MAILBOX_ACTOR_USER_ID,
  NfeXmlEmailDkimUnverifiableError,
  type NfeXmlEmailIntakeDependencies,
  type NfeXmlEmailIntakeInput,
} from '../../src/nfe-xml-receipts/application/intake-nfe-xml-email.use-case.js'
import type { ReceiptFile } from '../../src/nfe-xml-receipts/application/nfe-xml-receipt.types.js'
import {
  COMPANY_ID,
  createLogCollector,
  FakeImportGateway,
  FakeReceiptRepository,
  NOW,
} from './receipt.fixture.js'

const RAW = new TextEncoder().encode('From: a@b\r\nSubject: x\r\n\r\nbody')

function setup(
  options: {
    alignment?: 'absent' | 'aligned' | 'not_aligned' | 'unverifiable'
    attachments?: readonly ReceiptFile[]
    headerFrom?: readonly string[]
    raw?: Uint8Array | undefined
    sender?: string | undefined
    authorized?: boolean
  } = {},
) {
  const repository = new FakeReceiptRepository()
  if (options.authorized !== false) repository.authorizedEmails.add('maria@transportadora.com.br')
  const importGateway = new FakeImportGateway()
  const { entries, logger } = createLogCollector()
  const dependencies: NfeXmlEmailIntakeDependencies = {
    dkim: {
      verify: () =>
        Promise.resolve({
          alignment: options.alignment ?? 'aligned',
          headerFrom: options.headerFrom ?? ['maria@transportadora.com.br'],
        }),
    },
    downloadRaw: () => Promise.resolve('raw' in options ? options.raw : RAW),
    extractAttachments: () =>
      Promise.resolve(options.attachments ?? [{ bytes: new Uint8Array([1]), name: 'nota.xml' }]),
    importGateway,
    logger,
    parseSenderAddress: () =>
      'sender' in options ? options.sender : 'maria@transportadora.com.br',
    repository,
  }
  const input: NfeXmlEmailIntakeInput = {
    companyId: COMPANY_ID,
    correlationId: 'corr-1',
    delivery: { isLastAttempt: false },
    from: 'Maria <maria@transportadora.com.br>',
    now: NOW,
    providerEmailId: 'email-1',
    replyDomain: 'entrada.transportadora.com.br',
    to: ['Notas <notas@entrada.transportadora.com.br>'],
  }
  return { dependencies, entries, importGateway, input, repository }
}

describe('NF-e XML e-mail intake', () => {
  test('ignores e-mail that is not for the notes mailbox', async () => {
    const { dependencies, input, repository } = setup()
    const result = await intakeNfeXmlEmail(
      { ...input, to: ['alguem@entrada.transportadora.com.br', 'notas@outro.com.br'] },
      dependencies,
    )
    expect(result).toEqual({ kind: 'not_xml_mailbox' })
    expect(repository.recorded).toHaveLength(0)
  })

  test('also accepts notas@ at an extra configured domain (the company short alias forwarded to the mailbox)', async () => {
    const { dependencies, input } = setup()
    const alias = { ...input, to: ['notas@Fernandes-Transportadora.com.br'] }
    expect(await intakeNfeXmlEmail(alias, dependencies)).toEqual({ kind: 'not_xml_mailbox' })
    expect(
      await intakeNfeXmlEmail(
        { ...alias, extraDomains: ['fernandes-transportadora.com.br'] },
        dependencies,
      ),
    ).toMatchObject({ kind: 'imported' })
    // outro endereço do mesmo domínio extra continua fora
    expect(
      await intakeNfeXmlEmail(
        {
          ...input,
          extraDomains: ['fernandes-transportadora.com.br'],
          to: ['contato@fernandes-transportadora.com.br'],
        },
        dependencies,
      ),
    ).toEqual({ kind: 'not_xml_mailbox' })
  })

  test('imports zip and loose xml together, ignoring other attachments, as the mailbox actor', async () => {
    const { dependencies, importGateway, input, repository } = setup({
      attachments: [
        { bytes: new Uint8Array([1]), name: 'lote.zip' },
        { bytes: new Uint8Array([2]), name: 'nota.xml' },
        { bytes: new Uint8Array([3]), name: 'danfe.pdf' },
      ],
    })
    const result = await intakeNfeXmlEmail(input, dependencies)
    expect(result).toEqual({ files: 2, importId: 'import-1', kind: 'imported' })
    expect(importGateway.created).toHaveLength(1)
    const [created] = importGateway.created
    expect(created?.files.map((file) => file.name)).toEqual(['lote.zip', 'nota.xml'])
    expect(created).toMatchObject({
      automationJob: 'nfe.xml.mailbox',
      receivedFrom: 'maria@transportadora.com.br',
      receivedVia: 'email',
      requestedByUserId: NFE_XML_MAILBOX_ACTOR_USER_ID,
    })
    expect(repository.recorded[0]).toMatchObject({ channel: 'email', providerMessageId: 'email-1' })
  })

  test('never refuses by volume: 300 attachments become one import', async () => {
    const attachments = Array.from({ length: 300 }, (_, index) => ({
      bytes: new Uint8Array([index % 255]),
      name: `n${index}.xml`,
    }))
    const { dependencies, importGateway, input } = setup({ attachments })
    const result = await intakeNfeXmlEmail(input, dependencies)
    expect(result).toMatchObject({ files: 300, kind: 'imported' })
    expect(importGateway.created[0]?.files).toHaveLength(300)
  })

  test('a repeated delivery is already recorded and imports nothing twice', async () => {
    const { dependencies, importGateway, input } = setup()
    await intakeNfeXmlEmail(input, dependencies)
    const second = await intakeNfeXmlEmail(input, dependencies)
    expect(second).toEqual({ kind: 'already_recorded' })
    expect(importGateway.created).toHaveLength(1)
  })

  test.each([
    ['DKIM not aligned', { alignment: 'not_aligned' as const }, 'sender_not_authenticated'],
    [
      'signed From differs from the sender',
      { headerFrom: ['outra@pessoa.com'] },
      'sender_not_authenticated',
    ],
    ['sender is not an authorized user', { authorized: false }, 'sender_not_allowed'],
    [
      'no xml or zip attached',
      { attachments: [{ bytes: new Uint8Array([1]), name: 'a.pdf' }] },
      'no_accepted_file',
    ],
    ['raw e-mail too large to download', { raw: undefined }, 'file_too_large'],
  ] as const)('rejects with a reason when %s', async (_name, options, reason) => {
    const { dependencies, entries, importGateway, input, repository } = setup(options)
    const result = await intakeNfeXmlEmail(input, dependencies)
    expect(result).toEqual({ kind: 'rejected', reason })
    expect(repository.rejected.map((entry) => entry.reason)).toEqual([reason])
    expect(importGateway.created).toHaveLength(0)
    const serialized = JSON.stringify(entries)
    expect(serialized).not.toContain('maria@transportadora')
    expect(serialized).toContain(reason)
  })

  test('rejects without a readable sender, recording nothing', async () => {
    const { dependencies, input, repository } = setup({ sender: undefined })
    const result = await intakeNfeXmlEmail(input, dependencies)
    expect(result).toMatchObject({ kind: 'rejected' })
    expect(repository.recorded).toHaveLength(0)
  })

  test('unverifiable DKIM retries until the last attempt, then rejects', async () => {
    const first = setup({ alignment: 'unverifiable' })
    await expect(intakeNfeXmlEmail(first.input, first.dependencies)).rejects.toBeInstanceOf(
      NfeXmlEmailDkimUnverifiableError,
    )
    expect(first.repository.discarded).toHaveLength(1)
    expect(first.repository.recorded).toHaveLength(0)

    const last = setup({ alignment: 'unverifiable' })
    const result = await intakeNfeXmlEmail(
      { ...last.input, delivery: { isLastAttempt: true } },
      last.dependencies,
    )
    expect(result).toEqual({ kind: 'rejected', reason: 'sender_not_authenticated' })
  })
})
