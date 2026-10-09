/* Copyright (c) 2026 Ada Technology. MIT License. */
/** Dados sintéticos das conversas da demonstração do motorista (spec 260). Sem PII real. */

export type PreviewAttachment = {
  readonly contentType: string
  readonly fileName: string
  readonly id: string
  readonly sizeBytes: number
}

export type PreviewMessage = {
  readonly attachments: readonly PreviewAttachment[]
  readonly authorName: string
  readonly bodyText: string
  readonly createdAt: string
  readonly direction: 'inbound' | 'outbound'
  readonly id: string
  /** Só mensagem do escritório fica não lida; a do motorista nasce lida. */
  isUnread: boolean
  readonly status: 'sent'
}

export type PreviewConversation = {
  readonly messages: PreviewMessage[]
  readonly occurrenceId: string
  readonly occurrenceLabel: string
}

type SeedLine = Readonly<{
  direction: PreviewMessage['direction']
  isUnread?: boolean
  text: string
}>

type SeedConversation = Readonly<{
  id: string
  label: string
  lines: readonly SeedLine[]
}>

export const OFFICE_AUTHOR = 'Escritório TransportAdA'
export const DRIVER_AUTHOR = 'Motorista'
const MINUTE_MS = 60 * 1000

export const PREVIEW_OCCURRENCE_IDS = {
  absent: '00000000-0000-4000-8000-000000000262',
  damage: '00000000-0000-4000-8000-000000000261',
  history: '00000000-0000-4000-8000-000000000264',
  refusal: '00000000-0000-4000-8000-000000000263',
} as const

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
    id: PREVIEW_OCCURRENCE_IDS.damage,
    label: 'Avaria · Mercado Sol (parada 3)',
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
    id: PREVIEW_OCCURRENCE_IDS.absent,
    label: 'Cliente ausente · Loja 12 (parada 1)',
    lines: [
      { direction: 'inbound', text: 'Cheguei e a loja está fechada, ninguém atende o telefone.' },
      { direction: 'outbound', text: 'Entendido. Vamos reagendar a entrega com o cliente.' },
    ],
  },
  {
    id: PREVIEW_OCCURRENCE_IDS.refusal,
    label: 'Recusa · Padaria Central (parada 2)',
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
  },
]

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
    status: 'sent',
  }
}

/** As mensagens recuam do mais recente: a última chegou há 5 min, cada anterior 3 min antes. */
export function buildSeedConversations(now: number): PreviewConversation[] {
  return SEED_CONVERSATIONS.map((seed) => ({
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
  }))
}
