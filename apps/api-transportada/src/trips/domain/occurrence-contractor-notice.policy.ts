/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 (D2): o tipo marcado com `blocks_contractor_notice` **nunca** avisa a contratante, em canal nenhum. É a
 * única regra, e os quatro pontos que falam com a contratante a leem: o e-mail automático (e o grupo da 318, que mora
 * nele), o varredor do worker (cópia por valor no SQL, com contrato de paridade), o envio manual do escritório (e-mail,
 * chat por e-mail e portal). `notifies` (aviso interno, 079/275) **não** é o interruptor e não entra aqui.
 *
 * A marca ausente vale `false`: só os dublês de teste a omitem; a leitura real sempre a traz.
 */
export function occurrenceTypeNeverNotifiesContractor(type: {
  readonly blocksContractorNotice?: boolean | undefined
}): boolean {
  return type.blocksContractorNotice === true
}

/**
 * Spec 321 (D4c): na fase 1 a coleta de canhoto **não** soma carga na viagem que a busca. O cadastro só aceita `true`
 * quando ele já é o valor gravado (ou na criação, onde é o padrão da coluna): voltar a `true` um tipo gravado com
 * `false` é recusado até os leitores de carga da T0 §8 aprenderem a somar a coleta.
 */
export function isPickupCargoCountingUnsupported(params: {
  readonly current: boolean | undefined
  readonly requested: boolean | undefined
}): boolean {
  return params.requested === true && params.current === false
}
