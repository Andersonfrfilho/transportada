/* Copyright (c) 2026 Ada Technology. MIT License. */
/** Dados sintéticos das conversas da demonstração do motorista (spec 263). Sem PII real. */
import type {
  PreviewChannel,
  PreviewConversation,
  PreviewMessage,
  PreviewSubjectType,
} from './driver-preview-conversations.types'

type SeedLine = Readonly<{
  direction: PreviewMessage['direction']
  isUnread?: boolean
  text: string
}>

type SeedConversation = Readonly<{
  channels?: readonly PreviewChannel[]
  iconName?: string
  id: string
  label: string
  lines: readonly SeedLine[]
  protocolSuffix: string
  subjectType?: PreviewSubjectType
}>

export const OFFICE_AUTHOR = 'Escritório TransportAdA'
export const DRIVER_AUTHOR = 'Motorista'
const MINUTE_MS = 60 * 1000

export const PREVIEW_OCCURRENCE_IDS = {
  absent: '00000000-0000-4000-8000-000000000262',
  damage: '00000000-0000-4000-8000-000000000261',
  history: '00000000-0000-4000-8000-000000000264',
  receipt: '00000000-0000-4000-8000-000000000267',
  refusal: '00000000-0000-4000-8000-000000000263',
  return: '00000000-0000-4000-8000-000000000268',
} as const

/** Os ids de nota e de viagem são os que `driver-preview-api.ts` serve em `/me/trips/current` (nota 1 e viagem 1). */
export const PREVIEW_DOCUMENT_ID = '00000000-0000-4000-8000-000000000201'
export const PREVIEW_TRIP_ID = '00000000-0000-4000-8000-000000000100'

function buildHistoryLines(): readonly SeedLine[] {
  return Array.from({ length: 35 }, (_, index): SeedLine => {
    const isOffice = index % 2 === 0
    return {
      direction: isOffice ? 'outbound' : 'inbound',
      text: isOffice
        ? `Escritório: atualização ${index + 1} sobre o reagendamento da entrega.`
        : `Motorista: confirmado, mensagem ${index + 1}.`,
    }
  })
}

const SEED_CONVERSATIONS: readonly SeedConversation[] = [
  {
    iconName: 'alert',
    id: PREVIEW_OCCURRENCE_IDS.damage,
    label: 'Avaria · Mercado Sol (parada 3)',
    protocolSuffix: 'K7M2',
    lines: [
      {
        direction: 'outbound',
        isUnread: true,
        text: 'Recebemos as fotos da avaria. Pode confirmar quantas caixas foram afetadas?',
      },
      {
        direction: 'outbound',
        isUnread: true,
        text: 'Precisamos também do número do lacre para abrir o sinistro.',
      },
    ],
  },
  {
    iconName: 'clock',
    id: PREVIEW_OCCURRENCE_IDS.absent,
    label: 'Cliente ausente · Loja 12 (parada 1)',
    protocolSuffix: 'R4T9',
    lines: [
      { direction: 'inbound', text: 'Cheguei e a loja está fechada, ninguém atende o telefone.' },
      { direction: 'outbound', text: 'Entendido. Vamos reagendar a entrega com o cliente.' },
    ],
  },
  {
    channels: ['app', 'whatsapp'],
    iconName: 'package',
    id: PREVIEW_OCCURRENCE_IDS.refusal,
    label: 'Recusa · Padaria Central (parada 2)',
    protocolSuffix: 'W3Q8',
    lines: [
      { direction: 'outbound', text: 'O cliente alega divergência no pedido. Pode detalhar?' },
      {
        direction: 'inbound',
        text: 'Ele disse que faltaram dois fardos, mas conferi a nota e está completa.',
      },
    ],
  },
  {
    id: PREVIEW_OCCURRENCE_IDS.history,
    label: 'Reentrega · Depósito Norte (parada 4)',
    lines: buildHistoryLines(),
    protocolSuffix: 'H6N5',
  },
  {
    iconName: 'camera',
    id: PREVIEW_OCCURRENCE_IDS.receipt,
    label: 'Canhoto ilegível · Atacado Leste (parada 5)',
    lines: [{ direction: 'outbound', text: 'A foto do canhoto saiu desfocada. Pode tirar outra?' }],
    protocolSuffix: 'Z2X7',
  },
  {
    iconName: 'money',
    id: PREVIEW_OCCURRENCE_IDS.return,
    label: 'Devolução parcial · Farmácia Vida (parada 6)',
    lines: [{ direction: 'inbound', text: 'Devolvi duas caixas, o cliente pagou o restante.' }],
    protocolSuffix: 'C9D4',
  },
  {
    id: PREVIEW_DOCUMENT_ID,
    label: 'NF 900101 · Mercearia do Centro',
    lines: [
      {
        direction: 'outbound',
        isUnread: true,
        text: 'A nota 900101 sai da Mercearia do Centro antes das 14h. Confirme o horário.',
      },
    ],
    protocolSuffix: 'F8G3',
    subjectType: 'document',
  },
  {
    id: PREVIEW_TRIP_ID,
    label: 'Viagem de 09/10',
    lines: [
      { direction: 'outbound', text: 'Bom dia! A rota de hoje foi ajustada, confira as paradas.' },
    ],
    protocolSuffix: 'P5V6',
    subjectType: 'trip',
  },
]

export function toProtocol(now: number, suffix: string): string {
  const date = new Date(now)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getFullYear() % 100)}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${suffix}`
}

function toMessage(
  input: Readonly<{ at: number; conversationId: string; index: number; line: SeedLine }>,
): PreviewMessage {
  const { line } = input
  return {
    attachments: [],
    authorName: line.direction === 'outbound' ? OFFICE_AUTHOR : DRIVER_AUTHOR,
    bodyText: line.text,
    createdAt: new Date(input.at).toISOString(),
    direction: line.direction,
    id: `seed-${input.conversationId.slice(-3)}-${input.index}`,
    isUnread: line.isUnread === true,
    status: line.direction === 'inbound' ? 'delivered' : 'sent',
  }
}

/** As mensagens recuam do mais recente: a última chegou há 5 min, cada anterior 3 min antes. */
export function buildSeedConversations(now: number): PreviewConversation[] {
  return SEED_CONVERSATIONS.map((seed) => ({
    channels: seed.channels ?? ['app'],
    ...(seed.iconName === undefined ? {} : { iconName: seed.iconName }),
    messages: seed.lines.map((line, index) =>
      toMessage({
        at: now - (seed.lines.length - index) * 3 * MINUTE_MS - 2 * MINUTE_MS,
        conversationId: seed.id,
        index,
        line,
      }),
    ),
    occurrenceId: seed.id,
    occurrenceLabel: seed.label,
    protocol: toProtocol(now, seed.protocolSuffix),
    subjectType: seed.subjectType ?? 'occurrence',
  }))
}
