/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * O "ÓRG. EMISSOR" que a CNH imprime ao lado do documento de identidade. A lista começa pelos órgãos
 * de identificação civil (é de onde vem quase todo RG), segue pelos federais e militares — que
 * emitem identidade para quem serviu — e termina nos documentos que fazem as vezes de identidade.
 * `OUTROS` fecha a lista porque o campo é fechado: sem ele, o órgão de um estado que ninguém previu
 * viraria cadastro impossível de concluir.
 */
export const IDENTITY_DOCUMENT_ISSUERS = [
  'SSP',
  'PC',
  'DETRAN',
  'SDS',
  'IFP',
  'IML',
  'DIC',
  'SJS',
  'SES',
  'PF',
  'MEX',
  'MAER',
  'MMA',
  'OAB',
  'CTPS',
  'RNE',
  'OUTROS',
] as const
export type IdentityDocumentIssuer = (typeof IDENTITY_DOCUMENT_ISSUERS)[number]

/** O RG não tem formato nacional: cada estado numera do seu jeito, com ponto, traço e letra. */
export const IDENTITY_DOCUMENT_MAX_LENGTH = 20
