/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const SYNTHETIC_MDFE_ACCESS_KEY = '35260712345678000199580010000000011000000017'
const SYNTHETIC_CTE_ACCESS_KEY = '35260712345678000199570010000000011000000015'
const SYNTHETIC_NFE_ACCESS_KEY = '35260712345678000199550010000000011000000013'

export type SyntheticMdfeXmlOptions = {
  /** Sem `protMDFe` é o manifesto que ainda não voltou da SEFAZ — e não se imprime. */
  readonly authorized?: boolean
  readonly environment?: '1' | '2'
}

/** Um MDF-e rodoviário mínimo, com o que o DAMDFE precisa imprimir e nada além. */
export function buildSyntheticMdfeXml(options: SyntheticMdfeXmlOptions = {}): string {
  const authorized = options.authorized ?? true

  return `<?xml version="1.0" encoding="UTF-8"?>
<mdfeProc versao="3.00">
  <MDFe>
    <infMDFe versao="3.00" Id="MDFe${SYNTHETIC_MDFE_ACCESS_KEY}">
      <ide>
        <cUF>35</cUF>
        <tpAmb>${options.environment ?? '1'}</tpAmb>
        <tpEmit>1</tpEmit>
        <mod>58</mod>
        <serie>1</serie>
        <nMDF>1</nMDF>
        <modal>1</modal>
        <dhEmi>2026-08-26T09:15:00-03:00</dhEmi>
        <UFIni>SP</UFIni>
        <UFFim>SP</UFFim>
        <infMunCarrega>
          <cMunCarrega>3543402</cMunCarrega>
          <xMunCarrega>RIBEIRAO PRETO</xMunCarrega>
        </infMunCarrega>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <IE>123456789012</IE>
        <xNome>Transportadora Sintetica Ltda</xNome>
        <enderEmit>
          <xLgr>Rua das Cargas</xLgr>
          <nro>1000</nro>
          <xBairro>Distrito Industrial</xBairro>
          <cMun>3543402</cMun>
          <xMun>RIBEIRAO PRETO</xMun>
          <CEP>14000000</CEP>
          <UF>SP</UF>
        </enderEmit>
      </emit>
      <infModal versaoModal="3.00">
        <rodo>
          <infANTT>
            <RNTRC>12345678</RNTRC>
          </infANTT>
          <veicTracao>
            <cInt>1</cInt>
            <placa>GCQ8E47</placa>
            <tara>8000</tara>
            <capKG>14000</capKG>
            <condutor>
              <xNome>Joao da Silva</xNome>
              <CPF>12345678901</CPF>
            </condutor>
          </veicTracao>
          <veicReboque>
            <cInt>2</cInt>
            <placa>ABC1D23</placa>
            <tara>5000</tara>
          </veicReboque>
        </rodo>
      </infModal>
      <infDoc>
        <infMunDescarga>
          <cMunDescarga>3551009</cMunDescarga>
          <xMunDescarga>SERTAOZINHO</xMunDescarga>
          <infCTe>
            <chCTe>${SYNTHETIC_CTE_ACCESS_KEY}</chCTe>
          </infCTe>
          <infNFe>
            <chNFe>${SYNTHETIC_NFE_ACCESS_KEY}</chNFe>
          </infNFe>
        </infMunDescarga>
      </infDoc>
      <tot>
        <qCTe>1</qCTe>
        <qNFe>1</qNFe>
        <vCarga>1250.75</vCarga>
        <cUnid>01</cUnid>
        <qCarga>320.5000</qCarga>
      </tot>
      <infAdic>
        <infCpl>Viagem sintetica de contrato</infCpl>
      </infAdic>
    </infMDFe>
  </MDFe>${
    authorized
      ? `
  <protMDFe versao="3.00">
    <infProt>
      <tpAmb>1</tpAmb>
      <chMDFe>${SYNTHETIC_MDFE_ACCESS_KEY}</chMDFe>
      <dhRecbto>2026-08-26T09:16:10-03:00</dhRecbto>
      <nProt>135260000000099</nProt>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso do MDF-e</xMotivo>
    </infProt>
  </protMDFe>`
      : ''
  }
</mdfeProc>`
}
