/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  AttachmentGroupEntries,
  AttachmentStore,
  QueuedAttachment,
} from './offlineAttachments.service'
import type { OfflineQueueStore, QueuedReport } from './offlineQueue.service'

/**
 * A fila tem dono (plan D5, ADR-0075 §8): cada item leva o `subHash` de quem tocou, e a drenagem só
 * envia os do `sub` autenticado. O que é de outra conta — outro motorista usou o mesmo aparelho —
 * **nunca** sai com o token deste: aparece como "pendências de outra conta", com "Descartar" e aviso.
 * Item sem dono conta como de outra conta.
 */
function isOwnedBy(item: Readonly<{ subHash?: string }>, ownerSubHash: string): boolean {
  return item.subHash === ownerSubHash
}

export type PendingByOwner = Readonly<{
  foreignCount: number
  ownAttachments: AttachmentGroupEntries
  ownReports: readonly QueuedReport[]
}>

export function partitionPendingByOwner(input: {
  readonly attachments: AttachmentGroupEntries
  readonly ownerSubHash: string
  readonly reports: readonly QueuedReport[]
}): PendingByOwner {
  const ownReports = input.reports.filter((item) => isOwnedBy(item, input.ownerSubHash))
  const ownAttachments = input.attachments.flatMap(([eventKey, items]) => {
    const own = items.filter((item) => isOwnedBy(item, input.ownerSubHash))
    return own.length === 0 ? [] : [[eventKey, own] as const]
  })
  const attachmentCount = input.attachments.reduce((total, [, items]) => total + items.length, 0)
  const ownAttachmentCount = ownAttachments.reduce((total, [, items]) => total + items.length, 0)

  return {
    foreignCount: input.reports.length - ownReports.length + (attachmentCount - ownAttachmentCount),
    ownAttachments,
    ownReports,
  }
}

/** "Descartar": o item e o dado (blob, posição) saem do aparelho, e só os de outra conta. */
export async function discardForeignPending(input: {
  readonly attachmentStore: AttachmentStore
  readonly ownerSubHash: string
  readonly store: OfflineQueueStore
}): Promise<number> {
  let discardedReports = 0
  await input.store.update((current) => {
    const own = current.filter((item) => isOwnedBy(item, input.ownerSubHash))
    discardedReports = current.length - own.length
    return own
  })

  const groups = await input.attachmentStore.readAll()
  const results = await Promise.all(
    groups.map(async ([eventKey, items]) => {
      if (items.every((item) => isOwnedBy(item, input.ownerSubHash))) return 0
      let discarded = 0
      await input.attachmentStore.update({
        eventKey,
        mutate: (current: readonly QueuedAttachment[]) => {
          const own = current.filter((item) => isOwnedBy(item, input.ownerSubHash))
          discarded = current.length - own.length
          return own
        },
      })
      return discarded
    }),
  )

  return discardedReports + results.reduce((total, count) => total + count, 0)
}

/**
 * "Sair" com pendência própria (spec 189 T9.2, segurança M2): descartar leva o evento, o blob, o
 * documento e o nome do recebedor e a posição — só os do dono. Deixar no aparelho faria o próximo
 * motorista ver tudo como "pendência de outra conta", sem prazo além dos 7 dias.
 */
export async function discardOwnPending(input: {
  readonly attachmentStore: AttachmentStore
  readonly ownerSubHash: string
  readonly store: OfflineQueueStore
}): Promise<number> {
  let discardedReports = 0
  await input.store.update((current) => {
    const kept = current.filter((item) => !isOwnedBy(item, input.ownerSubHash))
    discardedReports = current.length - kept.length
    return kept
  })

  const groups = await input.attachmentStore.readAll()
  const results = await Promise.all(
    groups.map(async ([eventKey, items]) => {
      const ownCount = items.filter((item) => isOwnedBy(item, input.ownerSubHash)).length
      if (ownCount === 0) return 0
      await input.attachmentStore.update({
        eventKey,
        mutate: (current: readonly QueuedAttachment[]) =>
          current.filter((item) => !isOwnedBy(item, input.ownerSubHash)),
      })
      return ownCount
    }),
  )

  return discardedReports + results.reduce((total, count) => total + count, 0)
}
