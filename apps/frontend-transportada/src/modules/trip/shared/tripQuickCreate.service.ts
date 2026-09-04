/* Copyright (c) 2026 Ada Technology. MIT License. */
import { extractNfeAccessKey } from '@/modules/shared/nfeAccessKey.service'

import type { ScannedNfeDocument } from './trip.types'

/**
 * A viagem nasce das notas, não de uma casca vazia. O separador chega com a etiqueta na mão: ele
 * bipa, a nota entra na lista, e só no fim ele diz quem leva. Criar a viagem antes disso obrigava a
 * abrir o detalhe para então começar a bipar — dois passos para o que é um.
 *
 * Aqui nada vai para o servidor: a lista é montada na tela e vira uma viagem de uma vez só. Criar a
 * viagem no primeiro bipe deixaria rascunho órfão toda vez que alguém desistisse no meio.
 */
export type TripQuickCreateEntryStatus = 'refused' | 'resolving' | 'staged'

export type TripQuickCreateRefusal = 'alreadyOnTrip' | 'lookupFailed' | 'notAuthorized' | 'notFound'

export type TripQuickCreateEntry = Readonly<{
  accessKey: string
  document?: ScannedNfeDocument
  refusal?: TripQuickCreateRefusal
  status: TripQuickCreateEntryStatus
}>

export type TripQuickCreateQueue = readonly TripQuickCreateEntry[]

export const EMPTY_QUICK_CREATE_QUEUE: TripQuickCreateQueue = []

export type TripQuickCreateIssue = 'driverRequired' | 'noDocument' | 'vehicleRequired'

/**
 * A leitura da câmera dispara a cada quadro e a mesma etiqueta passa duas vezes o tempo todo: texto
 * sem chave é descartado calado, e chave já na lista não vira segunda linha nem segunda consulta.
 */
export function acceptQuickCreateScan(input: {
  readonly queue: TripQuickCreateQueue
  readonly text: string
}): Readonly<{ accessKey?: string; queue: TripQuickCreateQueue }> {
  const accessKey = extractNfeAccessKey(input.text)
  if (accessKey === undefined) return { queue: input.queue }
  if (input.queue.some((entry) => entry.accessKey === accessKey)) return { queue: input.queue }

  return { accessKey, queue: [...input.queue, { accessKey, status: 'resolving' }] }
}

/**
 * O veredito chega fora de ordem e "limpar" pode ter passado no meio: o que perdeu a linha dele não
 * a ressuscita.
 */
export function resolveQuickCreateEntry(input: {
  readonly accessKey: string
  readonly document: ScannedNfeDocument | null
  readonly queue: TripQuickCreateQueue
}): TripQuickCreateQueue {
  if (!input.queue.some((entry) => entry.accessKey === input.accessKey)) return input.queue

  const resolved = decideEntry({ accessKey: input.accessKey, document: input.document })
  return input.queue.map((entry) => (entry.accessKey === input.accessKey ? resolved : entry))
}

export function refuseQuickCreateEntry(input: {
  readonly accessKey: string
  readonly queue: TripQuickCreateQueue
  readonly refusal: TripQuickCreateRefusal
}): TripQuickCreateQueue {
  if (!input.queue.some((entry) => entry.accessKey === input.accessKey)) return input.queue

  return input.queue.map((entry) =>
    entry.accessKey === input.accessKey
      ? { accessKey: input.accessKey, refusal: input.refusal, status: 'refused' }
      : entry,
  )
}

/**
 * ⚠️ **Nota já em viagem é recusa, não silêncio.** Ela existe, a busca a encontra, e sem esta linha
 * o operador só descobriria no vínculo — com a viagem já criada e a carga já no caminhão.
 *
 * Nota cancelada ou negada também fica de fora: o que a SEFAZ recusou não sai do galpão.
 */
function decideEntry(input: {
  readonly accessKey: string
  readonly document: ScannedNfeDocument | null
}): TripQuickCreateEntry {
  if (input.document === null) {
    return { accessKey: input.accessKey, refusal: 'notFound', status: 'refused' }
  }
  if (input.document.tripId !== null) {
    return {
      accessKey: input.accessKey,
      document: input.document,
      refusal: 'alreadyOnTrip',
      status: 'refused',
    }
  }
  if (input.document.status !== 'authorized') {
    return {
      accessKey: input.accessKey,
      document: input.document,
      refusal: 'notAuthorized',
      status: 'refused',
    }
  }
  return { accessKey: input.accessKey, document: input.document, status: 'staged' }
}

export function removeQuickCreateEntry(input: {
  readonly accessKey: string
  readonly queue: TripQuickCreateQueue
}): TripQuickCreateQueue {
  return input.queue.filter((entry) => entry.accessKey !== input.accessKey)
}

/** Só o que ficou de pé vira vínculo — recusada e resolvendo não entram na viagem. */
export function stagedDocumentIds(queue: TripQuickCreateQueue): readonly string[] {
  return queue.flatMap((entry) =>
    entry.status === 'staged' && entry.document !== undefined ? [entry.document.id] : [],
  )
}

/** As notas em fila, como o mapa da montagem as lê: cidade, UF e o código que casa com a malha. */
export function stagedDocuments(queue: TripQuickCreateQueue): readonly ScannedNfeDocument[] {
  return queue.flatMap((entry) =>
    entry.status === 'staged' && entry.document !== undefined ? [entry.document] : [],
  )
}

export function isQuickCreateEntryPending(entry: TripQuickCreateEntry): boolean {
  return entry.status === 'resolving'
}

export function validateQuickCreate(input: {
  readonly driverIds: readonly string[]
  readonly queue: TripQuickCreateQueue
  readonly vehicleId: string
}): readonly TripQuickCreateIssue[] {
  const issues: TripQuickCreateIssue[] = []
  if (stagedDocumentIds(input.queue).length === 0) issues.push('noDocument')
  if (input.driverIds.length === 0) issues.push('driverRequired')
  if (input.vehicleId === '') issues.push('vehicleRequired')
  return issues
}

/**
 * O lote vem da busca, que já traz a nota inteira: pedir a chave de volta ao servidor uma por uma
 * seria refazer uma consulta que acabou de ser feita. O veredito é o **mesmo** do bipe — nota já em
 * viagem ou não autorizada entra recusada, com o motivo na linha dela, e não some da lista.
 *
 * Chave repetida é ignorada: quem bipou a nota e depois a trouxe pela busca continua com uma linha.
 */
export function stageQuickCreateDocuments(input: {
  readonly documents: readonly ScannedNfeDocument[]
  readonly queue: TripQuickCreateQueue
}): TripQuickCreateQueue {
  const known = new Set(input.queue.map((entry) => entry.accessKey))
  const novos: TripQuickCreateEntry[] = []

  for (const document of input.documents) {
    if (known.has(document.accessKey)) continue
    known.add(document.accessKey)
    novos.push(decideEntry({ accessKey: document.accessKey, document }))
  }

  return novos.length === 0 ? input.queue : [...input.queue, ...novos]
}
