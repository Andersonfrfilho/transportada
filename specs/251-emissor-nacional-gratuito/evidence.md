# Evidência — Feature 251

## T0.1 — contratos herdados da 250 e pontos de extensão

Verificação feita na worktree `work/spec-251` (que está em `origin/staging` + 1 commit de docs). A spec 250 está em `origin/staging` (último commit da pasta: `0fb79c24c`), e o código que ela entrega já está na árvore.

### Pontos de extensão (caminho:linha, verificados)

**(a) Porta de emissão e clientes**

- `apps/worker-transportada/src/nfse-issuance/infrastructure/nfse-fiscal-gateway.ts:131` — tipo `NfseFiscalGateway` (`issue`, `fetchStatus`, `fetchDocument`, `cancel`), com `providerApiVersion` em cada operação. É a porta a manter para o emissor nacional.
- `apps/worker-transportada/src/nfse-issuance/infrastructure/nfse-fiscal-gateway.ts:161` — `createNfseFiscalGateway`, o ponto de injeção (`createClient`, `createV3Client`, `v3Fetch`).
- `apps/worker-transportada/src/nfse-status-pull/application/nfse-fiscal-status.port.ts:29` — porta `NfseStatusPort` do status pull (segunda porta que fala com o provedor).
- `apps/worker-transportada/src/nfse-status-pull/infrastructure/nfse-fiscal-status.gateway.ts:71` — `createNfseFiscalStatusGateway`; monta v2 (`:82`) e o resolvedor v3 (`:83`).
- `apps/worker-transportada/src/nfse-issuance/infrastructure/nota-rp-v2.client.ts:154` — `createNotaRpV2Client`.
- `apps/worker-transportada/src/nfse-issuance/infrastructure/nota-rp-v3.client.ts:42` — `createNotaRpV3Client`; o corpo de emissão sai de `buildIssueBody` em `nota-rp-v3-issue-body.mapper.ts:69`.
- `apps/worker-transportada/src/nfse-issuance/infrastructure/nfse-v3-client.resolver.ts:31` — `createNfseV3ClientResolver`, que decifra a credencial e cria o cliente v3 por chamada.

**(b) Seleção v2/v3 por `NFSE_PROVIDER_API_VERSION`**

- `apps/api-transportada/src/shared/nfse-provider-api-version.constant.ts:4-8` — `NFSE_PROVIDER_API_VERSIONS`, `DEFAULT_NFSE_PROVIDER_API_VERSION = 'v2'` e `NFSE_NATIONAL_PROVIDER_API_VERSION = 'v3'`.
- `apps/api-transportada/src/config/environment.schema.ts:216-218` — schema da variável (vazio vira padrão `v2`); `:428` expõe `nfseProviderApiVersion`.
- `apps/api-transportada/src/main.ts:1376`, `:2621`, `:2642` — a API injeta a versão nos use-cases de emissão (`createNfseInvoiceUseCase`).
- `apps/api-transportada/src/nfse-invoices/application/nfse-issuance-attempt.service.ts:240` — `buildNfseProviderConfig` grava `providerApiVersion` na tentativa (`:249`) e o `taxId` (`:250`) em `providerConfig`.
- `apps/api-transportada/src/nfse-invoices/domain/nfse-national-taxation.policy.ts:15` — `requiresNationalTaxation`: a v3 exige `nationalTaxationCode` antes de criar a nota.
- `apps/worker-transportada/src/nfse-issuance/domain/nfse-provider-api-version.policy.ts:17` — `parseProviderApiVersion` (ausente ou desconhecida = `v2`); `:26` `resolveLatestIssuanceApiVersion` (consulta, cancelamento e documentos seguem a versão da última emissão); `:63` `canReuseProviderDocumentId`.
- `apps/worker-transportada/src/nfse-issuance/application/nfse-issuance-consumer.effect.ts:119` — o consumidor recebe `providerApiVersion` no execution input e repassa à porta.
- `apps/worker-transportada/src/nfse-issuance/infrastructure/nfse-fiscal-gateway.ts:217`, `:234`, `:251`, `:269` — ramificação `if (providerApiVersion === 'v3')` por operação; o roteamento do worker é por tentativa, não por variável.
- Verificado por `rtk proxy grep`: o schema do **worker** não declara `NFSE_PROVIDER_API_VERSION` (só `NFSE_PROVIDER_BASE_URL`, `apps/worker-transportada/src/config/environment.schema.ts:100` e `:238`). A 251 não deve pôr a variável no worker.

**(c) Credencial e CNPJ**

- `apps/worker-transportada/src/nfse-issuance/infrastructure/nfse-fiscal-gateway.ts:110-118` — tipo `NfseCredentialAccess` (`companyId`, `credentialId`, `envelope`, `fiscalEnvironment`, `municipalRegistration`, `taxId`). Duplicado em `apps/worker-transportada/src/nfse-status-pull/application/nfse-fiscal-status.port.ts:14`.
- `apps/worker-transportada/src/nfse-issuance/infrastructure/drizzle-nfse-issuance-execution.repository.ts:57-62` e `:129-130` — o worker carrega `taxId` e `municipalRegistration` da linha da credencial na emissão.
- `apps/worker-transportada/src/nfse-status-pull/infrastructure/drizzle-nfse-reconciliation.repository.ts:492-494` e `:512-514` — o mesmo no status pull.
- `apps/worker-transportada/src/nfse-issuance/application/nfse-credential-secret.service.ts:40-47` — tipo e `createNfseCredentialSecretService`, que decifra o envelope (`apiToken`, `callbackToken`). Cópia da API: `apps/api-transportada/src/nfse-profiles/application/nfse-credential-secret.service.ts:46`.
- `apps/worker-transportada/src/main.ts:993-1000` e `:1512-1518` — composition root: cada gateway recebe seu `secretService` (com `envelopeKeyRing`) e o `v3Fetch` compartilhado.

**(d) Cofre do A1 (CT-e, ADR-0004) e reserva de número (ADR-0005)**

- `apps/api-transportada/src/companies/application/digital-certificate-secret.service.ts:39` — `createDigitalCertificateSecretService`, o cofre do A1 (envelope AES-GCM com AAD).
- `apps/api-transportada/src/companies/infrastructure/drizzle-digital-certificate.repository.ts:36` — `DrizzleDigitalCertificateRepository`; schema em `apps/api-transportada/src/database/digital-certificate.schema.ts`.
- `apps/worker-transportada/src/cte-issuance/infrastructure/drizzle-cte-certificate.repository.ts:11`, `:16` — `CteActiveCertificate` e `DrizzleCteCertificateRepository`, a leitura do certificado ativo pelo worker.
- `apps/api-transportada/src/companies/application/fiscal-sequence-reservation.port.ts:20` — `FiscalSequenceReservationPort.reserve` (`ReserveFiscalNumberInput` em `:6`; não li o tipo inteiro: confirmar na T1.2 se aceita o modelo da NFS-e).
- `apps/api-transportada/src/companies/infrastructure/drizzle-fiscal-sequence-reservation.repository.ts:17` — `DrizzleFiscalSequenceReservationRepository`; schema em `apps/api-transportada/src/database/fiscal-sequence.schema.ts`.
- Não existe reserva de `nDPS` para NFS-e hoje: é a T1.2.

**(e) Limitador de 1 req/s da Nota RP**

- `apps/worker-transportada/src/nfse-issuance/infrastructure/nota-rp-rate-limit.ts:11` — `createRateLimitedFetch` (fila na closure, só a largada é serializada); tipos em `nota-rp-rate-limit.types.ts:5` e `:7`.
- `apps/worker-transportada/src/main.ts:512` — `NFSE_PROVIDER_V3_MIN_INTERVAL_MILLISECONDS = 1000`.
- `apps/worker-transportada/src/main.ts:595-601` — instância única no composition root, com `clock`, `sleep` e `fetch` cru.
- Consumida pelos dois gateways: emissão em `main.ts:999` (`v3Fetch`) e status pull em `main.ts:1518` (`v3Fetch`). Confirmado em `nfse-fiscal-status.gateway.ts:90` (`fetch: dependencies.v3Fetch ?? fetch`). O limitador vale só para a v3; a v2 segue no `fetch` cru.

## O que a 251 NÃO redefine

Decisões que a 251 herda sem reabrir. Se o emissor nacional precisar de outra coisa, é emenda explícita, não reinterpretação.

- **Spec 250 e ADR-0098** (herdadas):
  - a versão é gravada **por tentativa**; `NFSE_PROVIDER_API_VERSION` vale só na API para emissões novas; consulta, cancelamento e documentos seguem a tentativa (§1);
  - o cliente é um **adaptador atrás de `NfseFiscalGateway`**; a troca é do adaptador, não do desenho assíncrono (outbox → consumidor → write-back → `nfse.status.pull`);
  - `cTribNac` e alíquota do Simples são **colunas do perfil**, congeladas no payload; o worker só lê o payload (§4);
  - idempotência por `provider_request_key` copiada na reemissão ambígua; `409` com `id_nota` vale como aceito (§5);
  - classificação de status: `not_found` **adia**, nunca `rejected` (§7);
  - limitador **único por processo**, uma réplica do worker (§8);
  - nota emitida fora do sistema se **vincula** (`external-link`), não se reemite; a vinculação vai a `pending_authorization` e o status pull autoriza (§10 e "Desenho do vínculo");
  - cancelamento: só nota com `chave_acesso`; motivos por nome (§9).
- **ADR-0029** (NFS-e municipal, confirmação por consulta):
  - a autorização se confirma por **consulta autenticada, nunca por postback**; o webhook só antecipa a consulta;
  - `pending_authorization` é estado próprio do trilho;
  - PDF/XML vão ao storage; CT-e e NFS-e são mutuamente exclusivos para a mesma NF-e.
- **ADR-0035** (um ambiente só): vale até a ADR 0099 emendá-la (T0.5). Staging segue sem NFS-e; falha no boot sem `NFSE_PROVIDER_BASE_URL` continua. A 251 não pode assumir um ambiente de homologação gratuito sem essa emenda; T0.2 e T0.3 medem isso.
- **ADR-0004** (envelope e A1): o A1 da NFS-e usa o mesmo cofre, com AAD por empresa e finalidade; sem segredo novo em claro. A T1.1 reusa o cofre, não o redefine.
- **ADR-0005** (reserva fiscal idempotente): chave estável por empresa, ledger append-only, `UPDATE ... RETURNING` na mesma transação. A T1.2 reusa o padrão para `nDPS`; não cria outro mecanismo.
- **Spec 032** (NFS-e municipal): perfil de emissão por empresa e regra de cobrança (`nfse_emission_profiles`); tomador vem do perfil; emissão assíncrona no trilho outbox; `description_template` com variáveis fechadas; credencial por empresa. **Exceção:** a escolha "Nota RP v2, não v3" da 032 está **superseded** pela ADR-0098 para a versão; o resto segue.
- **Spec 040** (Nota RP autenticada): os cabeçalhos da v2 (token + inscrição municipal) e a recusa de credencial sem inscrição municipal na entrada seguem. `X-Auth-CNPJ` da v3 vem de `taxId` (250), não de nova credencial.
- **Spec 175** (o documento que a nota espera): o perfil é fonte única do "documento" (ADR-0071); o gate de NFS-e no frontend é `nfse.issue`; o diálogo de emissão é reaproveitado. A 251 não muda a tela de emissão além do que a sua própria tarefa de UI pedir.

## Conferência de contexto

- `origin/staging` continha a pasta `specs/250-nota-rp-v3-padrao-nacional` (commit `0fb79c24c`). A branch da worktree estava `ahead 1` de `origin/staging`, sem `behind`.
- Lista de leitura: `specs/250-*/{spec,plan,tasks}.md`, `docs/adr/0098`, `0029`, `0035`, `0004`, `0005`; de 032, 040 e 175 só `spec.md`, por busca de termos NFS-e.
- Não li na íntegra `specs/250-*/evidence.md` (515 linhas) nem os ADRs 0004 e 0005 inteiros: só o outline e as decisões. Se algum ponto das seções acima for contestado, é aí que se confere.

## T0.2 — Ribeirão Preto aceita emissão direta?

**Veredito: INCONCLUSIVO, com indícios que pendem para NÃO.** Gratuidade: INCONCLUSIVA (sem fonte oficial verificável).
Acesso em 08/10/2026 a todas as fontes abaixo. A task **não** foi marcada: o portão 1 segue fechado.

### O teste que decide

O FAQ oficial "Perguntas e Respostas NFS-e v1.1 (22/09/2026)" (assunto 19.6 e 1.2) diz que a resposta está em um campo
da API de Parâmetros Municipais do ADN: `aderenteEmissorNacional`. Valor 1 = o município usa os Emissores Nacionais
(API Sefin Nacional) e a nota nasce direto na Sefin (`ambGer = 2`). Valor 0 = a emissão ocorre no sistema próprio da
prefeitura, que depois compartilha com o ADN (`ambGer = 1`); só MEI e operações do item 99 emitem nacionalmente
nesse caso. `situacaoEmissaoPadraoContribuintesRFB` diz se todo CNPJ do município já está habilitado.
O município pode estar "Ativo na Plataforma" (integrado ao ADN) sem ser "operacional" para emissão nacional.

### Tentativa de consulta ao campo (não contornada)

- `curl -m 20 https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/parametros_municipais/3543402/convenio` →
  `HTTP/1.1 403 Forbidden` (IIS, "Access is denied"). Idem em `https://sefin.nfse.gov.br/SefinNacional/...` → 403.
- `https://adn.producaorestrita.nfse.gov.br/parametrizacao/parametros_municipais/3543402/convenio` →
  `curl: (56) LibreSSL SSL_read: ... bad decrypt`.
- Leitura: a API exige certificado (mTLS), como o levantamento já previa. Não tentei contornar. **Ficou sem prova** o
  valor real de `aderenteEmissorNacional` para 3543402. Só se obtém com o A1 da empresa (T0.3/T0.4, ambiente de teste).

### Fontes oficiais

1. FAQ NFS-e v1.1, PDF do portal:
   `https://www.gov.br/nfse/pt-br/perguntas-frequentes/perguntas-e-respostas-nfs-e-v-1-1-20260922.pdf`.
   Sustenta a regra acima (campo, valores, fluxo recomendado: valor 1 → Sefin; valor 0 → webservice local da prefeitura).
   Não afirma nada sobre Ribeirão Preto.
2. Prefeitura de Ribeirão Preto, aviso de 08/05/2026:
   `https://www.ribeiraopreto.sp.gov.br/portal/noticia/prefeitura-atualiza-sistema-da-nfs-e-e-prorroga-prazo-para-adequacao-ao-novo-padrao-nacional`.
   Sustenta: quem usa sistema próprio via webservice deve se adequar; ABRASF deixa de valer em 01/07/2026 e só DPS no
   padrão novo é aceita; prazo de homologação até 30/06/2026. O webservice de teste citado é do provedor IssNet
   (`nfse.issnetonline.com.br/wsnfsenacional/homologacao/nfse.asmx`), **não** do ADN/Sefin. Não menciona o Emissor Nacional.
3. Prefeitura de Ribeirão Preto, página de NF-e:
   `https://www.ribeiraopreto.sp.gov.br/portal/fazenda/nota-fiscal-eletronica`.
   Sustenta: a Prefeitura "não fornece emissor de nota fiscal" (Decreto Municipal 176/2020); NFS-e passa pelo ISS.Net
   Online. Não cita Emissor Nacional nem convênio. Indício de que o município **segue por provedor próprio** (valor 0).
4. Portal gov.br/nfse, municípios: `https://www.gov.br/nfse/pt-br/municipios-aderentes/municipios-aderentes` e
   `https://www.gov.br/nfse/pt-br/municipios`. A página diz que municípios com mais de 500 mil habitantes aderiram e
   aponta uma planilha; não lista Ribeirão Preto, não define "aderente" e não trata de gratuidade. Não consegui abrir a
   planilha. Ribeirão Preto tem menos de 500 mil habitantes (dado meu, não da página): não é coberta por esse corte.

### Fontes não oficiais (apenas indício)

- Fornecedor/blog `https://notagateway.com.br/?p=12415`: repete o aviso da Prefeitura (assina "Fonte: Prefeitura"); não cita o Emissor Nacional.
- Resultado de busca de terceiros listou 3543402 sob "Emissor Nacional", em tabela ilegível; **não confiável**.
- Focus NFe: descreve Ribeirão Preto por IssNet/ABRASF; pode estar defasado.

### Gratuidade

- Nenhuma página oficial acessível afirma por escrito que o emissor é gratuito: a home do portal e `/municipios` não
  trazem a palavra, a página do FAQ web exige login ("Conteúdo Restrito"), e o PDF do FAQ só usa "gratuita" para a
  Nota Fiscal Fácil do MEI. Um trecho de busca atribuía ao portal a frase "sistema próprio e gratuito" para o
  contribuinte, mas não consegui abrir a página para confirmar. **Sem prova oficial; tratar como INCONCLUSIVO.**

### O que fica pendente

1. Valor de `aderenteEmissorNacional` e `situacaoEmissaoPadraoContribuintesRFB` para 3543402 (exige mTLS).
2. Planilha oficial de municípios do portal (link a partir de `/municipios/monitoramento-adesoes`).
3. Confirmação por escrito da Secretaria Municipal da Fazenda de Ribeirão Preto (qual canal recebe a DPS do contribuinte).
4. Página oficial de gratuidade. Se 1 voltar 0, abrir ADR "não faremos" (aceite da T0.2) ou refazer o escopo para o
   webservice IssNet no padrão nacional.

### Fechamento do Portão 1 (08/10/2026)

O usuário informou no chat que **já há confirmação de que a prefeitura atende a emissão nacional**. Essa é a prova
aceita para o Portão 1; ela supera os indícios para NÃO acima (aviso de 08/05/2026 e ISS.Net), que ficam como contexto.
A origem da confirmação (documento ou e-mail da Fazenda) será anexada pelo usuário quando disponível. Pendências que
seguem, sem bloquear: valor de `aderenteEmissorNacional` para 3543402 (mTLS, T0.3/T0.4) e página oficial de gratuidade.

## T0.3 — Contrato do Sistema Nacional (08/10/2026)

**Resultado: PARCIAL.** Rotas, quem recebe a DPS, mTLS e regra de certificado vêm de fonte oficial (manuais, XSD 1.01, FAQ v1.1). O
corpo JSON (nomes dos campos, GZip+Base64) e os status HTTP só têm fonte não oficial. A task segue aberta. Detalhe em `plan.md` § "Contrato do Sistema Nacional (T0.3)".

### Fontes tentadas

| #   | Fonte                                                                                                     | Resultado                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | `curl` Sefin restrita `…/API/SefinNacional/docs/index`, `swagger/v1/swagger.json`, `docs/v1/swagger.json` | 403 IIS "Access is denied" nas três. Sem certificado; não contornado.                                          |
| 2   | `curl` ADN restrita `…/contribuintes/docs/index.html`, `swagger/v1/swagger.json`, `docs/v1/swagger.json`  | `curl (56) … bad decrypt` (handshake exige certificado); o corpo mostrado era resíduo, 403. Idem produção.     |
| 3   | Produção `sefin.nfse.gov.br/sefinnacional/docs/index`, `adn.nfse.gov.br/contribuintes/docs/index.html`    | 403 / mesmo erro TLS.                                                                                          |
| 4   | `adn.producaorestrita…/danfse/docs/index.html` e `swagger.json`                                           | Mesmo erro TLS.                                                                                                |
| 5   | gov.br/nfse "Documentação Atual" (lista de arquivos) [O]                                                  | OK. Lista manuais v1.2, XSD 1.01, Anexos I a V.                                                                |
| 6   | Manual Contribuintes Emissor Público API v1.2 (PDF, 188 KB) [O]                                           | OK. Rotas da Sefin, síncrono, DPS substitutiva, eventos. Sem corpo JSON, sem mTLS, sem erros, sem limites.     |
| 7   | Manual Contribuintes APIs do ADN v1.0 (12/02/2026, PDF) [O]                                               | OK. `GET /DFe/{NSU}` e `GET /NFSe/{ChaveAcesso}/Eventos`.                                                      |
| 8   | Manual Emissão por Decisão Administrativa/Judicial v1.0 (PDF) [O]                                         | OK. `POST /decisao-judicial/nfse`; fora do escopo.                                                             |
| 9   | FAQ NFS-e v1.1 (22/09/2026, PDF) [O]                                                                      | OK. §§ 17.1–17.8 (certificado, E0717/E0718, sem procuração, DANFSe sobrestado), 18.1–18.6 (série, nNFSe), 6.7. |
| 10  | Pacote XSD 1.01 de 09/02/2026 (zip, 65 KB) [O], lido em diretório temporário                              | OK. `TSIdDPS`, `TSSerieDPS`, `TSNumDPS`, eventos 101101/105102/105104, `versao` 1.00/1.01.                     |
| 11  | Anexo I v1.01 (xlsx) [O], textos de regra                                                                 | OK. Assinatura obrigatória na API, certificado do emitente, regras do certificado. Sem algoritmos.             |
| 12  | Cópia pública do `swagger.json` da Sefin (`github.com/ItargetLabs/sefin-sdk`, MIT) [NO]                   | OK. Rotas, campos `dpsXmlGZipB64`/`nfseXmlGZipB64`/`pedidoRegistroEventoXmlGZipB64`, erros, status HTTP.       |
| 13  | README do mesmo SDK [NO]; `github.com/pedrocasado/nfse-php`, fórum ACBr, notagateway (só via busca) [NO]  | Confirmam GZip+Base64 e RSA-SHA1 em eventos; E999/RNG9999. Não verificados a fundo.                            |
| 14  | Anexo II (Guia APIs) achado por busca [O]                                                                 | É da **NFS-e Via** (pedágio), não da nacional. Descartado.                                                     |

### Fechamento

- (a) quem recebe, (b) rotas e (d) autenticação: sustentados por fonte oficial.
- (c) corpo e resposta: **só [NO]**. Por isso a T0.3 **não** foi marcada.
- Arquivos baixados ficaram só no diretório temporário da sessão; nada foi para o repositório.
