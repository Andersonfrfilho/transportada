/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108): o modelo do e-mail de ocorrência à contratante vem do módulo de notificação
 * (`notification.templates`). A sintaxe é a do módulo, `{{camelCase}}`, com uma lista fechada de variáveis.
 */
import { NOTIFICATION_DEFAULT_LOCALE } from '../../notification/notification.constant.js'

/** O modelo é de e-mail em português do Brasil, o idioma único do produto. */
export const OCCURRENCE_CONTRACTOR_MAIL_LOCALE = NOTIFICATION_DEFAULT_LOCALE
export const OCCURRENCE_CONTRACTOR_MAIL_CHANNEL = 'email'

/** O teto de linhas de item num e-mail; o que passa dele vira "e mais N itens". */
export const OCCURRENCE_ITEM_LINES_LIMIT = 200

/** O corpo do e-mail à contratante é texto: marcação HTML no modelo é recusada. Mesmo padrão no worker (`body !~`). */
export const HTML_BODY_PATTERN = '</?[A-Za-z][A-Za-z0-9_:-]*[\\s>/]'

export type OccurrenceContractorMailVariable = {
  readonly description: string
  readonly name: string
}

export const OCCURRENCE_CONTRACTOR_MAIL_VARIABLES: readonly OccurrenceContractorMailVariable[] = [
  { description: 'Número da nota com série.', name: 'numeroNota' },
  { description: 'Número da nota sem série.', name: 'numeroNotaSemSerie' },
  { description: 'Razão social do destinatário da nota.', name: 'razaoSocial' },
  { description: 'Valor total da nota.', name: 'valorNota' },
  { description: 'Nome da contratante.', name: 'contratante' },
  { description: 'Nome do motorista da viagem.', name: 'motorista' },
  { description: 'A parada da nota (sequência e cliente).', name: 'parada' },
  { description: 'Data da ocorrência.', name: 'data' },
  { description: 'Observação registrada.', name: 'observacao' },
  { description: 'Nome do tipo de ocorrência.', name: 'tipoOcorrencia' },
  { description: 'Número do documento do cliente.', name: 'numeroReferencia' },
  { description: 'Soma das linhas dos itens.', name: 'somaItens' },
  { description: 'Valor pago declarado.', name: 'valorDeclarado' },
  { description: 'Os itens da ocorrência num texto só, separados por vírgula.', name: 'itens' },
  { description: 'Os códigos dos itens, separados por vírgula.', name: 'codigosItens' },
  { description: 'As quantidades dos itens, separadas por vírgula.', name: 'quantidadesItens' },
  {
    description: 'Uma linha por item: código – item – quantidade unidade – R$ valor.',
    name: 'linhasItens',
  },
]

export const OCCURRENCE_CONTRACTOR_MAIL_VARIABLE_NAMES: ReadonlySet<string> = new Set(
  OCCURRENCE_CONTRACTOR_MAIL_VARIABLES.map((variable) => variable.name),
)
