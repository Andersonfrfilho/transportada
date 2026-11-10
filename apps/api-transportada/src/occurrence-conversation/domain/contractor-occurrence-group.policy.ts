/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 318 (RF2, RF4): o aviso automático da ocorrência no grupo de WhatsApp da contratante.
 *
 * O texto vem do módulo de notificação (`notification.templates`, canal `whatsapp`, `pt-BR`): primeiro a versão
 * WhatsApp da chave que o tipo escolheu para o e-mail (D2: o texto continua do tipo), senão o modelo geral
 * `ocorrencia.contratante-grupo`. Nenhum dos dois cadastrado → `template_missing` (cai no e-mail de reserva).
 *
 * As variáveis são uma lista fechada e enxuta: tipo, nota, data, momento e o resumo (a observação). Valor, CPF/CNPJ e
 * dado do destinatário **nunca** entram, porque nem chegam aqui: quem lê o banco só monta estas chaves.
 */
import { interpolateTemplate } from '@adatechnology/notification-contracts'

/** O modelo geral do aviso no grupo, quando o tipo não tem a versão WhatsApp da própria chave. */
export const CONTRACTOR_OCCURRENCE_GROUP_TEMPLATE_KEY = 'ocorrencia.contratante-grupo'
export const CONTRACTOR_OCCURRENCE_GROUP_TEMPLATE_CHANNEL = 'whatsapp'

/**
 * A reserva e o resultado do aviso no grupo moram em `idempotency_records`, com a mesma chave do aviso por e-mail
 * (`occurrence-auto-mail:<id>`, RF3) e uma operação própria: a do e-mail continua livre para a reserva por e-mail.
 */
export const CONTRACTOR_OCCURRENCE_GROUP_SEND_OPERATION = 'occurrence-contractor-group.send'

export const CONTRACTOR_OCCURRENCE_GROUP_VARIABLES = [
  'data',
  'marcacao',
  'momento',
  'numeroNota',
  'numeroNotaSemSerie',
  'observacao',
  'tipoOcorrencia',
] as const

export type ContractorOccurrenceGroupVariable =
  (typeof CONTRACTOR_OCCURRENCE_GROUP_VARIABLES)[number]

export type ContractorOccurrenceGroupValues = Readonly<
  Record<Exclude<ContractorOccurrenceGroupVariable, 'marcacao'>, string>
>

/** O resumo é a observação, cortada: o grupo é aviso, não relatório. */
export const CONTRACTOR_OCCURRENCE_GROUP_SUMMARY_MAX_LENGTH = 300

/** A Meta recusa acima de 4096; o mesmo teto do bot no grupo. */
export const CONTRACTOR_OCCURRENCE_GROUP_MESSAGE_MAX_LENGTH = 4000

const MOMENT_LABELS: Readonly<Record<'delivery' | 'separation', string>> = {
  delivery: 'entrega',
  separation: 'separação',
}

export function contractorOccurrenceMomentLabel(stage: 'delivery' | 'separation'): string {
  return MOMENT_LABELS[stage]
}

export function summarizeOccurrenceNote(note: string): string {
  const compact = note.replace(/\s+/gu, ' ').trim()
  if (compact.length <= CONTRACTOR_OCCURRENCE_GROUP_SUMMARY_MAX_LENGTH) return compact
  return `${compact.slice(0, CONTRACTOR_OCCURRENCE_GROUP_SUMMARY_MAX_LENGTH - 1).trimEnd()}…`
}

/** Linha que sobrou só com emoji ou rótulo vazio (ex.: "📝 " quando a observação veio vazia). */
const EMOJI_ONLY_LINE = /^[ \t]*(?:[\p{Extended_Pictographic}️‍][ \t]*)+$/u
const BLANK_LINES = /\n{3,}/gu
const MENTION_PLACEHOLDER = /\{\{\s*marcacao\s*\}\}/u

/**
 * O corpo da mensagem: o modelo com as variáveis da lista e a marca `@<número>`. O WhatsApp só desenha a marca quando
 * o texto traz o `@número` (o `mentioned` sozinho não basta): modelo sem `{{marcacao}}` ganha a marca na primeira linha.
 */
export function buildContractorOccurrenceGroupMessage(input: {
  readonly mentionPhone: string
  readonly template: string
  readonly values: ContractorOccurrenceGroupValues
}): string {
  const mention = `@${input.mentionPhone}`
  const allowed: Record<string, string> = { marcacao: mention }
  for (const name of CONTRACTOR_OCCURRENCE_GROUP_VARIABLES) {
    if (name === 'marcacao') continue
    allowed[name] = input.values[name]
  }
  const withMention = MENTION_PLACEHOLDER.test(input.template)
    ? input.template
    : `{{marcacao}}\n${input.template}`
  const rendered = interpolateTemplate(withMention, allowed)
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .filter((line) => !EMOJI_ONLY_LINE.test(line))
    .join('\n')
    .replace(BLANK_LINES, '\n\n')
    .trim()
  if (rendered.length <= CONTRACTOR_OCCURRENCE_GROUP_MESSAGE_MAX_LENGTH) return rendered
  return `${rendered.slice(0, CONTRACTOR_OCCURRENCE_GROUP_MESSAGE_MAX_LENGTH - 1).trimEnd()}…`
}

/**
 * Falha do envio ao grupo, fechada. `disconnected`: Evolution desligado, fora do ar ou instância fora do `open`;
 * `group_not_found`: o Evolution recusa o grupo (bot fora dele, grupo apagado); `failed`: o resto (5xx, ritmo).
 * Só `failed` vale outra tentativa na hora: as outras não mudam em segundos.
 */
export type ContractorOccurrenceGroupFailure =
  | 'disconnected'
  | 'failed'
  | 'group_not_found'
  | 'template_missing'

export function isRetryableGroupFailure(failure: ContractorOccurrenceGroupFailure): boolean {
  return failure === 'failed'
}

/** Quantas vezes o envio é tentado na hora, antes da reserva por e-mail. A varredura do worker tenta de novo depois. */
export const CONTRACTOR_OCCURRENCE_GROUP_ATTEMPTS = 3
export const CONTRACTOR_OCCURRENCE_GROUP_RETRY_DELAYS_MS: readonly number[] = [2_000, 5_000]
