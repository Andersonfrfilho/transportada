/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.2 (contract.md §5.2): duas provas por texto de fonte e o ouro das rotas antigas.
 *
 * (1) A API não depende de `@adatechnology/conversation-contracts` em produção: o pacote é `devDependency` e só
 * `test/**` o importa (code-standart §13 — a paridade lê a fonte da verdade sem acoplar o deploy à versão).
 * (2) As rotas antigas da 183 (`/me/.../occurrences/**`, `/client/**`, tela antiga) não ganham `transcription`
 * nem `durationMs`: a forma do anexo delas segue com cinco campos, byte a byte.
 */
import { readdir, readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import { createListOccurrenceConversationsUseCase } from '../../src/occurrence-conversation/application/read-occurrence-conversations.use-case.js'
import { signConversationAttachments } from '../../src/occurrence-conversation/application/conversation-attachment.service.js'
import type { ConversationAttachmentRecord } from '../../src/occurrence-conversation/application/conversation-attachment.port.js'
import type { OccurrenceConversationReaderPort } from '../../src/occurrence-conversation/application/occurrence-conversation.port.js'

const API_ROOT = new URL('../../', import.meta.url)
const SOURCE_ROOT = new URL('src/', API_ROOT)
const PACKAGE_NAME = '@adatechnology/conversation-contracts'
const PACKAGE_VERSION = '0.6.0'
/** Import estático, dinâmico ou `require`: o comentário que cita o nome do pacote não conta. */
const IMPORT_OF_PACKAGE =
  /(?:from|import\s*\(|require\s*\()\s*['"]@adatechnology\/conversation-contracts/u

/** Os serializadores antigos: nada do que a 264 acrescenta pode aparecer neles. */
const OLD_ROUTE_SOURCES = [
  'occurrence-conversation/application/read-occurrence-conversations.use-case.ts',
  'occurrence-conversation/application/contractor-portal-conversation.use-case.ts',
  'occurrence-conversation/application/driver-conversation.use-case.ts',
] as const

const NEW_FIELD_MARKERS = [
  'transcription',
  'durationMs',
  'toParticipantTranscription',
  'resolveAudioDurationMs',
] as const

async function listSourceFiles(): Promise<readonly string[]> {
  const entries = await readdir(SOURCE_ROOT, { recursive: true })
  return entries.filter((entry) => entry.endsWith('.ts') || entry.endsWith('.tsx'))
}

describe('o pacote conversation-contracts é só de teste', () => {
  test('nenhum arquivo de src/** o importa', async () => {
    const offenders: string[] = []
    for (const file of await listSourceFiles()) {
      const text = await readFile(new URL(file, SOURCE_ROOT), 'utf8')
      if (IMPORT_OF_PACKAGE.test(text)) offenders.push(file)
    }

    expect(offenders).toEqual([])
  })

  test('está em devDependencies, em versão exata, e fora de dependencies', async () => {
    const manifest = JSON.parse(await readFile(new URL('package.json', API_ROOT), 'utf8')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(manifest.devDependencies[PACKAGE_NAME]).toBe(PACKAGE_VERSION)
    expect(manifest.dependencies[PACKAGE_NAME]).toBeUndefined()
  })
})

describe('ouro das rotas antigas: sem transcription nem durationMs', () => {
  test.each([...OLD_ROUTE_SOURCES])('%s não cita os campos novos', async (file) => {
    const text = await readFile(new URL(file, SOURCE_ROOT), 'utf8')

    for (const marker of NEW_FIELD_MARKERS) expect(text).not.toContain(marker)
  })

  /** Um anexo de áudio com duração, como a coluna `duration_ms` o devolve hoje (RF17 da 183). */
  const AUDIO_RECORD = {
    bucket: 'bucket',
    contentType: 'audio/ogg',
    durationMs: 12_000,
    fileName: 'recado.ogg',
    id: 'attachment-1',
    messageId: 'message-1',
    objectKey: 'key-1',
    sizeBytes: 2048,
  }
  const STORAGE = {
    createSignedDownload: async () => new URL('https://s3.test/signed'),
  }

  test('assinar o anexo antigo devolve exatamente os cinco campos', async () => {
    const signed = await signConversationAttachments(STORAGE, [
      AUDIO_RECORD as ConversationAttachmentRecord,
    ])

    expect(JSON.stringify(signed.get('message-1'))).toBe(
      '[{"contentType":"audio/ogg","fileName":"recado.ogg","id":"attachment-1","sizeBytes":2048,"url":"https://s3.test/signed"}]',
    )
  })

  test('a leitura antiga da ocorrência (read-occurrence-conversations) sai byte a byte igual', async () => {
    const reader: OccurrenceConversationReaderPort = {
      findAttachments: async () => [AUDIO_RECORD as ConversationAttachmentRecord],
      findConversations: async () => ({
        conversations: [
          {
            id: 'conversation-1',
            messages: [{ id: 'message-1' }],
          },
        ],
      }),
    } as unknown as OccurrenceConversationReaderPort
    const useCase = createListOccurrenceConversationsUseCase({ reader, storage: STORAGE })

    const view = await useCase.list({ companyId: 'company-1', occurrenceId: 'o', userId: 'u' })

    expect(JSON.stringify(view)).toBe(
      '{"conversations":[{"id":"conversation-1","messages":[{"id":"message-1","attachments":[{"contentType":"audio/ogg","fileName":"recado.ogg","id":"attachment-1","sizeBytes":2048,"url":"https://s3.test/signed"}]}]}]}',
    )
  })
})
