/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const EVENT_ACCESS_KEY = '35260711222333000181550010000000011000000013'
export const EVENT_ISSUER_CNPJ = '11222333000181'
export const NFE_AUTHORIZATION_PROTOCOL = '135260000000001'
export const EVENT_REGISTRATION_PROTOCOL = '135260000000002'
export const CORRECTION_TEXT = 'Corrigir o endereco de entrega para Rua Fixture 100'

export const CANCELLATION_DETAIL = [
  '<descEvento>Cancelamento</descEvento>',
  `<nProt>${NFE_AUTHORIZATION_PROTOCOL}</nProt>`,
  '<xJust>Cancelamento solicitado em fixture sintetica</xJust>',
].join('')

export const CORRECTION_DETAIL = [
  '<descEvento>Carta de Correcao</descEvento>',
  `<xCorrecao>${CORRECTION_TEXT}</xCorrecao>`,
  '<xCondUso>Condicao de uso sintetica</xCondUso>',
].join('')

type BuildProcEventoNfeXmlParams = {
  readonly type: string
  readonly detail: string
  readonly statusCode?: string
  readonly reason?: string
  readonly hasReturn?: boolean
}

export function buildProcEventoNfeXml(params: BuildProcEventoNfeXmlParams): string {
  const { type, detail } = params
  const returnNode =
    params.hasReturn === false
      ? ''
      : [
          '<retEvento versao="1.00"><infEvento>',
          '<tpAmb>2</tpAmb><verAplic>TEST-1.0</verAplic><cOrgao>35</cOrgao>',
          `<cStat>${params.statusCode ?? '135'}</cStat>`,
          `<xMotivo>${params.reason ?? 'Evento registrado e vinculado a NF-e'}</xMotivo>`,
          `<chNFe>${EVENT_ACCESS_KEY}</chNFe><tpEvento>${type}</tpEvento><nSeqEvento>1</nSeqEvento>`,
          '<dhRegEvento>2026-07-20T13:00:01-03:00</dhRegEvento>',
          `<nProt>${EVENT_REGISTRATION_PROTOCOL}</nProt>`,
          '</infEvento></retEvento>',
        ].join('')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">',
    `<evento versao="1.00"><infEvento Id="ID${type}${EVENT_ACCESS_KEY}01">`,
    '<cOrgao>35</cOrgao><tpAmb>2</tpAmb>',
    `<CNPJ>${EVENT_ISSUER_CNPJ}</CNPJ><chNFe>${EVENT_ACCESS_KEY}</chNFe>`,
    '<dhEvento>2026-07-20T13:00:00-03:00</dhEvento>',
    `<tpEvento>${type}</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>`,
    `<detEvento versao="1.00">${detail}</detEvento></infEvento></evento>`,
    returnNode,
    '</procEventoNFe>',
  ].join('')
}
