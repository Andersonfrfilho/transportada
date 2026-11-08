/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: o que o bot e o e-mail dizem a quem mandou o XML. Sempre em português, sempre com o motivo; nunca o nome
 * do arquivo nem o conteúdo da nota (o texto pode ficar em log e em histórico de conversa).
 */
import {
  NFE_XML_RECEIPT_REJECTION,
  type NfeXmlReceiptRejection,
} from './nfe-xml-receipt.constant.js'
import {
  RECEIVED_FILE_SKIP_REASON,
  type ReceivedFileSkipReason,
} from './received-xml-files.policy.js'

export type ReceiptImportCounts = {
  readonly duplicated: number
  readonly failed: number
  readonly imported: number
  readonly invalid: number
  readonly received: number
  readonly rejected: number
}

export type ReceiptItemProblem = { readonly code: string; readonly count: number }

/** Spec 304: o que o e-mail detalhado leva além das contagens. */
export type ReceiptEmailReport = {
  readonly contractors: readonly { readonly count: number; readonly name: string }[]
  readonly files: readonly {
    readonly code: null | string
    readonly count: number
    readonly name: string
  }[]
  readonly finishedAt: Date | null
  readonly receivedAt: Date
}

const PROBLEM_TEXT: Readonly<Record<string, string>> = {
  ZIP_ENTRY_TOO_LARGE: 'um arquivo dentro do zip é grande demais',
  ZIP_EXPANSION_LIMIT: 'o zip descompactado passa do limite (mande em mais de um zip)',
  ZIP_EMPTY_ENTRY: 'o zip tem arquivo vazio',
  ZIP_INVALID_ARCHIVE: 'o zip está corrompido ou protegido por senha',
  ZIP_NO_XML_ENTRIES: 'o zip não tem nenhum XML',
  ZIP_PATH_TRAVERSAL: 'o zip tem caminho de arquivo inválido',
}
const GENERIC_PROBLEM_TEXT = 'o arquivo não é uma NF-e válida'
const MAX_PROBLEM_LINES = 5

const REJECTION_TEXT: Readonly<Record<NfeXmlReceiptRejection, string>> = {
  [NFE_XML_RECEIPT_REJECTION.mailboxNotConfigured]: 'A caixa de notas não está configurada.',
  [NFE_XML_RECEIPT_REJECTION.noAcceptedFile]:
    'Não encontrei nenhum arquivo .xml, .zip ou .rar na mensagem. Mande os XMLs das notas ou um zip (ou rar) com eles.',
  [NFE_XML_RECEIPT_REJECTION.senderNotAllowed]:
    'Este remetente não pode importar notas. Peça à administração para liberar o seu cadastro.',
  [NFE_XML_RECEIPT_REJECTION.senderNotAuthenticated]:
    'Não consegui confirmar a autenticidade do e-mail (DKIM). Envie de um endereço da sua empresa.',
  [NFE_XML_RECEIPT_REJECTION.tooLarge]:
    'O arquivo é grande demais. Divida em arquivos menores e envie de novo.',
}

const SKIP_TEXT: Readonly<Record<ReceivedFileSkipReason, string>> = {
  [RECEIVED_FILE_SKIP_REASON.empty]: 'vazio',
  [RECEIVED_FILE_SKIP_REASON.notXmlOrZip]: 'não é .xml, .zip nem .rar',
  [RECEIVED_FILE_SKIP_REASON.tooLarge]: 'grande demais',
}

export function describeRejection(reason: NfeXmlReceiptRejection): string {
  return REJECTION_TEXT[reason]
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * A primeira resposta, logo ao receber: a fila pode demorar e quem mandou precisa saber que chegou. No padrão do bot
 * (spec 300 RF1): ícone + título em negrito, corpo, próximo passo na última linha.
 */
export function buildAcknowledgement(input: {
  readonly accepted: number
  readonly skipped: readonly { readonly reason: ReceivedFileSkipReason }[]
}): string {
  const lines = [
    '📥 *Recebi seu envio.*',
    `Recebi ${plural(input.accepted, 'arquivo', 'arquivos')} e já estou separando as notas.`,
  ]
  if (input.skipped.length > 0) {
    const reasons = [...new Set(input.skipped.map((entry) => SKIP_TEXT[entry.reason]))]
    lines.push(
      `Ignorei ${plural(input.skipped.length, 'arquivo', 'arquivos')} (${reasons.join(', ')}).`,
    )
  }
  lines.push('', '➡️ _Próximo passo:_ já te dou um retorno com o resultado.')
  return lines.join('\n')
}

/** O resumo final, depois que a importação termina — no mesmo padrão do bot. */
export function buildSummary(input: {
  readonly counts: ReceiptImportCounts
  readonly problems: readonly ReceiptItemProblem[]
}): string {
  const { counts } = input
  const notImported = counts.invalid + counts.rejected + counts.failed
  const lines = [
    notImported === 0 ? '✅ *Importação concluída.*' : '⚠️ *Importação concluída com problemas.*',
    `Recebi ${plural(counts.received, 'arquivo', 'arquivos')}.`,
    `• ${plural(counts.imported, 'nota nova', 'notas novas')}`,
  ]
  if (counts.duplicated > 0) {
    lines.push(`• ${plural(counts.duplicated, 'já estava no sistema', 'já estavam no sistema')}`)
  }
  if (notImported > 0) {
    lines.push(`• ${plural(notImported, 'arquivo não importado', 'arquivos não importados')}`)
    for (const problem of input.problems.slice(0, MAX_PROBLEM_LINES)) {
      lines.push(
        `   - ${plural(problem.count, 'caso', 'casos')}: ${PROBLEM_TEXT[problem.code] ?? GENERIC_PROBLEM_TEXT}`,
      )
    }
  }
  lines.push(
    '',
    notImported === 0
      ? '➡️ _Próximo passo:_ as notas novas já estão na página de NF-e.'
      : '➡️ _Próximo passo:_ corrija os arquivos com problema e envie de novo.',
  )
  return lines.join('\n')
}

/** Quando o recibo esgota as tentativas: a operação já foi avisada, quem mandou também. */
export function buildFailure(): string {
  return 'Não consegui importar este envio depois de várias tentativas. A equipe foi avisada e vai verificar.'
}

const MAX_FILE_LINES = 20
const MAX_CONTRACTOR_LINES = 15

function formatMoment(moment: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: '2-digit',
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
    })
      .formatToParts(moment)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
}

/**
 * Spec 304: o e-mail do resultado, com o que o escritório precisa para conferir sem abrir o painel — quando chegou e
 * quando entrou, as contagens, cada arquivo com o seu motivo e as contratantes das notas novas. O texto vai ao modelo
 * padrão de e-mail (visual editável em Notificações); aqui só entra o conteúdo. O nome do arquivo é de quem o mandou,
 * e só viaja neste e-mail para ele mesmo, nunca para log.
 */
export function buildEmailReport(input: {
  readonly counts: ReceiptImportCounts
  readonly report: ReceiptEmailReport
}): { readonly body: string; readonly subject: string } {
  const { counts, report } = input
  const notImported = counts.invalid + counts.rejected + counts.failed
  const lines = [
    notImported === 0
      ? 'A importação terminou sem problemas.'
      : 'A importação terminou, mas parte dos arquivos não entrou.',
    '',
    'Resumo',
    `• Recebido em: ${formatMoment(report.receivedAt)}`,
    `• Entrou no sistema em: ${report.finishedAt === null ? 'ainda processando' : formatMoment(report.finishedAt)}`,
    `• ${plural(counts.received, 'arquivo recebido', 'arquivos recebidos')}`,
    `• ${plural(counts.imported, 'nota nova', 'notas novas')}`,
  ]
  if (counts.duplicated > 0) {
    lines.push(`• ${plural(counts.duplicated, 'já estava no sistema', 'já estavam no sistema')}`)
  }
  if (notImported > 0) {
    lines.push(`• ${plural(notImported, 'arquivo não importado', 'arquivos não importados')}`)
  }
  if (report.files.length > 0) {
    lines.push('', 'Arquivos')
    for (const file of report.files.slice(0, MAX_FILE_LINES)) {
      const outcome =
        file.code === null
          ? `${plural(file.count, 'item processado', 'itens processados')}`
          : `${plural(file.count, 'caso', 'casos')} não importado: ${PROBLEM_TEXT[file.code] ?? GENERIC_PROBLEM_TEXT}`
      lines.push(`• ${file.name} — ${outcome}`)
    }
    if (report.files.length > MAX_FILE_LINES) {
      lines.push('• e outros arquivos')
    }
  }
  lines.push('', 'Contratantes das notas novas')
  if (report.contractors.length === 0) {
    lines.push('• nenhuma nota nova nesta importação')
  } else {
    for (const contractor of report.contractors.slice(0, MAX_CONTRACTOR_LINES)) {
      lines.push(`• ${contractor.name} — ${plural(contractor.count, 'nota', 'notas')}`)
    }
    if (report.contractors.length > MAX_CONTRACTOR_LINES) {
      lines.push(`• e mais ${report.contractors.length - MAX_CONTRACTOR_LINES} contratantes`)
    }
  }
  const subject =
    notImported === 0
      ? `Importação de notas: ${plural(counts.imported, 'nota nova', 'notas novas')}`
      : `Importação de notas: ${counts.imported} novas e ${plural(notImported, 'arquivo com problema', 'arquivos com problema')}`
  return { body: lines.join('\n'), subject }
}
