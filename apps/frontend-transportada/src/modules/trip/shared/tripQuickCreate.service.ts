/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DailyAllowanceDaysReading } from './dailyAllowanceDaysField.service'
import type { ScannedNfeDocument } from './trip.types'

/**
 * A viagem nasce das notas, não de uma casca vazia. O separador chega com a etiqueta na mão: ele
 * bipa, a nota entra na lista, e só no fim ele diz quem leva. Criar a viagem antes disso obrigava a
 * abrir o detalhe para então começar a bipar — dois passos para o que é um.
 *
 * Aqui nada vai para o servidor: a lista é montada na tela e vira uma viagem de uma vez só. Criar a
 * viagem no primeiro bipe deixaria rascunho órfão toda vez que alguém desistisse no meio.
 */
export type TripQuickCreateEntryStatus = 'refused' | 'staged'

export type TripQuickCreateRefusal = 'alreadyOnTrip' | 'notAuthorized'

export type TripQuickCreateEntry = Readonly<{
  accessKey: string
  document?: ScannedNfeDocument
  refusal?: TripQuickCreateRefusal
  status: TripQuickCreateEntryStatus
}>

export type TripQuickCreateQueue = readonly TripQuickCreateEntry[]

export const EMPTY_QUICK_CREATE_QUEUE: TripQuickCreateQueue = []

export type TripQuickCreateIssue =
  | 'dailyAllowanceDaysInvalid'
  | 'driverRequired'
  | 'helperWithoutDriver'
  | 'noDocument'
  | 'vehicleRequired'

/**
 * Spec 217 (RF1/D5): o botão de criar-e-planejar num clique (`singleClick`) exige nota, motorista
 * e veículo — segue como sempre. "Salvar rascunho" (`draft`) exige só a nota: a viagem nasce
 * `awaiting_crew` quando a tripulação falta, e isso é uma resposta válida, não um erro de formulário.
 */
export type TripQuickCreatePath = 'draft' | 'singleClick'

/**
 * ⚠️ **Nota já em viagem é recusa, não silêncio.** Ela existe, a busca a encontra, e sem esta linha
 * o operador só descobriria no vínculo — com a viagem já criada e a carga já no caminhão.
 *
 * Nota cancelada ou negada também fica de fora: o que a SEFAZ recusou não sai do galpão.
 */
function decideEntry(input: {
  readonly accessKey: string
  readonly document: ScannedNfeDocument
}): TripQuickCreateEntry {
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

/** Só o que ficou de pé vira vínculo — a recusada não entra na viagem. */
export function stagedDocumentIds(queue: TripQuickCreateQueue): readonly string[] {
  return queue.flatMap((entry) =>
    entry.status === 'staged' && entry.document !== undefined ? [entry.document.id] : [],
  )
}

/**
 * O que a busca ainda pode oferecer: tudo menos o que já está na fila da viagem.
 *
 * ⚠️ A nota escolhida **sai da lista**, e volta assim que for retirada da fila. Mantê-la ali é
 * oferecer de novo o que já foi levado: quem monta um lote de trinta notas perde a conta de quais
 * faltam, e a linha marcada não ajuda — ela some no meio das outras a cada rolagem.
 *
 * O corte é por **id da nota**: a deduplicação da fila é por chave, e a busca não a conhece.
 */
export function listSelectableDocuments<TDocument extends { readonly id: string }>(
  input: Readonly<{ documents: readonly TDocument[]; queue: TripQuickCreateQueue }>,
): readonly TDocument[] {
  const staged = new Set(stagedDocumentIds(input.queue))
  if (staged.size === 0) return input.documents

  return input.documents.filter((document) => !staged.has(document.id))
}

/** As notas em fila, como o mapa da montagem as lê: cidade, UF e o código que casa com a malha. */
export function stagedDocuments(queue: TripQuickCreateQueue): readonly ScannedNfeDocument[] {
  return queue.flatMap((entry) =>
    entry.status === 'staged' && entry.document !== undefined ? [entry.document] : [],
  )
}

export function validateQuickCreate(input: {
  readonly dailyAllowanceDays: DailyAllowanceDaysReading
  readonly driverIds: readonly string[]
  /** Spec 149 D5: ajudante sem motorista é recusado pela API (409) — a tela avisa antes. */
  readonly helperIds?: readonly string[]
  readonly path: TripQuickCreatePath
  readonly queue: TripQuickCreateQueue
  readonly vehicleId: string
}): readonly TripQuickCreateIssue[] {
  const issues: TripQuickCreateIssue[] = []
  if (stagedDocumentIds(input.queue).length === 0) issues.push('noDocument')
  if ((input.helperIds ?? []).length > 0 && input.driverIds.length === 0) {
    issues.push('helperWithoutDriver')
  }
  /** Spec 217 (RF1/D5): só o clique único amarra a tripulação — o rascunho nasce sem ela. */
  if (input.path === 'singleClick') {
    if (input.driverIds.length === 0) issues.push('driverRequired')
    if (input.vehicleId === '') issues.push('vehicleRequired')
  }
  /** Campo vazio é escolha; `2,5` é engano — e engano que passa vira viagem com outro número. */
  if (input.dailyAllowanceDays.of === 'invalid') issues.push('dailyAllowanceDaysInvalid')
  return issues
}

/**
 * O lote vem da busca, que já traz a nota inteira: pedir a chave de volta ao servidor uma por uma
 * seria refazer uma consulta que acabou de ser feita. O veredito é o da linha bipada — nota já em
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
