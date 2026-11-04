/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T5 (ampliada pelo Anderson em 04/11): **o pedido no grupo registra qualquer ocorrência
 * ativa, como o WhatsApp do motorista.** Mesmo caminho da spec 248 para a prorrogação: nota → tipo →
 * observação → confirmação → `registerDriverOccurrence`. O que acontece depois (e-mail à contratante,
 * retorno do boleto, alertas) é configuração do tipo, não deste fluxo.
 *
 * - A lista de tipos é a do WhatsApp do motorista (`isOfferedToDriver`): só tipo **ativo** do momento
 *   da nota, já filtrado pela contratante. Tipo desligado não aparece nem casa pelo nome.
 * - Pedido direto numa mensagem só: `@bot prorrogação do boleto 17234` acha a nota pelo número e o tipo
 *   pelo nome; o que faltar é perguntado.
 * - Listas e confirmação em texto numerado (o Evolution não tem botões); a resposta vale pelo número
 *   da opção ou pelo nome (spec 292, de-para).
 * - Tipo que exige o que o WhatsApp não colhe (foto, assinatura, produtos) volta com a frase do campo
 *   (`describeOccurrenceRequirementRefusal`), igual ao WhatsApp do motorista.
 * - Nada de nome de cliente nem valor no texto do grupo: só o número da nota.
 */
import type {
  GroupFlowOutcome,
  GroupFlowTurn,
  GroupRequestFlow,
} from './whatsapp-group-request.port.js'

export const GROUP_OCCURRENCE_STEP = {
  confirm: 'confirm',
  document: 'document',
  note: 'note',
  start: 'start',
  type: 'type',
} as const

/** Notas listadas por número de opção; acima disso o bot pede o número da nota. */
export const GROUP_DOCUMENT_LIST_LIMIT = 8
export const GROUP_OCCURRENCE_NOTE_MAX_LENGTH = 500

export type GroupDriverDocument = { readonly id: string; readonly number: string }
export type GroupOccurrenceType = { readonly id: string; readonly name: string }

export type GroupOccurrenceRegistration =
  | { readonly kind: 'registered' }
  /** A recusa já em frase para o grupo; `retry` diz para onde voltar (observação ou tipo). */
  | { readonly kind: 'refused'; readonly message: string; readonly retry: 'note' | 'type' | null }

export type GroupOccurrenceFlowPorts = {
  /** As notas das viagens ativas do motorista dono do grupo (regra 6: a nota está com ele). */
  listDriverDocuments(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly GroupDriverDocument[]>
  /** Os tipos que o motorista pode registrar nesta nota: ativos, do momento da nota, da contratante. */
  listOccurrenceTypes(input: {
    readonly companyId: string
    readonly documentId: string
  }): Promise<readonly GroupOccurrenceType[]>
  register(input: {
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
    /** Por pedido: a confirmação repetida não registra duas vezes. */
    readonly idempotencyKey: string
    readonly note: string
    readonly occurrenceTypeId: string
  }): Promise<GroupOccurrenceRegistration>
}

export const GROUP_OCCURRENCE_TEXT = {
  askDocument: (documents: readonly GroupDriverDocument[]) =>
    documents.length > GROUP_DOCUMENT_LIST_LIMIT
      ? 'Qual nota? Responda com o número da nota.'
      : [
          'Qual nota? Responda com o número da opção ou da nota:',
          ...documents.map((document, index) => `${index + 1}. NF ${document.number}`),
        ].join('\n'),
  askNote:
    'Quer acrescentar uma observação? Escreva o texto ou responda "pular" para seguir sem observação.',
  askType: (types: readonly GroupOccurrenceType[]) =>
    [
      'Qual ocorrência? Responda com o número ou o nome:',
      ...types.map((type, index) => `${index + 1}. ${type.name}`),
    ].join('\n'),
  confirm: (typeName: string, documentNumber: string, note: string) =>
    [
      `Confirma registrar "${typeName}" na NF ${documentNumber}?`,
      ...(note === '' ? [] : [`Observação: ${note}`]),
      'Responda 1 - Sim ou 2 - Não.',
    ].join('\n'),
  declined: 'Tudo bem, não registrei nada.',
  noDocuments: 'Não encontrei notas na viagem em andamento do motorista deste grupo.',
  noTypes: 'Não há tipo de ocorrência ativo para esta nota.',
  registered: (typeName: string, documentNumber: string) =>
    `Ocorrência "${typeName}" registrada na NF ${documentNumber}.`,
} as const

const REASON = {
  confirm: 'responda 1 para sim ou 2 para não',
  document: 'não achei essa nota na viagem do motorista',
  noteTooLong: `a observação passa de ${GROUP_OCCURRENCE_NOTE_MAX_LENGTH} caracteres`,
  type: 'não achei esse tipo de ocorrência na lista',
} as const

const YES = new Set(['1', 'sim', 's', 'confirmo', 'confirma', 'ok', 'pode'])
const NO = new Set(['2', 'nao', 'n'])
const SKIP = new Set(['pular', 'pula', 'sem', 'nao', 'continuar', 'seguir', '-'])

/** Vai ao `state` (jsonb) do pedido; `undefined` some na gravação. */
type FlowState = {
  readonly documentId?: string | undefined
  readonly documentNumber?: string | undefined
  readonly documents?: readonly GroupDriverDocument[] | undefined
  readonly note?: string | undefined
  readonly typeId?: string | undefined
  readonly typeName?: string | undefined
  readonly types?: readonly GroupOccurrenceType[] | undefined
}

export function createGroupOccurrenceFlow(ports: GroupOccurrenceFlowPorts): GroupRequestFlow {
  const continueWith = (
    step: string,
    state: FlowState,
    replies: readonly string[],
  ): GroupFlowOutcome => ({ kind: 'continue', replies, state, step })

  /** Com a nota escolhida: tipo já dito (pedido direto) ou a lista de tipos. */
  async function afterDocument(
    turn: GroupFlowTurn,
    state: FlowState,
    document: GroupDriverDocument,
    typeHint: string,
  ): Promise<GroupFlowOutcome> {
    const types = await ports.listOccurrenceTypes({
      companyId: turn.request.companyId,
      documentId: document.id,
    })
    if (types.length === 0) return { kind: 'done', replies: [GROUP_OCCURRENCE_TEXT.noTypes] }
    const next: FlowState = {
      ...state,
      documentId: document.id,
      documentNumber: document.number,
      documents: undefined,
      types,
    }
    const type = typeHint === '' ? undefined : findTypeByName(types, typeHint)
    if (type !== undefined) return afterType(next, type)
    if (types.length === 1 && types[0] !== undefined) return afterType(next, types[0])
    return continueWith(GROUP_OCCURRENCE_STEP.type, next, [GROUP_OCCURRENCE_TEXT.askType(types)])
  }

  function afterType(state: FlowState, type: GroupOccurrenceType): GroupFlowOutcome {
    return continueWith(
      GROUP_OCCURRENCE_STEP.note,
      { ...state, typeId: type.id, typeName: type.name, types: undefined },
      [GROUP_OCCURRENCE_TEXT.askNote],
    )
  }

  async function register(turn: GroupFlowTurn, state: FlowState): Promise<GroupFlowOutcome> {
    const { documentId, documentNumber = '', note = '', typeId, typeName = '' } = state
    if (documentId === undefined || typeId === undefined) {
      return { kind: 'done', replies: [GROUP_OCCURRENCE_TEXT.declined] }
    }
    const result = await ports.register({
      companyId: turn.request.companyId,
      documentId,
      driverId: turn.request.driverId,
      idempotencyKey: `whatsapp-group-request:${turn.request.id}`,
      note,
      occurrenceTypeId: typeId,
    })
    if (result.kind === 'registered') {
      return {
        kind: 'done',
        replies: [GROUP_OCCURRENCE_TEXT.registered(typeName, documentNumber)],
      }
    }
    if (result.retry === 'note') {
      return continueWith(GROUP_OCCURRENCE_STEP.note, state, [result.message])
    }
    if (result.retry === 'type') {
      const types = await ports.listOccurrenceTypes({
        companyId: turn.request.companyId,
        documentId,
      })
      const remaining = types.filter((type) => type.id !== typeId)
      if (remaining.length === 0) return { kind: 'done', replies: [result.message] }
      return continueWith(
        GROUP_OCCURRENCE_STEP.type,
        { ...state, typeId: undefined, typeName: undefined, types: remaining },
        [result.message, GROUP_OCCURRENCE_TEXT.askType(remaining)],
      )
    }
    return { kind: 'done', replies: [result.message] }
  }

  return {
    async answer(turn) {
      const state = turn.request.state as FlowState
      const text = turn.text

      switch (turn.request.step) {
        case GROUP_OCCURRENCE_STEP.document: {
          const documents = state.documents ?? []
          const document = pickDocument(documents, text)
          if (document === undefined) {
            return {
              kind: 'not_understood',
              prompt: GROUP_OCCURRENCE_TEXT.askDocument(documents),
              reason: REASON.document,
            }
          }
          return afterDocument(turn, state, document, '')
        }
        case GROUP_OCCURRENCE_STEP.type: {
          const types = state.types ?? []
          const type = pickOption(types, text) ?? findTypeByName(types, text)
          if (type === undefined) {
            return {
              kind: 'not_understood',
              prompt: GROUP_OCCURRENCE_TEXT.askType(types),
              reason: REASON.type,
            }
          }
          return afterType(state, type)
        }
        case GROUP_OCCURRENCE_STEP.note: {
          if (text.length > GROUP_OCCURRENCE_NOTE_MAX_LENGTH) {
            return {
              kind: 'not_understood',
              prompt: GROUP_OCCURRENCE_TEXT.askNote,
              reason: REASON.noteTooLong,
            }
          }
          const note = SKIP.has(normalize(text)) ? '' : text
          return continueWith(GROUP_OCCURRENCE_STEP.confirm, { ...state, note }, [
            GROUP_OCCURRENCE_TEXT.confirm(state.typeName ?? '', state.documentNumber ?? '', note),
          ])
        }
        case GROUP_OCCURRENCE_STEP.confirm: {
          const answer = normalize(text)
          if (YES.has(answer)) return register(turn, state)
          if (NO.has(answer)) return { kind: 'done', replies: [GROUP_OCCURRENCE_TEXT.declined] }
          return {
            kind: 'not_understood',
            prompt: GROUP_OCCURRENCE_TEXT.confirm(
              state.typeName ?? '',
              state.documentNumber ?? '',
              state.note ?? '',
            ),
            reason: REASON.confirm,
          }
        }
        default:
          return { kind: 'done', replies: [GROUP_OCCURRENCE_TEXT.declined] }
      }
    },

    initialStep: GROUP_OCCURRENCE_STEP.start,

    async start(turn) {
      const documents = await ports.listDriverDocuments({
        companyId: turn.request.companyId,
        driverId: turn.request.driverId,
      })
      if (documents.length === 0)
        return { kind: 'done', replies: [GROUP_OCCURRENCE_TEXT.noDocuments] }

      // Pedido direto: o número da nota no texto, e o resto do texto como pista do tipo.
      const mentioned = documents.find((document) =>
        tokensOf(turn.text).includes(document.number.replace(/^0+/u, '')),
      )
      if (mentioned !== undefined) {
        return afterDocument(turn, {}, mentioned, turn.text)
      }
      if (documents.length === 1 && documents[0] !== undefined) {
        return afterDocument(turn, {}, documents[0], turn.text)
      }
      return continueWith(GROUP_OCCURRENCE_STEP.document, { documents }, [
        GROUP_OCCURRENCE_TEXT.askDocument(documents),
      ])
    },
  }
}

/** Número da nota (sem zeros à esquerda) vence; senão o número da opção, se a lista foi mostrada. */
function pickDocument(
  documents: readonly GroupDriverDocument[],
  text: string,
): GroupDriverDocument | undefined {
  const digits = text.replace(/\D/gu, '').replace(/^0+/u, '')
  if (digits === '') return undefined
  const byNumber = documents.find((document) => document.number.replace(/^0+/u, '') === digits)
  if (byNumber !== undefined) return byNumber
  return documents.length <= GROUP_DOCUMENT_LIST_LIMIT ? pickOption(documents, text) : undefined
}

function pickOption<T>(options: readonly T[], text: string): T | undefined {
  const trimmed = text.trim().replace(/[.)]$/u, '')
  if (!/^\d{1,2}$/u.test(trimmed)) return undefined
  return options[Number(trimmed) - 1]
}

/** O nome inteiro no texto, ou todas as palavras fortes (4+ letras) do nome. */
export function findTypeByName(
  types: readonly GroupOccurrenceType[],
  text: string,
): GroupOccurrenceType | undefined {
  const said = normalize(text)
  if (said === '') return undefined
  const stems = new Set(said.split(' ').map(stem))
  const matches = types.filter((type) => {
    const name = normalize(type.name)
    if (name !== '' && said.includes(name)) return true
    const strong = name.split(' ').filter((word) => word.length >= 4)
    return strong.length > 0 && strong.every((word) => stems.has(stem(word)))
  })
  return matches.length === 1 ? matches[0] : undefined
}

/** Plural e "-ção/-ções" contam como a mesma palavra ("boletos" = "boleto", "prorrogações" = "prorrogação"). */
function stem(word: string): string {
  return word.replace(/(coes|cao)$/u, 'c').replace(/s$/u, '')
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function tokensOf(text: string): string[] {
  return text
    .split(/[^0-9]+/u)
    .filter((token) => token !== '')
    .map((token) => token.replace(/^0+/u, ''))
}
