/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 161 T22 (RF31): estado do envio de cada foto do `OccurrencePhotoPicker` — uma requisição por
 * foto, nunca o lote inteiro numa chamada só. `sendOccurrencePhotosSequentially` é o que separa
 * envio sequencial de "tudo ou nada": a primeira foto **cria** a ocorrência (registro multipart); a
 * segunda em diante **anexa** a uma ocorrência já existente. Falha no meio da lista para o envio
 * ali — as fotos já enviadas continuam `sent`, e o reenvio (`resolveOccurrencePhotoSendQueue`)
 * refaz só o que falhou/ficou pendente, nunca as que já foram.
 */

export type OccurrencePhotoSendStatus = 'failed' | 'pending' | 'sending' | 'sent'

export type OccurrencePhotoSendItem = Readonly<{
  error: string | undefined
  photoId: string
  status: OccurrencePhotoSendStatus
}>

export function buildOccurrencePhotoSendState(
  photoIds: readonly string[],
): readonly OccurrencePhotoSendItem[] {
  return photoIds.map((photoId) => ({ error: undefined, photoId, status: 'pending' as const }))
}

function updateItem(
  state: readonly OccurrencePhotoSendItem[],
  photoId: string,
  patch: Readonly<{ error?: string; status: OccurrencePhotoSendStatus }>,
): readonly OccurrencePhotoSendItem[] {
  return state.map((item) =>
    item.photoId === photoId ? { ...item, error: patch.error, status: patch.status } : item,
  )
}

export function markOccurrencePhotoSending(
  state: readonly OccurrencePhotoSendItem[],
  photoId: string,
): readonly OccurrencePhotoSendItem[] {
  return updateItem(state, photoId, { status: 'sending' })
}

export function markOccurrencePhotoSent(
  state: readonly OccurrencePhotoSendItem[],
  photoId: string,
): readonly OccurrencePhotoSendItem[] {
  return updateItem(state, photoId, { status: 'sent' })
}

export function markOccurrencePhotoFailed(
  state: readonly OccurrencePhotoSendItem[],
  photoId: string,
  error: string,
): readonly OccurrencePhotoSendItem[] {
  return updateItem(state, photoId, { error, status: 'failed' })
}

/**
 * O que falta enviar, na ordem original — usada tanto para o primeiro envio (tudo `pending`) quanto
 * para o reenvio (só o que não chegou a `sent` volta à fila; o que já foi não é tocado de novo).
 */
export function resolveOccurrencePhotoSendQueue(
  state: readonly OccurrencePhotoSendItem[],
): readonly string[] {
  return state.filter((item) => item.status !== 'sent').map((item) => item.photoId)
}

export function hasOccurrencePhotoSendFailure(state: readonly OccurrencePhotoSendItem[]): boolean {
  return state.some((item) => item.status === 'failed')
}

export type OccurrencePhotoSendPort = Readonly<{
  /** 2ª a 5ª foto — a ocorrência já existe. */
  attach: (input: Readonly<{ occurrenceId: string; photoId: string }>) => Promise<void>
  /** 1ª foto da fila — cria a ocorrência e grava a foto na mesma chamada. */
  registerFirst: (
    input: Readonly<{ photoId: string }>,
  ) => Promise<Readonly<{ occurrenceId: string }>>
}>

export type SendOccurrencePhotosResult = Readonly<{ occurrenceId: string | undefined }>

/**
 * Sequencial de propósito (RF31/CA16): cada foto é uma requisição própria, aguardada antes da
 * próxima. Para no primeiro erro — o que já foi enviado (`onSent`) fica assim; o resto da fila nem
 * chega a tentar, e volta para `resolveOccurrencePhotoSendQueue` no próximo envio.
 */
export async function sendOccurrencePhotosSequentially(
  input: Readonly<{
    occurrenceId: string | undefined
    onFailed: (photoId: string, error: unknown) => void
    onSending: (photoId: string) => void
    onSent: (photoId: string, occurrenceId: string) => void
    photoIds: readonly string[]
    port: OccurrencePhotoSendPort
  }>,
): Promise<SendOccurrencePhotosResult> {
  let occurrenceId = input.occurrenceId

  for (const photoId of input.photoIds) {
    input.onSending(photoId)
    try {
      if (occurrenceId === undefined) {
        const registered = await input.port.registerFirst({ photoId })
        occurrenceId = registered.occurrenceId
      } else {
        await input.port.attach({ occurrenceId, photoId })
      }
      input.onSent(photoId, occurrenceId)
    } catch (error) {
      input.onFailed(photoId, error)
      return { occurrenceId }
    }
  }

  return { occurrenceId }
}

/**
 * Spec 156 T8/T22: mesmo molde de `resolveFieldReportKey` do hook — a chave de idempotência de uma
 * foto nasce na primeira tentativa e é **reusada** em todo reenvio dela, nunca trocada a cada clique.
 */
export function resolveOccurrencePhotoIdempotencyKey(
  keys: Readonly<Record<string, string>>,
  photoId: string,
  generateKey: () => string,
): Readonly<{ key: string; keys: Readonly<Record<string, string>> }> {
  const existing = keys[photoId]
  if (existing !== undefined) return { key: existing, keys }
  const key = generateKey()
  return { key, keys: { ...keys, [photoId]: key } }
}
