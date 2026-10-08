# Plan — Feature 251

## Contexto (a conferir na T0.1 contra origin/staging)

- Pré-requisito: spec 250 em staging (seleção por env, `cTribNac` no perfil, vínculo de nota
  externa). Esta spec **herda** esses contratos; não os redefine.
- `@adatechnology/fiscal-provider` já assina XML e fala mTLS com a SEFAZ (CT-e 4.00, ADR-0013). Se a
  assinatura XMLDSig for reaproveitável, a DPS usa o mesmo caminho; **não importar internals
  `src/sefaz/*`** (CLAUDE.md) — encapsular em gateway da aplicação.
- Cofre A1: ADR-0004 (`@adatechnology/secret-envelope`, AAD por empresa/certificado). Hoje o
  cofre alimenta o CT-e; a NFS-e passaria a ler o mesmo certificado.

## Desenho (provisório até a Fase 0)

```
payload congelado ──► DPS 1.01 (XML) ──► assinar (A1) ──► [GZip+Base64?] ──► POST mTLS ADN
                                                                                 │
        write-back ◄── status pull ◄── GET NFS-e/DPS por chave ◄────────────────┘
```

- `nfse-national.client.ts` no worker (mesma forma de `NotaRpV2Client`: `issue`, `fetchStatus`,
  `cancel`, `fetchDocument`), um `createNationalNfseGateway` e a seleção por env.
- `nDPS` reservado no mesmo padrão da reserva de número do CT-e (transação, sem lacuna lógica).
- Parâmetros do município (alíquota, retenções, regime) lidos da API nacional **no momento da
  congelação do payload**, nunca na hora da transmissão (a reemissão não recalcula).

## Ambientes (levantamento de 08/10/2026)

| Ambiente          | ADN contribuintes                                        | Sefin Nacional                                                 |
| ----------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| Produção restrita | `https://adn.producaorestrita.nfse.gov.br/contribuintes` | `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional` |
| Produção          | `https://adn.nfse.gov.br/contribuintes`                  | `https://sefin.nfse.gov.br/SefinNacional`                      |

Docs em `…/docs/index(.html)` de cada um. mTLS com e-CNPJ A1. Rotas, compactação e erros: T0.3.

## Riscos e mitigação

| Risco                                           | Mitigação                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Município não aceita emissão direta             | T0.2 antes de qualquer código; se não aceita, a spec 251 vira ADR "não faremos"           |
| Certificado A1 vencido/senha errada em produção | Verificação de validade no cadastro e alerta de renovação (D-30)                          |
| Assinatura inválida só aparece na prefeitura    | Validar a DPS contra o XSD oficial e a assinatura contra a chave pública antes do POST    |
| Perder a Nota RP como contingência              | `NFSE_PROVIDER_API_VERSION` alternável até a decisão do [NEEDS CLARIFICATION] 3           |
| Homologação diverge de produção                 | Primeira emissão de produção de valor mínimo, aprovação humana, nota cancelada em seguida |
| Dobrar emissão (nota 74 + nova)                 | Reutiliza o vínculo de nota externa da spec 250 (T5.x)                                    |

## Contrato HTTP (API própria)

A definir na Fase 2 (cadastro/renovação do A1 da NFS-e e eventual campo de ambiente no perfil).
O contrato do emissor nacional é do Swagger da produção restrita e entra no `plan.md` na T0.3.

## Contrato do Sistema Nacional (T0.3)

Levantamento de 08/10/2026. Rótulos: **[O]** oficial (gov.br/nfse) · **[NO]** não oficial (apenas confirma). O Swagger
de produção restrita **não abre sem certificado** (ver `evidence.md` § T0.3); o contrato de corpo vem de uma cópia pública
do `swagger.json` da Sefin Nacional, por isso (c) é **[NO]**. Base `B = https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual`.

### (a) Quem recebe e quem consulta

- **Sefin Nacional recebe a DPS** (`POST /nfse`, geração síncrona da NFS-e) e responde com o XML da NFS-e. **[O]**
  `B/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf` § 1.3. **Correção ao desenho
  provisório acima:** o POST vai à **Sefin**, não ao ADN.
- **ADN (contribuintes)** é distribuição/consulta de documentos por NSU e eventos por chave; **não recebe DPS**. **[O]**
  `B/manual-contribuintes-apis-adn-sistema-nacional-nfse.pdf` § 1.1.
- Parâmetros municipais ficam em API própria do ADN (`…/parametrizacao`). **[O]** página
  `https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao`.
- Município com `aderenteEmissorNacional = 0` não emite na Sefin; o portão 1 (T0.2) já foi aceito pelo usuário.

### (b) Rotas

Sefin Nacional (`/API/SefinNacional` em restrita, `/SefinNacional` em produção):

| Rota                                                      | Método | Função                                                                                                                  | Fonte |
| --------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- | ----- |
| `/nfse`                                                   | POST   | Recebe a DPS e gera a NFS-e (síncrono); DPS com chave em `subst` substitui                                              | [O]   |
| `/nfse/{chaveAcesso}`                                     | GET    | Consulta NFS-e pela chave (50 dígitos)                                                                                  | [O]   |
| `/dps/{id}`                                               | GET    | Chave da NFS-e a partir do Id da DPS; só ator da nota (prestador/tomador/intermediário)                                 | [O]   |
| `/dps/{id}`                                               | HEAD   | Diz se a DPS gerou NFS-e; qualquer certificado válido                                                                   | [O]   |
| `/nfse/{chaveAcesso}/eventos`                             | POST   | Registra evento (cancelamento = tipo 101101), síncrono                                                                  | [O]   |
| `/nfse/{chaveAcesso}/eventos`                             | GET    | Lista eventos da NFS-e                                                                                                  | [O]   |
| `/nfse/{chaveAcesso}/eventos/{tipoEvento}`                | GET    | Eventos por tipo                                                                                                        | [O]   |
| `/nfse/{chaveAcesso}/eventos/{tipoEvento}/{numSeqEvento}` | GET    | Evento por tipo e sequencial                                                                                            | [O]   |
| `/parametros_municipais/{codMun}/convenio`                | GET    | Convênio do município (`aderenteEmissorNacional`)                                                                       | [O]   |
| `/parametros_municipais/{codMun}/{codigoServico}`         | GET    | Alíquotas, regimes especiais e deduções por subitem                                                                     | [O]   |
| `/parametros_municipais/{codMun}/{CPF/CNPJ}`              | GET    | Retenções e benefícios municipais do contribuinte (o manual lista duas rotas com o mesmo padrão; distinguir no Swagger) | [O]   |
| `/decisao-judicial/nfse`                                  | POST   | "Bypass" por decisão administrativa/judicial (cStat 102); fora do escopo                                                | [O]   |
| `/DANFSe`, `/ParametrosMunicipais` (Sefin)                | GET    | Marcadas "movido" (501); DANFSe agora em `adn…/danfse/docs`                                                             | [NO]  |

ADN contribuintes (`https://adn.producaorestrita.nfse.gov.br/contribuintes`, produção `https://adn.nfse.gov.br/contribuintes`): **[O]**

| Rota                          | Método | Função                                                                                                        |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `/DFe/{NSU}`                  | GET    | Documentos fiscais por NSU (distribuição). Aceita certificado de mesmo CNPJ raiz e CNPJ de consulta informado |
| `/NFSe/{ChaveAcesso}/Eventos` | GET    | Eventos vinculados à chave                                                                                    |

### (c) Corpo e resposta **[NO]** (cópia do Swagger: `https://raw.githubusercontent.com/ItargetLabs/sefin-sdk/main/swagger.json`, título "API NFS-e - Sefin Nacional")

- Mensagens em **JSON**, documentos em XML 1.0 UTF-8, compactação **GZip com representação base64binary**. **[O]** confirma
  só "mensagens JSON" e "XML com assinatura digital" (manual § 1.5.2); a compactação e os nomes abaixo são [NO].
- `POST /nfse`: corpo `{"dpsXmlGZipB64": "<DPS assinada → UTF-8 → gzip → base64>"}`.
  Sucesso **201**: `tipoAmbiente`, `versaoAplicativo`, `dataHoraProcessamento`, `idDps`, `chaveAcesso`, `nfseXmlGZipB64`.
  Erro **400/403/500**: `tipoAmbiente`, `versaoAplicativo`, `dataHoraProcessamento`, `idDPS`, `erros[]` de `{codigo, descricao, complemento}`.
- `GET /nfse/{chave}`: 200 com `chaveAcesso` e `nfseXmlGZipB64`. `GET /dps/{id}`: 200 com `idDps` e `chaveAcesso`. Erros simples: `erro{codigo,descricao,complemento}`.
- `POST …/eventos`: corpo `{"pedidoRegistroEventoXmlGZipB64": "…"}`; 201 devolve `eventoXmlGZipB64`; `GET …/eventos` devolve `eventos[]` desse mesmo objeto.
- Nome citado no FAQ oficial para o campo do evento é `eventoViaXmlGZipBase64`, **diferente** do Swagger copiado: ver (i).

### (d) Autenticação **[O]**

- **mTLS com certificado ICP-Brasil e-CNPJ/e-CPF do próprio prestador emissor**; a assinatura da DPS e a conexão mTLS exigem o mesmo
  certificado. **Não existe procuração eletrônica nem emissão por integrador hoje**: cada empresa transmite com o seu A1; o PAA está "em
  desenvolvimento". `B/../perguntas-e-respostas-nfs-e-v-1-1-20260922.pdf` § 17.7. Isto invalida a ideia de "perfil de procurador": o cofre
  por empresa (ADR-0004) é obrigatório.
- Certificado: ICP-Brasil v3, A1 ou A3, OtherName 2.16.76.1.3.3 (CNPJ) ou 2.16.76.1.3.1 (CPF), KeyUsage com Assinatura Digital + Não Recusa
  (+ Autenticação de Cliente). **Divergência oficial**: o FAQ § 17.1 diz Basic Constraint = false, o Anexo I (RN, v1.01) diz "se informado,
  deve ser true"; seguir o certificado real (e-CNPJ de pessoa jurídica não é AC) e não codificar a regra.
- Rejeições: `E0717` (assinatura ausente), `E0718` (CNPJ do certificado ≠ `emit`), `E1206`/`E107` (LCR inacessível: liberar saída
  de rede às URLs de LCR do certificado). **[O]** FAQ §§ 17.1–17.3.
- TLS 1.0 a 1.2 com autenticação mútua. **[NO]** (descrição do Swagger copiado).

### (e) Assinatura XMLDSig

- Assinatura **obrigatória** na DPS e no pedido de evento quando enviados à API; padrão **Enveloped**, no elemento que carrega o atributo
  `Id` (`infDPS` na DPS; `infPedReg` no evento); o `Signature` fica como irmão após esse elemento na raiz (`DPS` / `pedRegEvento`). **[O]**
  XSD `DPS_v1.01.xsd`/`TCDPS` e `pedRegEvento_v1.01.xsd`, Anexo I (RN) e FAQ § 17.1.
- Algoritmos: **sem prova oficial**. Biblioteca não oficial assina `infPedReg` com **RSA-SHA1** "padrão SEFIN" (`https://github.com/ItargetLabs/sefin-sdk`,
  README). Não adotar até testar contra a restrita (T0.4); ver (i).
- A NFS-e devolvida vem assinada pelo município emissor (RN do Anexo I). **[O]**

### (f) Numeração da DPS **[O]** (XSD 1.01 e FAQ §§ 18.1–18.5)

- `Id` de `infDPS` (`TSIdDPS`): `"DPS"` + cLocEmi(7) + tipo de inscrição(1) + inscrição federal(14, CPF completa com zeros) + série(5) + nDPS(15) = `DPS[0-9]{42}`.
- `serie`: até 5 dígitos; **API usa a faixa 00001–49999** (50000–69999 app móvel; 70000–79999 portal; 80000–89999 transcrição). Série fora da faixa: `E0010`.
- `nDPS`: padrão `[1-9][0-9]{0,14}` (sem zero à esquerda; no `Id` vai preenchido com zeros a 15). Quem controla a sequência é o emitente (nossa reserva em transação).
- `nNFSe` (13 dígitos) é numerado pela Sefin; número reservado e perdido por timeout **não é reaproveitado** (esperado, sem recuperar).
  Repetir a transmissão com o mesmo `Id` após timeout: consultar antes por `HEAD /dps/{id}` (idempotência), por inferência do contrato `HEAD`/`GET /dps`.
- Chave de acesso: 50 dígitos; `TSIdNFSe` = `"NFS"` + 50 dígitos (cMun 7 + ambGer 1 + tpInsc 1 + inscrição 14 + nNFSe 13 + AAMM 4 + cód. numérico 9 + DV 1).
- Códigos de tipo de inscrição (1/2 = CPF/CNPJ) **não confirmados** no que li: conferir no Anexo I (T1.1).

### (g) Erros, limites, síncrono × assíncrono

- **Síncrono**: DPS → NFS-e e pedido → evento respondem na própria chamada. **[O]** manual §§ 1.3.2 e 1.5.2. Não há fila nem consulta de protocolo.
- Status HTTP por rota (201/400/403/500 na emissão; 400/401/403/404 na consulta; 201/400/401/422 em eventos): **[NO]** (Swagger copiado).
- Códigos vistos: `E0010`, `E0717`, `E0718`, `E1206`/`E107` **[O]**; `E999` e `RNG9999` (campo JSON com nome errado) **[NO]** (fórum do projeto ACBr).
- **Limites de taxa: não encontrados** em fonte alguma. Único limite documentado é do ADN (compartilhamento municipal): 50 documentos ou 1 MB por POST `/DFe`, irrelevante ao contribuinte. **[O]** FAQ § 6.7.
- Cancelamento é evento `e101101` (campos `xDesc`, `cMotivo`, `xMotivo`); também existem `e105102` (por substituição) e `e105104` (análise fiscal). **[O]** XSD `tiposEventos_v1.01.xsd`.
- **DANFSe**: a geração automática do PDF pela API governamental foi **sobrestada em 03/08/2026**; o integrador renderiza o PDF localmente a partir do XML.
  O XML é o documento fiscal; o DANFSe é auxiliar. **[O]** FAQ § 17.8. Impacto: a spec precisa de renderizador próprio de DANFSe (não existe rota estável).

### (h) XSD e leiaute

- **Versão do leiaute 1.01** (valores aceitos no atributo `versao`: `1.00|1.01`); pacote `B/nfse-esquemas_xsd-v1-01-20260209.zip` (09/02/2026), com `DPS_v1.01.xsd`,
  `NFSe_v1.01.xsd`, `pedRegEvento_v1.01.xsd`, `evento_v1.01.xsd`, tipos e `xmldsig-core-schema.xsd`. **[O]** Namespace `http://www.sped.fazenda.gov.br/nfse`.
- Regras de negócio: `B/anexo_i-sefin_adn-dps_nfse-snnfse-v1-01-20260209.xlsx` (DPS/NFS-e) e `B/anexo_ii-sefin_adn-pedregevt_evt-snnfse-v1-01-20260122.xlsx` (eventos);
  domínios `anexo_a` (IBGE), `anexo_b` (NBS), `anexo_c` (INDOP). **[O]** Nada foi baixado para o repositório; a T1.1 decide onde versionar o XSD.
- `tpAmb`: 1 produção, 2 homologação. `dhEmi` em UTC com deslocamento. `tpEmit`: 1 prestador.

### (i) Sem prova (e a fonte que faltou)

1. **Swagger oficial de produção restrita** (Sefin e ADN): 403 (IIS) / erro TLS sem certificado. Faltou o A1 de homologação (T0.4). O contrato de corpo (c) é [NO].
2. Nome exato do campo de compactação **no oficial**: Swagger copiado diz `pedidoRegistroEventoXmlGZipBase64` ≠ FAQ oficial `eventoViaXmlGZipBase64`. Dirimir no Swagger real.
3. **Algoritmos XMLDSig** (digest, assinatura, canonicalização) e posição exata da `Reference`: sem fonte oficial lida. Faltou o PDF/Anexo com exemplos; testar na restrita.
4. **Limites de taxa e timeouts** da Sefin: nenhuma fonte.
5. Valor de `aderenteEmissorNacional` para 3543402: exige mTLS (herdado da T0.2).
6. Rota exata do DANFSe no ADN e se a restrita ainda a serve (docs em `adn…/danfse/docs`, inacessível sem certificado).
7. Códigos de tipo de inscrição e lista completa de códigos de erro: Anexo I (T1.1).
8. `nDPS` e série por empresa: confirmar na restrita que a série 00001+ é aceita sem cadastro prévio.
