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
 * - Spec 293 T15: tipo que pede foto, número do documento do cliente ou valor pago **não é recusado**:
 *   o registro abre a ocorrência em coleta, o bot pede o que falta e o pedido fica no passo `collect`
 *   até a coleta terminar. Assinatura e produtos continuam só no app e voltam com a frase do campo.
 * - Nada de nome de cliente nem valor no texto do grupo: só o número da nota.
 */
import type {
  GroupFlowOutcome,
  GroupFlowTurn,
  GroupRequestFlow,
} from './whatsapp-group-request.port.js'

export const GROUP_OCCURRENCE_STEP = {
  collect: 'collect',
  confirm: 'confirm',
  contact: 'contact',
  document: 'document',
  note: 'note',
  start: 'start',
  type: 'type',
} as const

/** Notas listadas por número de opção; acima disso o bot pede o número da nota. */
export const GROUP_DOCUMENT_LIST_LIMIT = 8
export const GROUP_OCCURRENCE_NOTE_MAX_LENGTH = 500

export type GroupDriverDocument = { readonly id: string; readonly number: string }
/** Canal do contato do cliente que o tipo pede (spec 281 T8b): e-mail e/ou WhatsApp. */
export type GroupClientContactChannel = 'email' | 'whatsapp'

export type GroupOccurrenceType = {
  /** Os canais de contato do cliente que o tipo pede na abertura; ausente ou vazio é não pedir. */
  readonly contactChannels?: readonly GroupClientContactChannel[] | undefined
  readonly id: string
  readonly name: string
}

/** Contato já cadastrado do cliente da nota, só em forma mascarada (nada em claro no grupo). */
export type GroupClientContact = {
  readonly addressMasked: string
  readonly channel: GroupClientContactChannel
}

export type GroupClientContactAddResult =
  | { readonly kind: 'added'; readonly contact: GroupClientContact }
  /** `reason` já em frase para o grupo (número inválido, limite de contatos, cliente sem cadastro). */
  | { readonly kind: 'refused'; readonly reason: string }

export type GroupOccurrenceRegistration =
  | { readonly kind: 'registered' }
  /** A recusa já em frase para o grupo; `retry` diz para onde voltar (observação ou tipo). */
  | { readonly kind: 'refused'; readonly message: string; readonly retry: 'note' | 'type' | null }
  /** Spec 293 T15: a coleta abriu; `awaitingText` diz se a próxima resposta é em texto. */
  | {
      readonly awaitingText: boolean
      readonly kind: 'collecting'
      readonly replies: readonly string[]
    }

/** A resposta em texto à coleta em aberto; `null` quando o texto não é para ela. */
export type GroupCollectionAnswer = {
  readonly awaitingText: boolean
  readonly replies: readonly string[]
}

export type GroupOccurrenceFlowPorts = {
  /** Spec 292 T6: guarda o contato digitado no cliente da nota (validado e normalizado pela API). */
  addClientContact?(input: {
    readonly address: string
    readonly channel: GroupClientContactChannel
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
  }): Promise<GroupClientContactAddResult>
  /** Spec 292 T6: os contatos que o cliente da nota já tem (mascarados); vazia é sem contato. */
  listClientContacts?(input: {
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
  }): Promise<readonly GroupClientContact[]>
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
  /** Spec 293 T15: a resposta à ocorrência em coleta (número, valor, "pular", "cancelar"). */
  answerCollection(input: {
    readonly companyId: string
    readonly driverId: string
    readonly text: string
  }): Promise<GroupCollectionAnswer | null>
  register(input: {
    readonly companyId: string
    readonly documentId: string
    readonly documentNumber: string
    readonly driverId: string
    /** Por pedido: a confirmação repetida não registra duas vezes. */
    readonly idempotencyKey: string
    readonly note: string
    readonly occurrenceTypeId: string
  }): Promise<GroupOccurrenceRegistration>
}

export const GROUP_OCCURRENCE_TEXT = {
  askContact: (channels: readonly GroupClientContactChannel[]) =>
    [
      `📇 Para já enviarmos o boleto ao cliente, me passe ${describeChannels(channels)} dele.`,
      '',
      'Sem o contato agora? Responda _continuar_ e o boleto volta aqui pelo grupo.',
    ].join('\n'),
  askContactKnown: (contacts: readonly GroupClientContact[]) =>
    [
      '📇 O cliente já tem contato cadastrado:',
      ...contacts.map((contact) => `• *${contact.addressMasked}*`),
      '',
      '*1* - Usar este contato',
      'Ou digite outro (telefone com DDD ou e-mail)',
      'Ou responda _continuar_ para seguir sem contato',
    ].join('\n'),
  askDocument: (documents: readonly GroupDriverDocument[]) =>
    documents.length > GROUP_DOCUMENT_LIST_LIMIT
      ? '📄 Em qual nota? Responda com o *número da nota*.'
      : [
          '📄 Em qual nota? Responda com o número da opção ou da nota:',
          '',
          ...documents.map((document, index) => `*${index + 1}* - NF ${document.number}`),
        ].join('\n'),
  askNote: [
    '📝 Quer acrescentar alguma observação?',
    'Escreva agora ou responda _pular_ para seguir sem.',
    '',
    '📍 Se quiser, compartilhe também a sua localização antes de confirmar (é opcional).',
  ].join('\n'),
  askType: (types: readonly GroupOccurrenceType[]) =>
    [
      '⚠️ Qual ocorrência você quer registrar? Responda com o número ou o nome:',
      '',
      ...types.map((type, index) => `*${index + 1}* - ${type.name}`),
    ].join('\n'),
  confirm: (typeName: string, documentNumber: string, note: string, contact = '') =>
    [
      `📋 Vou registrar *${typeName}* na *NF ${documentNumber}*.`,
      ...(note === '' ? [] : [`📝 Observação: _${note}_`]),
      ...(contact === '' ? [] : [`📇 Contato do cliente: *${contact}*`]),
      '',
      'Posso confirmar?',
      '*1* - Sim ✅',
      '*2* - Não ❌',
    ].join('\n'),
  contactSaved: (masked: string) => `✅ Anotei o contato do cliente: *${masked}*.`,
  declined: '👍 Tudo certo, não registrei nada.',
  noDocuments: '🔎 Não encontrei notas na viagem em andamento do motorista deste grupo.',
  noTypes: '🚫 Não há tipo de ocorrência ativo para esta nota.',
  registered: (typeName: string, documentNumber: string, sentToClient = false) =>
    [
      '✅ *Ocorrência registrada!*',
      `📄 NF ${documentNumber}`,
      `⚠️ ${typeName}`,
      '',
      sentToClient
        ? '📨 Assim que a contratante responder, o boleto segue para o contato do cliente e eu aviso aqui.'
        : '📨 Assim que a contratante responder com o boleto, eu envio por aqui.',
      '',
      'Precisando de mais alguma coisa, é só me marcar. 🙂',
    ].join('\n'),
} as const

function describeChannels(channels: readonly GroupClientContactChannel[]): string {
  if (channels.length === 2) return 'o telefone (WhatsApp) ou o e-mail'
  return channels[0] === 'whatsapp' ? 'o telefone (WhatsApp com DDD)' : 'o e-mail'
}

const REASON = {
  contact: 'não entendi o contato: digite um telefone com DDD, um e-mail ou "continuar"',
  collect: 'mande o que foi pedido, ou responda "pular" se o item não for obrigatório',
  confirm: 'responda 1 para sim ou 2 para não',
  document: 'não achei essa nota na viagem do motorista',
  noteIsAnOption:
    'isso parece a resposta de uma pergunta anterior; se for mesmo a observação, escreva com mais detalhe',
  noteTooLong: `a observação passa de ${GROUP_OCCURRENCE_NOTE_MAX_LENGTH} caracteres`,
  type: 'não achei esse tipo de ocorrência na lista',
} as const

const YES = new Set(['1', 'sim', 's', 'confirmo', 'confirma', 'ok', 'pode'])
const NO = new Set(['2', 'nao', 'n'])
const SKIP = new Set(['pular', 'pula', 'sem', 'nao', 'continuar', 'seguir', '-'])
const SKIP_CONTACT = new Set([
  'continuar',
  'pular',
  'pula',
  'sem',
  'sem contato',
  'nao',
  'seguir',
  '-',
])
const EMAIL_PATTERN = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/u

/** Vai ao `state` (jsonb) do pedido; `undefined` some na gravação. */
type FlowState = {
  readonly documentId?: string | undefined
  readonly documentNumber?: string | undefined
  readonly contactChannels?: readonly GroupClientContactChannel[] | undefined
  /** O contato escolhido, já mascarado (só para repetir na confirmação). */
  readonly contactMasked?: string | undefined
  readonly documents?: readonly GroupDriverDocument[] | undefined
  /** Contatos já cadastrados oferecidos no passo `contact`. */
  readonly knownContacts?: readonly GroupClientContact[] | undefined
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
    if (type !== undefined) return afterType(turn, next, type)
    if (types.length === 1 && types[0] !== undefined) return afterType(turn, next, types[0])
    return continueWith(GROUP_OCCURRENCE_STEP.type, next, [GROUP_OCCURRENCE_TEXT.askType(types)])
  }

  async function afterType(
    turn: GroupFlowTurn,
    state: FlowState,
    type: GroupOccurrenceType,
  ): Promise<GroupFlowOutcome> {
    const base: FlowState = {
      ...state,
      contactChannels: undefined,
      contactMasked: undefined,
      knownContacts: undefined,
      typeId: type.id,
      typeName: type.name,
      types: undefined,
    }
    const channels = type.contactChannels ?? []
    if (
      channels.length === 0 ||
      ports.addClientContact === undefined ||
      ports.listClientContacts === undefined ||
      state.documentId === undefined
    ) {
      return continueWith(GROUP_OCCURRENCE_STEP.note, base, [GROUP_OCCURRENCE_TEXT.askNote])
    }
    const known = (
      await ports.listClientContacts({
        companyId: turn.request.companyId,
        documentId: state.documentId,
        driverId: turn.request.driverId,
      })
    ).filter((contact) => channels.includes(contact.channel))
    if (known.length > 0) {
      return continueWith(
        GROUP_OCCURRENCE_STEP.contact,
        { ...base, contactChannels: channels, knownContacts: known },
        [GROUP_OCCURRENCE_TEXT.askContactKnown(known)],
      )
    }
    return continueWith(GROUP_OCCURRENCE_STEP.contact, { ...base, contactChannels: channels }, [
      GROUP_OCCURRENCE_TEXT.askContact(channels),
    ])
  }

  async function answerContact(turn: GroupFlowTurn, state: FlowState): Promise<GroupFlowOutcome> {
    const channels = state.contactChannels ?? []
    const known = state.knownContacts ?? []
    const text = turn.text.trim()
    const toNote = (next: FlowState, replies: readonly string[]) =>
      continueWith(GROUP_OCCURRENCE_STEP.note, { ...next, knownContacts: undefined }, [
        ...replies,
        GROUP_OCCURRENCE_TEXT.askNote,
      ])
    if (SKIP_CONTACT.has(normalize(text))) return toNote(state, [])
    if (known.length > 0 && normalize(text) === '1') {
      return toNote({ ...state, contactMasked: known.map((c) => c.addressMasked).join(', ') }, [])
    }
    const channel: GroupClientContactChannel | null = EMAIL_PATTERN.test(text)
      ? 'email'
      : text.replace(/\D/gu, '').length >= 10 && !/[a-z@]/iu.test(text)
        ? 'whatsapp'
        : null
    if (channel === null || !channels.includes(channel) || ports.addClientContact === undefined) {
      return {
        kind: 'not_understood',
        prompt:
          known.length > 0
            ? GROUP_OCCURRENCE_TEXT.askContactKnown(known)
            : GROUP_OCCURRENCE_TEXT.askContact(channels),
        reason: REASON.contact,
      }
    }
    const added = await ports.addClientContact({
      address: text,
      channel,
      companyId: turn.request.companyId,
      documentId: state.documentId ?? '',
      driverId: turn.request.driverId,
    })
    if (added.kind === 'refused') {
      return {
        kind: 'not_understood',
        prompt:
          known.length > 0
            ? GROUP_OCCURRENCE_TEXT.askContactKnown(known)
            : GROUP_OCCURRENCE_TEXT.askContact(channels),
        reason: added.reason,
      }
    }
    return toNote({ ...state, contactMasked: added.contact.addressMasked }, [
      GROUP_OCCURRENCE_TEXT.contactSaved(added.contact.addressMasked),
    ])
  }

  async function register(turn: GroupFlowTurn, state: FlowState): Promise<GroupFlowOutcome> {
    const { documentId, documentNumber = '', note = '', typeId, typeName = '' } = state
    if (documentId === undefined || typeId === undefined) {
      return { kind: 'done', replies: [GROUP_OCCURRENCE_TEXT.declined] }
    }
    const result = await ports.register({
      companyId: turn.request.companyId,
      documentId,
      documentNumber,
      driverId: turn.request.driverId,
      idempotencyKey: `whatsapp-group-request:${turn.request.id}`,
      note,
      occurrenceTypeId: typeId,
    })
    if (result.kind === 'registered') {
      return {
        kind: 'done',
        replies: [
          GROUP_OCCURRENCE_TEXT.registered(
            typeName,
            documentNumber,
            state.contactMasked !== undefined,
          ),
        ],
      }
    }
    if (result.kind === 'collecting') return collecting(result)
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

  async function answerStep(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
    {
      const state = turn.request.state as FlowState
      const text = turn.text

      switch (turn.request.step) {
        case GROUP_OCCURRENCE_STEP.collect: {
          const answered = await ports.answerCollection({
            companyId: turn.request.companyId,
            driverId: turn.request.driverId,
            text,
          })
          if (answered === null)
            return { kind: 'not_understood', prompt: '', reason: REASON.collect }
          return collecting(answered)
        }
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
          return afterType(turn, state, type)
        }
        case GROUP_OCCURRENCE_STEP.contact:
          return answerContact(turn, state)
        case GROUP_OCCURRENCE_STEP.note: {
          if (text.length > GROUP_OCCURRENCE_NOTE_MAX_LENGTH) {
            return {
              kind: 'not_understood',
              prompt: GROUP_OCCURRENCE_TEXT.askNote,
              reason: REASON.noteTooLong,
            }
          }
          if (/^\d{1,2}$/u.test(text.trim())) {
            return {
              kind: 'not_understood',
              prompt: GROUP_OCCURRENCE_TEXT.askNote,
              reason: REASON.noteIsAnOption,
            }
          }
          const note = SKIP.has(normalize(text)) ? '' : text
          return continueWith(GROUP_OCCURRENCE_STEP.confirm, { ...state, note }, [
            GROUP_OCCURRENCE_TEXT.confirm(
              state.typeName ?? '',
              state.documentNumber ?? '',
              note,
              state.contactMasked ?? '',
            ),
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
              state.contactMasked ?? '',
            ),
            reason: REASON.confirm,
          }
        }
        default:
          return { kind: 'done', replies: [GROUP_OCCURRENCE_TEXT.declined] }
      }
    }
  }

  return {
    async answer(turn) {
      const outcome = await answerStep(turn)
      // Quando outra pessoa responde pelo dono (marcando o bot), o grupo vê quem respondeu e o quê.
      if (
        outcome.kind === 'continue' &&
        turn.sender !== turn.request.ownerNumber &&
        turn.text.length <= 40
      ) {
        const who = turn.senderName === null || turn.senderName === '' ? 'Alguém' : turn.senderName
        return {
          ...outcome,
          replies: [`👤 *${who}* respondeu: _${turn.text}_`, ...outcome.replies],
        }
      }
      return outcome
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

/** A coleta que espera texto segura o pedido; a que espera foto (ou terminou) fecha, e a foto chega sozinha. */
function collecting(answer: GroupCollectionAnswer): GroupFlowOutcome {
  return answer.awaitingText
    ? { kind: 'continue', replies: answer.replies, state: {}, step: GROUP_OCCURRENCE_STEP.collect }
    : { kind: 'done', replies: answer.replies }
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
