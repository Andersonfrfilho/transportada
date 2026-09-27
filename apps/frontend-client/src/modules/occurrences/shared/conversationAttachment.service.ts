/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T702b (RF10, emenda à ADR-0073): o anexo da contratante no portal.
 *
 * - A lista de tipos e o teto do canal portal são **cópia por valor** da política da API
 *   (`conversation-attachment.policy.ts`), com contrato de paridade que lê a de lá. A tela recusa
 *   antes de subir; quem confere de verdade é a API, pelos bytes.
 * - O teto por tipo sai do `resolveMaxAttachmentSizeBytes` do `@adatechnology/conversations-ui`
 *   (função pura; o `styles.css` do pacote continua fora).
 * - Subir é pedir a URL à API e mandar o arquivo direto ao bucket, um de cada vez; `uploaded`
 *   guarda o que já subiu do rascunho, e o reenvio reusa os mesmos ids (a chave da mensagem
 *   continua valendo).
 */
import { formatFileSize, resolveMaxAttachmentSizeBytes } from '@adatechnology/conversations-ui'

const MB = 1024 * 1024

export type PortalAttachmentKind = 'audio' | 'document' | 'image'

export const PORTAL_ATTACHMENT_CONTENT_TYPES: Readonly<Record<string, PortalAttachmentKind>> = {
  'application/pdf': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'audio/mp4': 'audio',
  'audio/mpeg': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'text/csv': 'document',
}

export const PORTAL_ATTACHMENT_LIMITS: Readonly<Record<PortalAttachmentKind, number>> = {
  audio: 16 * MB,
  document: 25 * MB,
  image: 10 * MB,
}

export const PORTAL_ATTACHMENTS_PER_MESSAGE = 5

export const PORTAL_ATTACHMENT_ACCEPT = [
  ...Object.keys(PORTAL_ATTACHMENT_CONTENT_TYPES),
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.xlsx',
  '.xls',
  '.csv',
].join(',')

export function portalAttachmentKind(contentType: string): PortalAttachmentKind {
  return PORTAL_ATTACHMENT_CONTENT_TYPES[contentType] ?? 'document'
}

/** Soma os arquivos novos aos escolhidos; cada recusa vem com a frase do motivo. */
export function pickPortalAttachments(
  current: readonly File[],
  incoming: readonly File[],
): Readonly<{ files: readonly File[]; messages: readonly string[] }> {
  const files = [...current]
  const messages: string[] = []
  for (const file of incoming) {
    if (PORTAL_ATTACHMENT_CONTENT_TYPES[file.type] === undefined) {
      messages.push(`${file.name}: este tipo de arquivo não é aceito.`)
      continue
    }
    /** Vídeo não está na lista; o teto zero só existe porque o tipo do pacote pede o campo. */
    const maxBytes = resolveMaxAttachmentSizeBytes(file.type, {
      ...PORTAL_ATTACHMENT_LIMITS,
      video: 0,
    })
    if (file.size <= 0 || file.size > maxBytes) {
      messages.push(`${file.name}: passa do limite de ${formatFileSize(maxBytes)}.`)
      continue
    }
    if (files.length >= PORTAL_ATTACHMENTS_PER_MESSAGE) {
      messages.push(
        `${file.name}: são no máximo ${String(PORTAL_ATTACHMENTS_PER_MESSAGE)} anexos por mensagem.`,
      )
      continue
    }
    files.push(file)
  }
  return { files, messages }
}

export async function uploadPortalAttachments(input: {
  readonly files: readonly File[]
  readonly putFile: (upload: { readonly file: File; readonly url: string }) => Promise<void>
  readonly requestUpload: (declared: {
    readonly contentType: string
    readonly fileName: string
    readonly sizeBytes: number
  }) => Promise<Readonly<{ uploadId: string; uploadUrl: string }>>
  readonly uploaded: Map<File, string>
}): Promise<readonly string[]> {
  const ids: string[] = []
  for (const file of input.files) {
    const known = input.uploaded.get(file)
    if (known !== undefined) {
      ids.push(known)
      continue
    }
    const upload = await input.requestUpload({
      contentType: file.type,
      fileName: file.name,
      sizeBytes: file.size,
    })
    await input.putFile({ file, url: upload.uploadUrl })
    input.uploaded.set(file, upload.uploadId)
    ids.push(upload.uploadId)
  }
  return ids
}

export { formatFileSize }

/** Spec 183 T705: a velocidade do áudio (o `<audio>` nativo não tem botão para ela). */
export const PORTAL_PLAYBACK_RATES = [1, 1.5, 2] as const

export function nextPortalPlaybackRate(current: number): number {
  const index = PORTAL_PLAYBACK_RATES.findIndex((rate) => rate === current)
  return PORTAL_PLAYBACK_RATES[(index + 1) % PORTAL_PLAYBACK_RATES.length] ?? 1
}
