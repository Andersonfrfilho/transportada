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

/** Corpo com marcação HTML → caminho HTML do e-mail (spec 272); sem marcação → o caminho de texto. */
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
  /** Spec 272 (ADR-0110 §5, D5/D16): a identidade da transportadora e do assinante, para o e-mail em HTML. */
  { description: 'Nome de exibição da transportadora.', name: 'nomeExibicao' },
  { description: 'CNPJ da transportadora, com pontuação.', name: 'cnpjTransportadora' },
  { description: 'CPF ou CNPJ da contratante; vazio sem documento.', name: 'cnpjContratante' },
  { description: 'Nome de quem assina o e-mail, ou a equipe.', name: 'assinaturaNome' },
  { description: 'Cargo de quem assina; vazio sem cargo nem papel.', name: 'assinaturaCargo' },
  {
    description: 'Logo da transportadora, ou as iniciais sem logo (HTML do sistema).',
    name: 'logoTransportadora',
  },
  {
    description: 'Tabela de itens com o total, até 200 linhas (HTML do sistema).',
    name: 'tabelaItens',
  },
  { description: 'Cidade e UF da transportadora.', name: 'cidadeTransportadora' },
  { description: 'Razão social da transportadora.', name: 'razaoSocialTransportadora' },
  { description: 'Iniciais de quem assina, ou do nome de exibição.', name: 'assinaturaIniciais' },
  {
    description: 'Faixa "Responda este e-mail", só quando a resposta chega (HTML do sistema).',
    name: 'faixaResposta',
  },
  {
    description: 'Marcas do rodapé: TransportAdA e Ada Technology (HTML do sistema).',
    name: 'marcasRodape',
  },
]

export const OCCURRENCE_CONTRACTOR_MAIL_VARIABLE_NAMES: ReadonlySet<string> = new Set(
  OCCURRENCE_CONTRACTOR_MAIL_VARIABLES.map((variable) => variable.name),
)

/**
 * Spec 272 (ADR-0110 §3): as únicas chaves cujo valor entra **sem escape**, decidido pelo nome e nunca pelo
 * conteúdo. O valor vem de um objeto que só a API monta.
 */
export const OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES = [
  'logoTransportadora',
  'tabelaItens',
  'marcasRodape',
  'faixaResposta',
] as const

export type OccurrenceMailSystemHtmlVariable =
  (typeof OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES)[number]

/** O par que marca, no modelo HTML, a área do corpo editável pelo operador (ADR-0110 §12). */
export const OCCURRENCE_MAIL_MESSAGE_AREA = {
  close: '<!-- /mensagem -->',
  open: '<!-- mensagem -->',
} as const

/** O CHECK `body_html_size_check` de `contractor_mail_messages`: bytes UTF-8 do HTML renderizado. */
export const OCCURRENCE_MAIL_HTML_MAX_BYTES = 524288
