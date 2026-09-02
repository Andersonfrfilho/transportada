/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Envia o anexo antes do formulário: o rascunho existe sem candidatura até o submit amarrá-lo pelo
 * `draftId` (spec 070).
 *
 * A resposta traz **só** o identificador do rascunho. Nada do que a API leu do documento volta para
 * cá — e nem haveria o que voltar: a leitura do servidor acontece depois, no worker (ADR-0053). Quem
 * preenche o formulário é o pdf.js do navegador, em `documentIntake.service.ts`.
 */
const PUBLIC_ATTACHMENT_ATTACHMENTS_PATH = '/public/aggregate-application-attachments'

/**
 * ⚠️ Cópia por valor de `PUBLIC_ATTACHMENT_MAX_BYTES` da API — o bundle não carrega código de lá.
 * Recusar aqui é o que transforma "arquivo grande demais" num aviso no campo em vez de um 413 depois
 * da espera do upload. A API continua sendo quem decide de verdade.
 */
export const ATTACHMENT_MAX_BYTES = 1_572_864

/**
 * ⚠️ Cópia por valor de `AGGREGATE_APPLICATION_ATTACHMENT_TYPES` da api — o bundle não carrega código
 * dela, e é o CHECK do banco que manda. Tipo daqui que a api não conheça volta `400`, e o anexo se
 * perde em silêncio: `test/application/attachment-types.contract.ts` guarda a lista.
 */
export const ATTACHMENT_TYPES = [
  'address_proof',
  'ccmei',
  'cnh',
  'company_document',
  'crlv',
  'other',
] as const
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number]

export type UploadAttachmentInput = Readonly<{
  companyId: string
  file: Blob
  fileName: string
  turnstileToken?: string
  type: AttachmentType
}>

export type UploadAttachmentResult =
  | Readonly<{ draftId: string; status: 'uploaded' }>
  | Readonly<{ reason: 'too_large' | 'rejected' | 'unreachable'; status: 'failed' }>

export type AttachmentClient = Readonly<{
  upload: (input: UploadAttachmentInput) => Promise<UploadAttachmentResult>
}>

function readDraftId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const data = (value as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return undefined
  const draftId = (data as { draftId?: unknown }).draftId
  return typeof draftId === 'string' && draftId !== '' ? draftId : undefined
}

/**
 * Só o que este cliente usa. `typeof fetch` arrastaria `preconnect` e obrigaria todo teste a montar
 * um dublê que finge ser o `fetch` inteiro.
 */
type RequestSender = (url: string, init: RequestInit) => Promise<Response>

export function createAttachmentClient(
  dependencies: Readonly<{ apiBaseUrl: string; fetch?: RequestSender }>,
): AttachmentClient {
  const request = dependencies.fetch ?? globalThis.fetch.bind(globalThis)

  return {
    async upload({ companyId, file, fileName, turnstileToken, type }) {
      if (file.size > ATTACHMENT_MAX_BYTES) return { reason: 'too_large', status: 'failed' }

      const body = new FormData()
      body.set('companyId', companyId)
      body.set('type', type)
      if (turnstileToken !== undefined) body.set('turnstileToken', turnstileToken)
      body.set('file', file, fileName)

      try {
        const response = await request(
          `${dependencies.apiBaseUrl}${PUBLIC_ATTACHMENT_ATTACHMENTS_PATH}`,
          { body, cache: 'no-store', method: 'POST' },
        )
        if (!response.ok) return { reason: 'rejected', status: 'failed' }

        const draftId = readDraftId(await response.json().catch(() => undefined))
        /**
         * Resposta sem `draftId` é falha, não sucesso silencioso: sem o identificador o submit não
         * teria o que amarrar, e a candidatura chegaria ao operador dizendo que anexou algo.
         */
        return draftId === undefined
          ? { reason: 'rejected', status: 'failed' }
          : { draftId, status: 'uploaded' }
      } catch {
        return { reason: 'unreachable', status: 'failed' }
      }
    },
  }
}
