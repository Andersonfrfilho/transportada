/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Chave sintética de 44 dígitos: nunca uma chave fiscal real de cliente. */
export const SYNTHETIC_CTE_ACCESS_KEY = '35260700000000000191570010000000011000000010'

/**
 * Mesma chave sintética com o CNPJ alfanumérico oficial da IN (`12.ABC.345/01DE-35`) nas posições
 * 7 a 20. As letras só cabem nas doze primeiras posições do documento — o DV dele já é numérico.
 */
export const ALPHANUMERIC_CTE_ACCESS_KEY = '35260812ABC34501DE35570010000000011000000017'

type CteXmlOptions = Readonly<{
  icms?: string
  supplement?: string
  takerBlock?: string
  parties?: string
  protocol?: boolean
}>

const DEFAULT_ICMS = `<ICMS><ICMSSN><CST>90</CST><indSN>1</indSN></ICMSSN></ICMS>`

const DEFAULT_PARTIES = `
      <rem>
        <CNPJ>00000000000272</CNPJ>
        <IE>110000000110</IE>
        <xNome>Remetente Sintetico Ltda</xNome>
        <xFant>Remetente Sintetico</xFant>
        <fone>1140000001</fone>
        <enderReme>
          <xLgr>Rua das Amostras</xLgr>
          <nro>100</nro>
          <xBairro>Centro</xBairro>
          <cMun>3550308</cMun>
          <xMun>Sao Paulo</xMun>
          <CEP>01000000</CEP>
          <UF>SP</UF>
          <cPais>1058</cPais>
          <xPais>BRASIL</xPais>
        </enderReme>
      </rem>
      <dest>
        <CNPJ>00000000000353</CNPJ>
        <IE>ISENTO</IE>
        <xNome>Destinatario Sintetico Ltda</xNome>
        <fone>2140000002</fone>
        <email>destinatario@example.test</email>
        <enderDest>
          <xLgr>Avenida dos Testes</xLgr>
          <nro>250</nro>
          <xCpl>Bloco B</xCpl>
          <xBairro>Industrial</xBairro>
          <cMun>3304557</cMun>
          <xMun>Rio de Janeiro</xMun>
          <CEP>20000000</CEP>
          <UF>RJ</UF>
          <cPais>1058</cPais>
          <xPais>BRASIL</xPais>
        </enderDest>
      </dest>`

const PROTOCOL_BLOCK = `
  <protCTe versao="4.00">
    <infProt>
      <tpAmb>2</tpAmb>
      <verAplic>SVRS_TESTE</verAplic>
      <chCTe>${SYNTHETIC_CTE_ACCESS_KEY}</chCTe>
      <dhRecbto>2026-07-28T02:15:04-03:00</dhRecbto>
      <nProt>135260000000001</nProt>
      <digVal>c3ludGhldGljZGlnZXN0</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso do CT-e</xMotivo>
    </infProt>
  </protCTe>`

/** XML sintético com a mesma hierarquia do CT-e 4.00 autorizado, sem nenhum dado real. */
export function buildSyntheticCteXml(options: CteXmlOptions = {}): string {
  const takerBlock = options.takerBlock ?? '<indIEToma>1</indIEToma><toma3><toma>0</toma></toma3>'
  const supplement =
    options.supplement ??
    `<infCTeSupl><qrCodCTe>https://dfe-portal.example.test/consultaCTe?chCTe=${SYNTHETIC_CTE_ACCESS_KEY}&amp;tpAmb=2</qrCodCTe></infCTeSupl>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<cteProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/cte">
  <CTe>
    <infCte Id="CTe${SYNTHETIC_CTE_ACCESS_KEY}" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <cCT>00000001</cCT>
        <CFOP>6353</CFOP>
        <natOp>PRESTACAO DE SERVICO DE TRANSPORTE</natOp>
        <mod>57</mod>
        <serie>1</serie>
        <nCT>1</nCT>
        <dhEmi>2026-07-28T02:14:59-03:00</dhEmi>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>0</cDV>
        <tpAmb>2</tpAmb>
        <tpCTe>0</tpCTe>
        <procEmi>0</procEmi>
        <verProc>1.0.0</verProc>
        <cMunEnv>3550308</cMunEnv>
        <xMunEnv>Sao Paulo</xMunEnv>
        <UFEnv>SP</UFEnv>
        <modal>01</modal>
        <tpServ>0</tpServ>
        <cMunIni>3550308</cMunIni>
        <xMunIni>Sao Paulo</xMunIni>
        <UFIni>SP</UFIni>
        <cMunFim>3304557</cMunFim>
        <xMunFim>Rio de Janeiro</xMunFim>
        <UFFim>RJ</UFFim>
        <retira>1</retira>
        ${takerBlock}
      </ide>
      <compl>
        <xEmi>Emitido por sistema sintetico</xEmi>
        <xObs>Observacao sintetica do contribuinte</xObs>
      </compl>
      <emit>
        <CNPJ>00000000000191</CNPJ>
        <IE>110000000000</IE>
        <xNome>Transportadora Sintetica Ltda</xNome>
        <xFant>Transportadora Sintetica</xFant>
        <enderEmit>
          <xLgr>Rodovia dos Contratos</xLgr>
          <nro>1500</nro>
          <xBairro>Distrito</xBairro>
          <cMun>3550308</cMun>
          <xMun>Sao Paulo</xMun>
          <CEP>04000000</CEP>
          <UF>SP</UF>
          <fone>1140000000</fone>
        </enderEmit>
        <CRT>1</CRT>
      </emit>${options.parties ?? DEFAULT_PARTIES}
      <vPrest>
        <vTPrest>1250.75</vTPrest>
        <vRec>1250.75</vRec>
        <Comp>
          <xNome>FRETE PESO</xNome>
          <vComp>1100.50</vComp>
        </Comp>
        <Comp>
          <xNome>PEDAGIO</xNome>
          <vComp>150.25</vComp>
        </Comp>
      </vPrest>
      <imp>
        ${options.icms ?? DEFAULT_ICMS}
        <vTotTrib>92.13</vTotTrib>
      </imp>
      <infCTeNorm>
        <infCarga>
          <vCarga>48000.00</vCarga>
          <proPred>PRODUTO SINTETICO</proPred>
          <infQ>
            <cUnid>01</cUnid>
            <tpMed>PESO BRUTO</tpMed>
            <qCarga>1250.0000</qCarga>
          </infQ>
          <infQ>
            <cUnid>03</cUnid>
            <tpMed>UNIDADE</tpMed>
            <qCarga>40.0000</qCarga>
          </infQ>
          <vCargaAverb>48000.00</vCargaAverb>
        </infCarga>
        <infDoc>
          <infNFe>
            <chave>35260700000000000272550010000000181000000018</chave>
            <dPrev>2026-07-30</dPrev>
          </infNFe>
          <infNFe>
            <chave>35260700000000000272550010000000191000000027</chave>
            <dPrev>2026-07-30</dPrev>
          </infNFe>
        </infDoc>
        <infModal versaoModal="4.00">
          <rodo>
            <RNTRC>58151044</RNTRC>
          </rodo>
        </infModal>
      </infCTeNorm>
      <infRespTec>
        <CNPJ>00000000000191</CNPJ>
        <xContato>Contato Sintetico</xContato>
        <email>tecnico@example.test</email>
        <fone>1140000000</fone>
      </infRespTec>
    </infCte>
    ${supplement}
  </CTe>${options.protocol === false ? '' : PROTOCOL_BLOCK}
</cteProc>`
}

/** Tomador fora dos quatro papéis do CT-e: os dados vêm no próprio `toma4`. */
export const SYNTHETIC_TOMA4_BLOCK = `<indIEToma>9</indIEToma>
        <toma4>
          <toma>4</toma>
          <CNPJ>00000000000434</CNPJ>
          <IE>ISENTO</IE>
          <xNome>Tomador Sintetico Ltda</xNome>
          <fone>1140000004</fone>
          <enderToma>
            <xLgr>Praca dos Contratos</xLgr>
            <nro>7</nro>
            <xBairro>Central</xBairro>
            <cMun>3550308</cMun>
            <xMun>Sao Paulo</xMun>
            <CEP>01100000</CEP>
            <UF>SP</UF>
            <cPais>1058</cPais>
            <xPais>BRASIL</xPais>
          </enderToma>
        </toma4>`

/** Regime normal: o DACTE precisa da base, alíquota e valor destacados. */
export const SYNTHETIC_ICMS00_BLOCK = `<ICMS><ICMS00>
          <CST>00</CST>
          <vBC>1250.75</vBC>
          <pICMS>12.00</pICMS>
          <vICMS>150.09</vICMS>
        </ICMS00></ICMS>`
