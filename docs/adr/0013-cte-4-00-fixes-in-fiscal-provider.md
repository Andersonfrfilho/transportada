# ADR-0013: Correções de CT-e 4.00 em `@adatechnology/fiscal-provider`

## Contexto

A feature `012-cte-emission-from-selection` exige emissão real de CT-e 4.00. Com o certificado A1 da
transportadora contra `homologacao.nfe.fazenda.sp.gov.br/CTeWS/WS/CTeRecepcaoSincV4.asmx`, nenhuma
tentativa passava: a SEFAZ devolvia `HTTP 400` com corpo vazio e, depois de corrigido o transporte,
uma sequência de rejeições de schema e de regra de homologação.

O código responsável está em `@adatechnology/fiscal-provider`, em outro repositório
(`~/Documents/personal/adatechnology-packages`). Nenhuma das falhas era contornável a partir deste
monorepo: o CT-e é montado, assinado e transmitido inteiramente dentro do pacote, e a regra do
projeto proíbe importar internals `src/sefaz/*`.

O usuário autorizou explicitamente corrigir o pacote com ADR registrada aqui.

## Decisão

Corrigir os defeitos no pacote, cada um com teste de contrato escrito antes da implementação em
`test/contract/cte-sefaz-wire.contract.test.ts`, e publicar no canal `rc`.

Defeitos corrigidos, todos provados contra a SEFAZ SP em homologação:

| #   | Arquivo                                                      | Defeito                                                                    | Sintoma observado                                        |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | `CteSoapClient.ts`                                           | `cteDadosMsg` é `xsd:string` no WSDL; o pacote embutia o XML como elemento | `HTTP 400` com corpo vazio (Base64 sem GZip → cStat 244) |
| 2   | `CteXmlBuilder.ts` · `SefazXmlSigner.ts`                     | `infCTe` no lugar de `infCte`                                              | cStat 243 "XML Mal Formado"                              |
| 3   | `CteXmlBuilder.ts`                                           | `versao="4.00"` em `<CTe>` em vez de `<infCte>`                            | cStat 243                                                |
| 4   | `CteXmlBuilder.ts`                                           | `enderRem` em vez de `enderReme`                                           | cStat 243                                                |
| 5   | `CteXmlBuilder.ts`                                           | `<infModal versao=…>` em vez de `versaoModal`                              | cStat 215                                                |
| 6   | `CteSoapClient.ts`                                           | resposta síncrona vem em `cteRecepcaoResult > retCTe`, não `retCTeSinc`    | `cStat` vazio → `SEFAZ_UNKNOWN`                          |
| 7   | `CteXmlBuilder.ts`                                           | `qCarga` sem as 4 casas de `TDec_1104`                                     | cStat 215                                                |
| 8   | `CteXmlBuilder.ts`                                           | emitente do Simples Nacional (CRT 1/2) precisa de `ICMSSN`, não `ICMS90`   | cStat 215                                                |
| 9   | `CteXmlBuilder.ts`                                           | `serie`/`nCT` com zeros à esquerda violam `TSerie`/`TNF`                   | cStat 215                                                |
| 10  | `CteXmlBuilder.ts`                                           | razão social das partes em homologação é fixada pela SEFAZ                 | cStat 646 (remetente) e 649 (destinatário)               |
| 11  | `CteXmlBuilder.ts` · `CteConstants.ts` · `SefazXmlSigner.ts` | faltava `infCTeSupl/qrCodCTe`; a assinatura precisa vir depois dele        | cStat 850                                                |
| 12  | `FiscalProviderFactory.ts`                                   | `JSON.stringify(config)` na mensagem de erro expunha certificado e senha   | vazamento de segredo                                     |

Decisões de forma:

- o zero-padding de série/número continua **apenas** dentro da chave de acesso;
- a razão social fixa de homologação (`CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL`,
  sem hífen em "CTE", literal aceito pela SEFAZ SP) é aplicada a remetente, destinatário, expedidor
  e recebedor;
- o portal de consulta do QR Code é mapeado por UF (`getCteQrCodeUrl`), com SP explícito e SVRS como
  padrão, espelhando a estratégia já usada em `getCteUrls`;
- a publicação continua no canal `rc` (`0.3.0-rc.1`, `dist-tag` `rc`): o repositório de pacotes está
  em `changesets` pre mode e sair do pre mode versionaria e publicaria pacotes não relacionados que
  estão em andamento.

## Consequências

- a emissão CT-e 4.00 passou a ser autorizada em homologação (cStat 100) pelo caminho do produto;
- `@adatechnology/fiscal-provider@0.3.0-rc.1` está publicado no npm sob o `dist-tag` `rc`, e
  `api-transportada` e `worker-transportada` passaram a depender dessa versão — nenhum ambiente
  precisa mais do `dist` sincronizado à mão;
- `getCteQrCodeUrl` só tem SP verificado contra a SEFAZ; outras UFs caem no portal SVRS e precisam de
  verificação antes do primeiro uso em produção;
- `buildIcms` emite `<ICMS40>` para CST 40/41/51 — o schema CT-e 4.00 nomeia esse grupo `ICMS45`.
  Fora do caminho exercitado (CRT 1 usa `ICMSSN`), registrado como pendência. Resolvido na
  [ADR-0014](0014-cte-icms45-group.md).
