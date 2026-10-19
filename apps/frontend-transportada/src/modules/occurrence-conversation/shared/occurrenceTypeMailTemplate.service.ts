/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 271 (ADR-0108): o modelo do e-mail à contratante é do módulo de notificação (`{{campo}}`). O editor do tipo mostra
 * as variáveis da lista fechada e a prévia com valores de exemplo — cópia por valor da API
 * (`occurrence-contractor-mail.constant.ts`), presa por `occurrence-type-mail-parity.contract.ts`.
 */

/** Os nomes na ordem da API; a descrição de cada um vem do idioma (`occurrenceTypeMail.variables.<nome>`). */
export const OCCURRENCE_MAIL_VARIABLE_NAMES = [
  'numeroNota',
  'numeroNotaSemSerie',
  'razaoSocial',
  'valorNota',
  'contratante',
  'motorista',
  'parada',
  'data',
  'observacao',
  'tipoOcorrencia',
  'numeroReferencia',
  'somaItens',
  'valorDeclarado',
  'itens',
  'codigosItens',
  'quantidadesItens',
  'linhasItens',
  /** Spec 272 (ADR-0110 §5): identidade da transportadora e do assinante; as quatro de HTML do sistema são do e-mail em HTML. */
  'nomeExibicao',
  'cnpjTransportadora',
  'cnpjContratante',
  'assinaturaNome',
  'assinaturaCargo',
  'logoTransportadora',
  'tabelaItens',
  'cidadeTransportadora',
  'razaoSocialTransportadora',
  'assinaturaIniciais',
  'faixaResposta',
  'marcasRodape',
] as const

export type OccurrenceMailVariableName = (typeof OCCURRENCE_MAIL_VARIABLE_NAMES)[number]

/** O que a prévia mostra no lugar de cada variável — dados de exemplo, nunca da operação. */
export const OCCURRENCE_MAIL_SAMPLE_VALUES: Readonly<Record<OccurrenceMailVariableName, string>> = {
  codigosItens: '7000001 01, 7000002 02',
  assinaturaCargo: 'Analista de Operações',
  assinaturaIniciais: 'ME',
  assinaturaNome: 'Maria Exemplo',
  cidadeTransportadora: 'Ribeirão Preto · SP',
  cnpjContratante: '98.765.432/0001-10',
  cnpjTransportadora: '12.345.678/0001-95',
  contratante: 'Contratante Exemplo',
  data: '01/01/2026',
  /** Os quatro de HTML do sistema têm exemplo fixo em texto, sem marcação: a prévia nunca monta HTML do sistema. */
  faixaResposta:
    '↩ Responda este e-mail: a resposta entra na conversa desta ocorrência e chega à equipe.',
  itens: 'PRODUTO EXEMPLO A 500G, PRODUTO EXEMPLO B 1KG',
  linhasItens:
    '7000001 01 – PRODUTO EXEMPLO A 500G – 1 FD – R$ 57,20\n7000002 02 – PRODUTO EXEMPLO B 1KG – 3 CX – R$ 60,00',
  logoTransportadora: 'TE',
  marcasRodape: 'Enviado pelo TransportAdA — uma solução Ada Technology',
  motorista: 'Motorista Exemplo',
  nomeExibicao: 'Transportadora Exemplo',
  numeroNota: '123456/1',
  numeroNotaSemSerie: '123456',
  numeroReferencia: '45029',
  observacao: 'Avaria identificada no momento da conferência das mercadorias',
  parada: 'Rua Exemplo, 100',
  quantidadesItens: '1, 3',
  razaoSocial: 'Supermercado Exemplo Ltda',
  razaoSocialTransportadora: 'Transportadora Exemplo Ltda',
  somaItens: '117,20',
  tabelaItens: '7000001 01 – PRODUTO EXEMPLO A 500G – 1 FD – R$ 57,20',
  tipoOcorrencia: 'Avaria',
  valorDeclarado: '117,20',
  valorNota: '7.840,64',
}

/** O modelo sugerido, para copiar no módulo de notificação (nunca semeado). */
export const OCCURRENCE_MAIL_SUGGESTED_TEMPLATE = {
  body: 'Olá, equipe {{contratante}},\n\nRegistramos {{tipoOcorrencia}} na nota {{numeroNota}} ({{razaoSocial}}) em {{data}}.\n\n{{observacao}}\n\n{{linhasItens}}\n\nQualquer dúvida, é só responder este e-mail.',
  subject: 'Ocorrência na nota {{numeroNota}} — {{contratante}}',
} as const

/** O mesmo `{{ nome }}` do renderizador do módulo; a variável que falta sai vazia. */
const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu

export function interpolateMailTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, name: string) =>
    Object.hasOwn(values, name) ? (values[name] ?? '') : '',
  )
}

/** A mesma condição de "corpo HTML" da API (`HTML_BODY_REGEX`): decide entre a prévia em iframe e em texto. */
const HTML_BODY_PATTERN = /<\/?[A-Za-z][A-Za-z0-9_:-]*[\s>/]/u

export function isHtmlMailBody(body: string): boolean {
  return HTML_BODY_PATTERN.test(body)
}

/** A prévia: assunto numa linha, corpo como escrito, com os valores de exemplo. */
export function renderContractorMailPreview(template: Readonly<{ body: string; subject: string }>) {
  return {
    body: interpolateMailTemplate(template.body, OCCURRENCE_MAIL_SAMPLE_VALUES),
    subject: interpolateMailTemplate(template.subject, OCCURRENCE_MAIL_SAMPLE_VALUES)
      .replace(/\s+/gu, ' ')
      .trim(),
  }
}
