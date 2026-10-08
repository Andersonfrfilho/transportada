# Plan — Feature 251

## Contexto (a conferir na T0.1 contra origin/staging)

- Pré-requisito: spec 250 em staging (seleção por env, `cTribNac` no perfil, vínculo de nota
  externa). Esta spec **herda** esses contratos; não os redefine.
- `@adatechnology/fiscal-provider` já assina XML e fala mTLS com a SEFAZ (CT-e 4.00, ADR-0013). Se a
  assinatura XMLDSig for reaproveitável, a DPS usa o mesmo caminho; **não importar internals
  `src/sefaz/*`** (CLAUDE.md) — encapsular em gateway da aplicação.
- Cofre A1: ADR-0004 (`@adatechnology/secret-envelope`, AAD por empresa/certificado). Hoje o
  cofre alimenta o CT-e; a NFS-e passaria a ler o mesmo certificado.

## Desenho (contrato oficial lido em 08/10/2026)

```
payload congelado ──► DPS 1.01 (XML) ──► assinar (A1) ──► gzip ──► base64 ──► {"dpsXmlGZipB64"}
                                                                                      │
                                     POST /nfse (Sefin Nacional, mTLS, síncrono) ◄────┘
                                                      │ 201 {chaveAcesso, nfseXmlGZipB64}
        write-back ◄── guarda XML da NFS-e ◄──────────┘
        (timeout/5xx: HEAD ou GET /dps/{idDps} decide se a nota nasceu antes de retransmitir)
```

- `nfse-national.client.ts` no worker (mesma forma de `NotaRpV2Client`: `issue`, `fetchStatus`,
  `cancel`, `fetchDocument`), um `createNationalNfseGateway` e a seleção por env.
- `nDPS` reservado no mesmo padrão da reserva de número do CT-e (transação, sem lacuna lógica).
- Parâmetros do município (alíquota, retenções, regime) lidos do ADN `parametrizacao` **no momento da
  congelação do payload**, nunca na hora da transmissão (a reemissão não recalcula).
- Emissão é **síncrona**: não há protocolo nem fila; o "status pull" vira reconciliação por `/dps/{id}`.

## Ambientes (Swagger oficial lido com o A1 em 08/10/2026)

| Ambiente          | ADN contribuintes                                        | ADN parametrização                                         | Sefin Nacional                                              |
| ----------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| Produção restrita | `https://adn.producaorestrita.nfse.gov.br/contribuintes` | `https://adn.producaorestrita.nfse.gov.br/parametrizacao`  | `https://sefin.producaorestrita.nfse.gov.br/SefinNacional`  |
| Produção          | `https://adn.nfse.gov.br/contribuintes`                  | `https://adn.nfse.gov.br/parametrizacao` (**não oficial**) | `https://sefin.nfse.gov.br/SefinNacional` (**não oficial**) |

**Correção:** o `basePath` do Swagger oficial da Sefin é `/SefinNacional`, **sem** `/API/` (o levantamento anterior trazia
`/API/SefinNacional` para a restrita). As linhas de produção seguem como no levantamento anterior; só o convênio foi medido lá
(`adn-convenio-producao`, mesmo resultado). mTLS com e-CNPJ A1.

## Contrato HTTP (API própria)

A definir na Fase 2 (cadastro/renovação do A1 da NFS-e e eventual campo de ambiente no perfil).
O contrato do emissor nacional é do Swagger da produção restrita e entra no `plan.md` na T0.3.

## Contrato do Sistema Nacional (T0.3) — fechado com o Swagger oficial

Rótulos: **[O]** = oficial (Swagger lido com o A1 em 08/10/2026, ou manual/XSD/FAQ do gov.br/nfse quando citado) · **[NO]** = não oficial.
Arquivos lidos e resultado de cada um: `evidence.md` § "T0.3 — fechamento (Swagger oficial)".
Base `B = https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual`.

### (a) Quem recebe e quem consulta

- **Sefin Nacional recebe a DPS**: `POST /nfse`, geração **síncrona** da NFS-e ("Recepciona a DPS e Gera a NFS-e de forma síncrona"). **[O]** Swagger Sefin
  (`swagger: 2.0`, "API NFS-e - Sefin Nacional v1", `basePath /SefinNacional`). O ADN **não** recebe DPS.
- **ADN contribuintes** (OpenAPI 3.0.1, "API NFS-e - ADN Contribuinte v1") só distribui: `GET /DFe/{NSU}` e `GET /NFSe/{ChaveAcesso}/Eventos`. **[O]**
- **ADN parametrização** (OpenAPI 3.0.1, "ADN Parâmetros Municipais v1", `servers: /parametrizacao`) é onde ficam convênio, alíquota, benefício,
  regime especial e retenção. A Sefin deixou `/ParametrosMunicipais` e `/DANFSe` respondendo **501** "movido" para
  `adn…/parametrizacao/docs` e `adn…/danfse/docs`. **[O]**
- **Convênio de Ribeirão Preto (3543402)** [O], `GET /parametrizacao/3543402/convenio` → 200 em **restrita e produção**:
  `aderenteAmbienteNacional = 1`, `aderenteEmissorNacional = 0`, `situacaoEmissaoPadraoContribuintesRFB = 1`, `aderenteMAN = 0`,
  `permiteAproveitametoDeCreditos = true`. O usuário informa que o **cadastro está desatualizado** (o município já emitiria pelo Emissor Nacional):
  isso é **declaração do usuário, não oficial**. O risco (a Sefin recusar a emissão por convênio) é coberto pela sonda da T2.3b; a emissão real só ocorre na T4.2.

### (b) Rotas

Sefin Nacional (`https://sefin.producaorestrita.nfse.gov.br/SefinNacional`). **[O]** (Swagger). Respostas são `application/json`; nenhum `security` declarado
(a autenticação é o mTLS):

| Rota                                                      | Método | Corpo (entrada)                        | Respostas (HTTP → schema)                                                                                                                       |
| --------------------------------------------------------- | ------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/nfse`                                                   | POST   | `NFSePostRequest`                      | 201 `NFSePostResponseSucesso` · 400 `NFSePostResponseErro` · 403 `NFSePostResponseErro` (certificado inválido) · 500 `NFSePostResponseErro`     |
| `/nfse/{chaveAcesso}`                                     | GET    | —                                      | 200 `NFSeGetResponseSucesso` · 400 (chave ≠ 50 números) · 401 (sem certificado de cliente) · 403 (usuário sem permissão) · 404 (`ResponseErro`) |
| `/dps/{id}`                                               | GET    | —                                      | 200 `DpsGetResponse` · 400 (id inválido) · 404 (nenhuma NFS-e com esse id) (`ResponseErro`)                                                     |
| `/dps/{id}`                                               | HEAD   | —                                      | 200 encontrado · 400 inválido · 404 não encontrado (sem corpo)                                                                                  |
| `/nfse/{chaveAcesso}/eventos`                             | POST   | `EventosPostRequest`                   | 201 `EventosPostResponseSucesso` · 400 (regra de negócio) · 401 (sem permissão) (`ResponseErro`)                                                |
| `/nfse/{chaveAcesso}/eventos/{tipoEvento}/{numSeqEvento}` | GET    | —                                      | 200 `EventosPostResponseSucesso` · 401 · 404 (nenhum evento) · 422 (regra de negócio) (`ResponseErro`)                                          |
| `/decisao-judicial/nfse`                                  | POST   | `NFSeBypassPostRequest` (`xmlGZipB64`) | 201/400/403/500 como `/nfse`; **fora do escopo**                                                                                                |
| `/DANFSe`, `/ParametrosMunicipais`                        | GET    | —                                      | 200 `object` · **501** "movido"                                                                                                                 |

- `tipoEvento` (inteiro) aceita: 101101, 101103, 105102, 105104, 105105, 202201, 202205, 203202, 203206, 204203, 204207, 205204, 205208, 305101, 305102, 305103,
  467201, 907201. **[O]** O Swagger **não** traz `GET /nfse/{chave}/eventos` nem `/eventos/{tipoEvento}`; a listagem por chave está só no ADN
  (`/NFSe/{ChaveAcesso}/Eventos`). **A tabela do levantamento anterior que listava essas duas rotas da Sefin era [NO] e fica descartada.**

ADN contribuintes (`https://adn.producaorestrita.nfse.gov.br/contribuintes`). **[O]**

| Rota                          | Método | Parâmetros                                                                       | Respostas                                            |
| ----------------------------- | ------ | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `/DFe/{NSU}`                  | GET    | `NSU` (int64, path); `cnpjConsulta` (query); `lote` (bool, query, padrão `true`) | 200 · 400 · 404, todos `LoteDistribuicaoNSUResponse` |
| `/NFSe/{ChaveAcesso}/Eventos` | GET    | `ChaveAcesso` (path)                                                             | 200 · 404, `LoteDistribuicaoNSUResponse`             |

ADN parametrização (`https://adn.producaorestrita.nfse.gov.br/parametrizacao`). **[O]** Todas as GET respondem 200/400/404 com o `Resultado…` da linha:

| Rota (a partir de `/parametrizacao`)                                                                      | Método | Resultado                                                                                    |
| --------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `/{codigoMunicipio}/convenio`                                                                             | GET    | `ResultadoConsultaConfiguracoesConvenio`                                                     |
| `/{codigoMunicipio}/{codigoServico}/{competencia}/aliquota`                                               | GET    | `ResultadoConsultaAliquotas`                                                                 |
| `/{codigoMunicipio}/{codigoServico}/historicoaliquotas`                                                   | GET    | `ResultadoConsultaAliquotas`                                                                 |
| `/{codigoMunicipio}/{numeroBeneficio}/{competencia}/beneficio`                                            | GET    | `ResultadoConsultaBeneficio`                                                                 |
| `/{codigoMunicipio}/{codigoServico}/{competencia}/regimes_especiais`                                      | GET    | `ResultadoConsultaRegimesEspeciais`                                                          |
| `/{codigoMunicipio}/{competencia}/retencoes`                                                              | GET    | `ResultadoConsultaRetencoes`                                                                 |
| `/{codigoMunicipio}/beneficiomunicipal/{idManut}`, `/regimes_especiais/{idManut}`, `/retencoes/{idManut}` | POST   | `ParamPostRequest` (`tipoAmbiente`, `paramXmlGZipB64`); uso do município, **fora do escopo** |

**Correção:** as rotas `/parametros_municipais/{codMun}/…` do levantamento anterior eram do manual (PDF) e **não** são as do Swagger vigente. Valem as acima.

### (c) Corpo e resposta **[O]** (Swagger Sefin lido com o A1)

- Mensagens em **JSON**; documentos em XML 1.0 UTF-8, **GZip + base64binary** (campos `…XmlGZipB64`). **[O]**
- `NFSePostRequest`: `{"dpsXmlGZipB64": string}` (obrigatório): DPS assinada, UTF-8, gzip, base64.
- `NFSePostResponseSucesso` (201): `tipoAmbiente` (1 produção, 2 homologação), `versaoAplicativo`, `dataHoraProcessamento`, `idDps`, `chaveAcesso`,
  `nfseXmlGZipB64` (obrigatórios) e `alertas[]` (`MensagemProcessamento`).
- `NFSePostResponseErro` (400/403/500): `tipoAmbiente`, `versaoAplicativo`, `dataHoraProcessamento`, `erros[]` (obrigatórios) e `idDPS` (note a caixa: `idDPS`).
- `MensagemProcessamento`: `{codigo, descricao, complemento}`, todos string.
- `ResponseErro` (consultas e eventos): `tipoAmbiente`, `versaoAplicativo`, `dataHoraProcessamento`, `erro` (um único `MensagemProcessamento`, não lista).
- `NFSeGetResponseSucesso`: `tipoAmbiente`, `versaoAplicativo`, `dataHoraProcessamento`, `chaveAcesso`, `nfseXmlGZipB64`.
- `DpsGetResponse`: `tipoAmbiente`, `versaoAplicativo`, `dataHoraProcessamento`, `idDps`, `chaveAcesso` (todos obrigatórios).
- `EventosPostRequest`: **`{"pedidoRegistroEventoXmlGZipB64": string}`** (obrigatório). Isso **resolve a divergência**: o nome do campo oficial é
  `pedidoRegistroEventoXmlGZipB64` (o `eventoViaXmlGZipBase64` do FAQ não vale para a API).
- `EventosPostResponseSucesso`: `tipoAmbiente`, `versaoAplicativo`, `dataHoraProcessamento`, `eventoXmlGZipB64` (um evento por resposta).
- `LoteDistribuicaoNSUResponse` (ADN): `StatusProcessamento` (`REJEICAO` | `NENHUM_DOCUMENTO_LOCALIZADO` | `DOCUMENTOS_LOCALIZADOS`), `LoteDFe[]`, `Alertas[]`,
  `Erros[]`, `TipoAmbiente` (`PRODUCAO` | `HOMOLOGACAO`), `VersaoAplicativo`, `DataHoraProcessamento`. Cada `DistribuicaoNSU`: `NSU`, `ChaveAcesso`,
  `TipoDocumento` (`NENHUM|DPS|PEDIDO_REGISTRO_EVENTO|NFSE|EVENTO|CNC`), `TipoEvento` (`CANCELAMENTO`, `CANCELAMENTO_POR_SUBSTITUICAO`, `CONFIRMACAO_*`, etc.), `ArquivoXml`, `DataHoraGeracao`.
  No ADN os campos são `PascalCase`; na Sefin, `camelCase`.
- Convênio (`ParametrosConfiguracaoConvenio`): `tipoConvenio…`, `aderenteAmbienteNacional`, `aderenteEmissorNacional`, `situacaoEmissaoPadraoContribuintesRFB`,
  `aderenteMAN` (`TipoSimNao`: 0, 1, -1) e `permiteAproveitametoDeCreditos`.

### (d) Autenticação **[O]**

- **mTLS com certificado ICP-Brasil e-CNPJ/e-CPF do próprio prestador emissor**; a assinatura da DPS e a conexão mTLS exigem o mesmo
  certificado. **Não existe procuração eletrônica nem emissão por integrador hoje**: cada empresa transmite com o seu A1; o PAA está "em
  desenvolvimento". FAQ § 17.7. Invalida a ideia de "perfil de procurador": o cofre por empresa (ADR-0004) é obrigatório.
- Certificado: ICP-Brasil v3, A1 ou A3, OtherName 2.16.76.1.3.3 (CNPJ) ou 2.16.76.1.3.1 (CPF), KeyUsage com Assinatura Digital + Não Recusa
  (+ Autenticação de Cliente). **Divergência oficial**: o FAQ § 17.1 diz Basic Constraint = false, o Anexo I (RN, v1.01) diz "se informado,
  deve ser true"; seguir o certificado real e não codificar a regra.
- Rejeições: `E0717` (assinatura ausente), `E0718` (CNPJ do certificado ≠ `emit`), `E1206`/`E107` (LCR inacessível: liberar saída
  de rede às URLs de LCR do certificado). FAQ §§ 17.1–17.3.
- Swagger declara `403` "Certificado digital da transmissão inválido ou fora dos padrões" na emissão e `401` "Não foi possível obter o certificado de cliente" na consulta. **[O]**

### (e) Assinatura XMLDSig

- Assinatura **obrigatória** na DPS e no pedido de evento; padrão **Enveloped**, no elemento com `Id` (`infDPS`; `infPedReg`); o `Signature` fica como irmão
  após esse elemento na raiz (`DPS` / `pedRegEvento`). **[O]** XSD 1.01, Anexo I (RN) e FAQ § 17.1.
- **Algoritmos (digest, assinatura, canonicalização): continuam SEM fonte oficial.** O Swagger não os informa. Biblioteca não oficial assina `infPedReg` com
  RSA-SHA1 (`https://github.com/ItargetLabs/sefin-sdk`). **[NO]** Não adotar sem teste contra a restrita.
- A NFS-e devolvida vem assinada pelo município emissor (RN do Anexo I). **[O]**

### (f) Numeração da DPS **[O]** (XSD 1.01 e FAQ §§ 18.1–18.5)

- `Id` de `infDPS` (`TSIdDPS`): `"DPS"` + cLocEmi(7) + tipo de inscrição(1) + inscrição federal(14, CPF completa com zeros) + série(5) + nDPS(15) = `DPS[0-9]{42}`.
- `serie`: até 5 dígitos; **API usa a faixa 00001–49999**. Série fora da faixa: `E0010`.
- `nDPS`: `[1-9][0-9]{0,14}` (no `Id` vai preenchido com zeros a 15). O emitente controla a sequência (nossa reserva em transação).
- `nNFSe` (13 dígitos) é numerado pela Sefin; número reservado e perdido por timeout **não é reaproveitado**.
- **Idempotência [O]**: `HEAD /dps/{id}` (200/404) diz se a DPS gerou NFS-e e `GET /dps/{id}` devolve a `chaveAcesso` (o GET é restrito ao ator da nota, conforme o manual). Após timeout, consultar antes de retransmitir.
- Chave de acesso: 50 dígitos (o Swagger exige "50 números"); `TSIdNFSe` = `"NFS"` + 50 dígitos.
- Códigos de tipo de inscrição (1/2 = CPF/CNPJ) **não confirmados**: conferir no Anexo I (T1.1).

### (g) Erros, limites, síncrono × assíncrono

- **Síncrono [O]**: DPS → NFS-e (201) e pedido → evento (201) respondem na própria chamada. Não há fila nem consulta de protocolo.
- Status HTTP por rota: tabela de (b), todos **[O]**. Observe: `/nfse` não declara 401/404; eventos POST não declara 403/500.
- Códigos vistos: `E0010`, `E0717`, `E0718`, `E1206`/`E107` **[O]** (FAQ); `E999` e `RNG9999` **[NO]**.
- **Limites de taxa: SEM fonte oficial** (o Swagger não declara 429). Único limite documentado: 50 documentos ou 1 MB por POST `/DFe` do ADN. FAQ § 6.7.
- Cancelamento é o evento `101101` enviado em `POST /nfse/{chave}/eventos` com `pedidoRegistroEventoXmlGZipB64`; também `105102` (por substituição) e
  `105104` (análise fiscal). **[O]**
- **DANFSe**: a rota da Sefin só devolve 501. A API de geração de PDF foi **sobrestada em 03/08/2026** (FAQ § 17.8 **[O]**); o Swagger do DANFSe do ADN
  (`…/danfse/swagger/v1/swagger.json`) respondeu 404. **Precisa de renderizador próprio** a partir do XML da NFS-e.

### (h) XSD e leiaute

- **Leiaute 1.01** (`versao` aceita `1.00|1.01`); pacote `B/nfse-esquemas_xsd-v1-01-20260209.zip`, com `DPS_v1.01.xsd`, `NFSe_v1.01.xsd`, `pedRegEvento_v1.01.xsd`,
  `evento_v1.01.xsd`, tipos e `xmldsig-core-schema.xsd`. **[O]** Namespace `http://www.sped.fazenda.gov.br/nfse`.
- Regras de negócio: Anexo I (DPS/NFS-e) e Anexo II (eventos), `B/anexo_i-…-v1-01-20260209.xlsx` e `B/anexo_ii-…-v1-01-20260122.xlsx`. **[O]** A T1.1 decide onde versionar o XSD.
- `tpAmb`: 1 produção, 2 homologação. `dhEmi` em UTC com deslocamento. `tpEmit`: 1 prestador.

### (i) O que continua sem fonte oficial

1. **Algoritmos XMLDSig** (digest, assinatura, canonicalização) e posição exata da `Reference`: testar na restrita (T2.x).
2. **Limites de taxa e timeouts** da Sefin e do ADN: nenhuma fonte.
3. **Swagger do DANFSe** (404) e da API de PDF sobrestada: renderizador próprio.
4. Se `aderenteEmissorNacional = 0` de fato bloqueia a Sefin para 3543402 (o usuário diz que o cadastro está desatualizado): decide a sonda T2.3b.
5. Códigos de tipo de inscrição e lista completa de códigos de erro: Anexo I (T1.1).
6. `nDPS` e série por empresa: confirmar na restrita que a série 00001+ é aceita sem cadastro prévio.
7. Produção: URLs de produção estão por analogia e só o convênio foi lido lá.
