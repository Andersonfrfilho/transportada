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
    'Não encontrei nenhum arquivo .xml ou .zip na mensagem. Mande os XMLs das notas ou um zip com eles.',
  [NFE_XML_RECEIPT_REJECTION.senderNotAllowed]:
    'Este remetente não pode importar notas. Peça à administração para liberar o seu cadastro.',
  [NFE_XML_RECEIPT_REJECTION.senderNotAuthenticated]:
    'Não consegui confirmar a autenticidade do e-mail (DKIM). Envie de um endereço da sua empresa.',
  [NFE_XML_RECEIPT_REJECTION.tooLarge]:
    'O arquivo é grande demais. Divida em arquivos menores e envie de novo.',
}

const SKIP_TEXT: Readonly<Record<ReceivedFileSkipReason, string>> = {
  [RECEIVED_FILE_SKIP_REASON.empty]: 'vazio',
  [RECEIVED_FILE_SKIP_REASON.notXmlOrZip]: 'não é .xml nem .zip',
  [RECEIVED_FILE_SKIP_REASON.tooLarge]: 'grande demais',
}

export function describeRejection(reason: NfeXmlReceiptRejection): string {
  return REJECTION_TEXT[reason]
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** A primeira resposta, logo ao receber: a fila pode demorar e quem mandou precisa saber que chegou. */
export function buildAcknowledgement(input: {
  readonly accepted: number
  readonly skipped: readonly { readonly reason: ReceivedFileSkipReason }[]
}): string {
  const lines = [`Recebi ${plural(input.accepted, 'arquivo', 'arquivos')} e já estou importando.`]
  if (input.skipped.length > 0) {
    const reasons = [...new Set(input.skipped.map((entry) => SKIP_TEXT[entry.reason]))]
    lines.push(
      `Ignorei ${plural(input.skipped.length, 'arquivo', 'arquivos')} (${reasons.join(', ')}).`,
    )
  }
  lines.push('Aviso quando terminar.')
  return lines.join(' ')
}

/** O resumo final, depois que a importação termina. */
export function buildSummary(input: {
  readonly counts: ReceiptImportCounts
  readonly problems: readonly ReceiptItemProblem[]
}): string {
  const { counts } = input
  const lines = [`Importação concluída: ${plural(counts.received, 'arquivo', 'arquivos')}.`]
  lines.push(`• ${plural(counts.imported, 'nota importada', 'notas importadas')}`)
  if (counts.duplicated > 0) {
    lines.push(`• ${plural(counts.duplicated, 'já estava no sistema', 'já estavam no sistema')}`)
  }
  const notImported = counts.invalid + counts.rejected + counts.failed
  if (notImported > 0) {
    lines.push(`• ${plural(notImported, 'arquivo não importado', 'arquivos não importados')}`)
    for (const problem of input.problems.slice(0, MAX_PROBLEM_LINES)) {
      lines.push(
        `   - ${plural(problem.count, 'caso', 'casos')}: ${PROBLEM_TEXT[problem.code] ?? GENERIC_PROBLEM_TEXT}`,
      )
    }
  }
  return lines.join('\n')
}

/** Quando o recibo esgota as tentativas: a operação já foi avisada, quem mandou também. */
export function buildFailure(): string {
  return 'Não consegui importar este envio depois de várias tentativas. A equipe foi avisada e vai verificar.'
}
