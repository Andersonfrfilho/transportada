/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { AttachmentGroupEntries, AttachmentStore } from './offlineAttachments.service'
import type { OfflineQueueStore, QueuedReport } from './offlineQueue.service'

/**
 * "Confirmar em lote" (spec 189 T9.2, segurança M1 — decisão do usuário). Sem rede, a app abre o
 * snapshot de quem usou por último **sem token**: a posse do aparelho basta para registrar em nome
 * dele. O que foi gravado assim sai com `isUnverified`, a drenagem não envia, e depois de entrar o
 * dono vê "N registros feitos sem rede às HH:MM — enviar?": confirmar tira a marca e drena;
 * descartar apaga o item e o dado. Registro em `docs/SECURITY.md`.
 */
export type UnverifiedSummary = Readonly<{ count: number; firstRecordedAt: string }>

function isOwnUnverified(
  item: Readonly<{ isUnverified?: true; subHash?: string }>,
  ownerSubHash: string,
): boolean {
  return item.isUnverified === true && item.subHash === ownerSubHash
}

export function summarizeUnverifiedPending(input: {
  readonly attachments: AttachmentGroupEntries
  readonly ownerSubHash: string
  readonly reports: readonly QueuedReport[]
}): UnverifiedSummary | undefined {
  const recordedAt = [
    ...input.reports
      .filter((item) => isOwnUnverified(item, input.ownerSubHash))
      .map((item) => item.createdAt),
    ...input.attachments.flatMap(([, items]) =>
      items
        .filter((item) => isOwnUnverified(item, input.ownerSubHash))
        .map((item) => item.capturedAt),
    ),
  ].sort()
  const firstRecordedAt = recordedAt[0]
  if (firstRecordedAt === undefined) return undefined
  return { count: recordedAt.length, firstRecordedAt }
}

function withoutMark<TItem extends Readonly<{ isUnverified?: true }>>(item: TItem): TItem {
  return Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'isUnverified')) as TItem
}

/** "Enviar": o dono autenticado assume o que foi feito sem rede — a marca sai, a drenagem leva. */
export async function confirmUnverifiedPending(input: {
  readonly attachmentStore: AttachmentStore
  readonly ownerSubHash: string
  readonly store: OfflineQueueStore
}): Promise<void> {
  await input.store.update((current) =>
    current.map((item) => (isOwnUnverified(item, input.ownerSubHash) ? withoutMark(item) : item)),
  )

  const groups = await input.attachmentStore.readAll()
  await Promise.all(
    groups
      .filter(([, items]) => items.some((item) => isOwnUnverified(item, input.ownerSubHash)))
      .map(([eventKey]) =>
        input.attachmentStore.update({
          eventKey,
          mutate: (current) =>
            current.map((item) =>
              isOwnUnverified(item, input.ownerSubHash) ? withoutMark(item) : item,
            ),
        }),
      ),
  )
}

/**
 * "Descartar": o evento, o blob, o documento do recebedor e a posição saem do aparelho — e o anexo
 * pendurado num evento descartado vai junto, porque sem o evento ele subiria para uma entrega que o
 * servidor nunca viu. Só os do dono: o de outra conta tem o próprio "Descartar".
 */
export async function discardUnverifiedPending(input: {
  readonly attachmentStore: AttachmentStore
  readonly ownerSubHash: string
  readonly store: OfflineQueueStore
}): Promise<number> {
  const discardedEventKeys = new Set<string>()
  await input.store.update((current) =>
    current.filter((item) => {
      if (!isOwnUnverified(item, input.ownerSubHash)) return true
      discardedEventKeys.add(item.report.idempotencyKey)
      return false
    }),
  )

  const groups = await input.attachmentStore.readAll()
  const discardedAttachments = await Promise.all(
    groups.map(async ([eventKey, items]) => {
      const isEventDiscarded = discardedEventKeys.has(eventKey)
      const discardable = items.filter(
        (item) => isEventDiscarded || isOwnUnverified(item, input.ownerSubHash),
      )
      if (discardable.length === 0) return 0
      await input.attachmentStore.update({
        eventKey,
        mutate: (current) =>
          isEventDiscarded
            ? []
            : current.filter((item) => !isOwnUnverified(item, input.ownerSubHash)),
      })
      return discardable.length
    }),
  )

  return discardedEventKeys.size + discardedAttachments.reduce((total, count) => total + count, 0)
}
