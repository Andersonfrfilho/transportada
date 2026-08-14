# 037 — Tasks

Uma task por vez. Teste de contrato **antes** da implementação. Evidência em `evidence.md`.
Arquivo de teste novo entra na lista literal do `package.json` da app, ou não roda.

Fases A e B são no repositório `~/Documents/personal/adatechnology-packages`. Publicação é por
**changeset + GitHub Actions** — nunca `npm publish` local, nunca editar `version` à mão.

## Fase 0 — a norma

> 🤖 Modelo: `sonnet` — leitura e registro; nada de código

- [x] **T000** — Ler a Nota Técnica Conjunta DF-e 2025.001 e a NT 2026.004 e colar em
      `evidence.md`: (a) o trecho do cálculo do DV do CNPJ alfanumérico com os pesos, (b) o trecho
      do DV da chave de acesso, (c) a confirmação de que o valor do caractere é `charCodeAt - 48`,
      (d) pelo menos um par CNPJ/DV e um par chave/DV publicados. Sem isso, nenhuma linha da Fase A
      é escrita — a regra do repositório é não implementar sobre suposição.
      Verificação: os quatro itens em `evidence.md`, com fonte e data. **Feito** — três fontes
      (RFB P&R, SERPRO, NT 2025.001 com Anexos I e II), exemplo oficial `12.ABC.345/01DE-35`
      conferindo, e 200.000 chaves numéricas aleatórias sem divergência contra o cálculo atual.
      Cinco correções à spec registradas em `evidence.md` § (f).

## Fase A — `fiscal-provider`: a primitiva e o XML

> 🤖 Modelo: `opus` 🧠 — é geração de documento fiscal assinado; erro aqui sai pelo fio

- [x] **T001** — Contrato `test/contract/sefaz-tax-id.contract.test.ts` (escrito antes) sobre a
      primitiva que ainda não existe: `charValue` para `'0'`, `'9'`, `'A'`, `'Z'`;
      `normalizeTaxId` tirando `[./-]` e espaço e subindo caixa, e **não** removendo letra;
      `calcularDvCnpj` devolvendo `35` para `12ABC34501DE` (exemplo oficial) e conferindo com
      `11222333000181`, `19131243000197` e `00000000000191`; `calcularDvChave` idem, mais a
      equivalência com o cálculo atual sobre chave numérica; `CNPJ_PATTERN` e `CHAVE_PATTERN`
      aceitando o alfanumérico e rejeitando minúscula, comprimento errado, DV não numérico, letra
      fora de `A-Z` e o CNPJ zerado `00000000000000`.
      Verificação: vermelho pelos motivos certos.
- [x] **T002** — `src/sefaz/SefazTaxId.ts` com as seis exportações.
      Verificação: T001 verde.
- [x] **T003** — Contrato de não-regressão `test/contract/xml-numeric-baseline.contract.test.ts`:
      congela o XML gerado hoje para um conjunto de CNPJs numéricos (NF-e, CT-e e MDF-e).
      Verificação: verde **antes** de qualquer mudança em builder — é a linha de base.
- [x] **T004** — Eliminar as três cópias do módulo 11 (`SefazChave.ts:56`,
      `CteXmlBuilder.ts:11-21`, `MdfeXmlBuilder.ts:29-39`) e os três
      `replace(/\D/g,'').padStart(14,'0')` (`SefazChave.ts:28`, `CteXmlBuilder.ts:34`,
      `MdfeXmlBuilder.ts:51`). O `padStart` sai junto: CNPJ que não fecha 14 depois de normalizar é
      erro, não é valor a completar com zero.
      Verificação: T003 continua verde (XML numérico idêntico); T001 verde.
- [x] **T005** — Contrato `test/contract/chave-alfanumerica.contract.test.ts`: `buildChaveAcesso`
      com CNPJ `12ABC34501DE35` devolve chave cujas posições 6–17 são exatamente esse CNPJ, e
      `isChaveDvValid` aceita essa chave e rejeita a de DV trocado. Hoje esse caso produz
      `35260800000123450135550010000000011521914221`, com `00000123450135` no lugar do CNPJ.
      Verificação: vermelho.
- [x] **T006** — `isChaveDvValid` por `CHAVE_PATTERN`; os seis sítios de validação de chave
      (`SefazNfeProvider.ts:169-178`, `SefazNfceProvider.ts:217-226`,
      `SefazMdfeProvider.ts:20,52-53,71-72`, `NfeDistribuicaoProvider.ts:284-287`,
      `NfeXmlImporter.service.ts:27,454`, `SefazQrCodeVerifier.ts:90,102-106`) idem, mais
      `SefazDocumentOps.ts:41,67`, encontrado na execução e da mesma classe de defeito.
      Verificação: T005 verde; T003 verde.
- [x] **T007** — Os ~18 pontos de montagem de XML que fazem `replace(/\D/g,'')` sobre CNPJ passam a
      `normalizeTaxId` (`SefazXmlBuilder.ts:30,129`, `NfeXmlBuilder.ts:63,67-68`,
      `SefazSoapClient.ts:175,507,541-546`, `CteSoapClient.ts:114`,
      `CteXmlBuilder.ts:74,150,196,262,307`, `MdfeXmlBuilder.ts:63`, `SatProvider.ts:110,115`,
      `controlid-cupom.ts:256,263`, `NfseProvider.ts:178,252,265,297`, `NotaRpNfseProvider.ts:94`).
      Os que tocam CPF, CEP ou telefone **não** são tocados — a lista de exclusão vai para
      `evidence.md`.
      Verificação: T003 verde; um caso alfanumérico atravessando cada builder.
- [x] **T008** — `collectRelatedCnpjs` (`NfeXmlImporter.service.ts:28,379`) deixa de descartar CNPJ
      com letra; `NfeDistribuicaoProvider.ts:164-166,231-232,270,292,374,382` e
      `CertificateValidator.ts:168-170,180-181` normalizados dos dois lados. O parsing do sujeito do
      certificado saiu para `parseIcpBrasilSubject`, exportada e pura, para poder ser testado sem PFX.
      Verificação: contrato de importação com emitente alfanumérico verde.
- [x] **T009** — `LogObfuscator.ts:1-6,15-20,24` — CNPJ alfanumérico não passa em `rawResponse`.
      Máscaras sem guarda de conjunto (`DanfceBuilder.ts:29-32`, `controlid-cupom.ts:317-323`,
      `CupomPdfBuilder.ts:29-33,40-43,212`) ganham a guarda.
      Verificação: contrato com CNPJ alfanumérico no corpo de resposta, redigido.
      As três cópias da pontuação viraram `formatCnpjForDisplay` em `SefazTaxId.ts` — era o mesmo
      defeito escrito três vezes, duas delas sem guarda nenhuma.
- [x] **T010** — `test/contract/mdfe-sefaz-wire.contract.test.ts:45` ganha o caso alfanumérico ao
      lado do numérico. Changeset escrito; release pelo GitHub Actions.
      Verificação: pacote publicado, versão anotada em `evidence.md`.
      Publicado `@adatechnology/fiscal-provider@0.3.0-rc.7`. O contrato do MDF-e nasceu verde — é
      guarda de regressão da chave, não correção — e mesmo assim foi provado por perturbação. O
      release foi cherry-pick isolado para `main`: o `changeset version` local tinha consumido um
      changeset de catálogo cujo código estava fora deste commit.

## Fase B — `logger`: redação

> 🤖 Modelo: `sonnet`

- [x] **T011** — Contrato de redação (escrito antes) com **duas** listas: o que tem de ser redigido
      (CNPJ numérico, CNPJ alfanumérico, CNPJ mascarado, chave numérica, chave alfanumérica) e o
      que **não** pode ser redigido (hash, UUID sem hífen, id opaco, palavra de 14 letras). A
      segunda lista é o ponto: padrão frouxo apaga diagnóstico.
      Verificação: vermelho na primeira lista, verde na segunda.
      23 pass · 5 fail, e as 5 são a lista positiva. Da lista negativa, só o id opaco de 14 posições
      pressiona o desenho — hash e UUID caem por comprimento, e palavra de 14 letras cai pelos dois
      dígitos finais. É ele que obriga o DV a ser a evidência na forma crua alfanumérica.
- [x] **T012** — `src/redact.ts:44,45,50` — os três padrões. Changeset e release.
      Verificação: T011 verde; versão em `evidence.md`.
      48 pass · 0 fail, `tsc --noEmit` e `tsup` limpos. Chave e CNPJ pontuado alargam pela forma; a
      forma crua alfanumérica exige DV, e o numérico continua sem conferir DV (mudar aquilo seria
      regressão). Provado por perturbação: sem a checagem, os 2 testes da lista negativa falham.
      Publicado `@adatechnology/logger@0.1.0-rc.1` (commit `6e2c894`, run `31831556713`).

## Fase C — `api-transportada`: banco

> 🤖 Modelo: `sonnet`

- [x] **T013** — Contrato: os `test/*-schema/*.contract.ts` que já listam colunas e checks passam a
      exigir o padrão novo nos 11 CHECK de CNPJ e nos 5 de chave; os CHECK de **CPF** ficam
      explicitamente inalterados no contrato, para que afrouxá-los por engano falhe.
      `test/database-migration/static-migration.contract.ts` recebe o diretório novo, com asserts
      de aditividade e de rollback guardado.
      Verificação: vermelho.
      242 pass · 20 fail. Inventário real contado no schema: **10** CHECK de CNPJ e **7** de chave
      (o `ACCESS_KEY_PATTERN` do MDF-e é uma constante em duas tabelas). Contrato novo em
      `test/tax-id-pattern/`, varrendo todas as tabelas do agregado; o teste de CPF passou já no
      vermelho, que é o ponto dele.
- [x] **T014** — Relaxar os CHECK em `company-fiscal-profile.schema.ts:127,153-155`,
      `digital-certificate.schema.ts:75`, `billing.schema.ts:110-113`,
      `fleet.schema.ts:186-189,241-244`, `mdfe.schema.ts:257`, `nfse.schema.ts:292,367`,
      `cte-emission-profile.schema.ts:251-254` (os dois ramos), `nfe.schema.ts:228,316,515`,
      `cte-issuance.schema.ts:215`, `billing.schema.ts:194`, `mdfe.schema.ts:121`.
      `db:generate --name tax_id_alphanumeric`; `rollback.sql` à mão.
      Verificação: `make migration-test` e `db:check` sem drift; T013 verde.
      17 CHECK alargados num único `ALTER … DROP CONSTRAINT, ADD CONSTRAINT` cada;
      `db:check` sem drift, `make migration-test` 66 pass, contratos de schema 165 pass. Ciclo
      migrar → inserir CNPJ alfanumérico → `rollback.sql` → migrar de novo rodado num banco
      `rollback_probe` descartável: a guarda por nome e hash do journal casou e os padrões
      numéricos voltaram. CHECK de CPF intocado nos dois sentidos.

## Fase D — `api-transportada`: fronteira e domínio

> 🤖 Modelo: `sonnet`

- [x] **T015** — Contrato de fronteira (escrito antes): CNPJ alfanumérico atravessa `POST`/`PUT`/
      `GET` de empresa, perfil de emissão, veículo, proprietário, seguradora, credencial de NFS-e e
      fatura; minúscula na entrada volta maiúscula no `GET`; caractere fora de `[A-Z0-9]` é `400`.
      Verificação: vermelho.
      _Sete fronteiras em `test/tax-id-boundary/{request-bodies,query-filters}.contract.ts`,
      entrypoint na lista literal do `package.json`. Vermelho registrado: `1 pass / 10 fail`; o
      único verde é a recusa de `12ABC34501DE3!`, que hoje já é `400`._
- [x] **T016** — `shared/tax-id.service.ts` reexportando a primitiva do pacote (molde de
      `shared/rntrc.service.ts` — nenhum módulo importa `src/sefaz/*` direto); versão nova do
      `fiscal-provider` no `package.json`; os ~12 schemas Zod com o padrão novo e
      `.transform(normalizeTaxId)`.
      Verificação: T015 verde.
      _12 arquivos: 8 schemas de fronteira + 3 políticas de domínio + o gateway de certificado. Os
      construtores Zod saíram para `shared/tax-id.schema.ts` para o domínio não importar zod.
      `fiscal-provider` 0.3.0-rc.7. T015 `11 pass / 0 fail`; suíte da api `2445 pass / 1 fail`
      (falha anterior de `deploy/service-naming`)._
- [x] **T017** — Contrato: busca de perfil fiscal por CNPJ alfanumérico encontra a empresa. Hoje
      `fiscal-company-profile-lookup.gateway.ts:19,26,43-45` apaga a letra antes de buscar e não
      encontra nada.
      Verificação: vermelho, depois `onlyDigits` removido e verde.
      _O `consultarCnpj` do rc.7 já aceita alfanumérico; a mutilação era só na volta —
      `12ABC34501DE35` virava `123450135`. Uma linha (`onlyDigits` → `normalizeTaxId` do seam);
      `onlyDigits` fica para CEP e código de município. Contrato em
      `test/company-settings-application/company-profile-lookup.contract.ts`: vermelho
      `29 pass · 4 fail`, verde `33 pass · 0 fail`. Suíte da api `2451 pass · 1 fail` (falha
      anterior de `deploy/service-naming`)._
- [x] **T018** — `nfe-documents.routes.ts:200` (`/^[0-9]{44}\.xml$/`) por `CHAVE_PATTERN`; guarda
      de conjunto nas duas máscaras (`dacte-format.policy.ts:78-89`,
      `invoice-layout.policy.ts:247-256`) — continuam duplicadas de propósito; comentário
      desatualizado de `dacte-barcode.gateway.ts:21` corrigido — o item 6 da NT 2025.001 diz que o
      CODE-128C "não é compatível" com chave alfanumérica e publica as regras de alternância para o
      Code Set A; o `bwip-js` já faz essa alternância, e o contrato passa a provar isso em vez de
      confiar na observação.
      Verificação: DACTE e relatório de fatura com CNPJ alfanumérico impressos sem embaralhar
      posição; código de barras de chave alfanumérica renderizado e decodificado; contratos de
      tenant-safety verdes.
      _A máscara do DACTE filtrava não-dígito antes de medir: `12ABC345000135` saía
      `123.450.001-35`, um CNPJ impresso sob máscara de CPF. A da fatura media sem filtrar, então
      acertava o alfanumérico por acidente e aceitava qualquer coisa com catorze caracteres. As duas
      passam a normalizar e casar `CNPJ_PATTERN`/`CPF_PATTERN`. O `bwip-js` já alterna Code Set —
      contrato novo decodifica o símbolo com tabela ISO/IEC 15417 própria. Suíte da api
      `2467 pass · 14 skip · 1 fail` (falha anterior de `deploy/service-naming`)._

## Fase E — `worker` e `cron`

> 🤖 Modelo: `sonnet`

- [x] **T019** — Contrato: item de distribuição com `chNFe` alfanumérico é importado, não
      descartado (`nfe-distribution-item.mapper.ts:19,23,130`); descarte por qualquer outro motivo
      registra a razão em log — hoje é silencioso.
      Verificação: vermelho.
      `43 pass / 4 fail`. _Correção à task:_ o pulo **já** registra razão (`logSkip` com `reason`,
      `nsu`, `schema`). Silencioso é o resumo que é **gravado sem chave** — não entra em
      `skippedCount`, some da deduplicação e não deixa rastro; ganhou log próprio no contrato.
- [x] **T020** — Os dois padrões do mapper; `nfe-import-consumer.service.ts:320`
      (`accessKey.slice(6,20) === companyCnpj`) e
      `drizzle-nfe-distribution-profile.repository.ts:85-86` com os dois lados canonicalizados.
      Verificação: T019 verde; `make worker-integration` verde.
      Exigiu bump do worker de `fiscal-provider` rc.6 → rc.7 (rc.6 não exporta as primitivas) e o
      seam `worker/src/shared/tax-id.service.ts`. Suíte `449 pass / 0 fail`; integração
      `39 pass / 0 fail`.
- [x] **T021** — Conferir as **cópias por valor** contra a API depois da Fase C:
      `worker/src/database/processing.schema.ts`, `cte-issuance-execution.schema.ts`, e no cron as
      quatro cópias do trilho de NFS-e mais `nfse-reconciliation.schema.ts`. Diferença encontrada
      vai para `evidence.md`, corrigida ou justificada.
      Verificação: contratos de paridade que já existem, verdes.
      ↳ A Fase C não tinha contraparte nas cópias: a migration é só CHECK, e cópia não declara
      CHECK. A conferência foi coluna a coluna nas **16** cópias de schema (o `CLAUDE.md` cita 3;
      correção no T025), não só nas citadas: nenhuma coluna fantasma, uma divergência de tipo real
      (`nfse_issuance_attempts.attempt_number`, `mode: 'number'` no cron → `'bigint'`), corrigida.
      Cron `151 pass / 0 fail`, worker `449 pass / 0 fail`, `companies.contract` da API
      `71 pass / 0 fail`.

## Fase F — `frontend-transportada`

> 🤖 Modelo: `sonnet`

- [x] **T022** — Contrato: campo de CNPJ aceita letra, mostra em maiúscula enquanto se digita sem
      mover o cursor, `maxLength` segue 14, e o erro de conjunto aparece separado do de
      comprimento.
      Verificação: vermelho.
      ↳ `test/shared/alphanumeric-tax-id.contract.ts`, registrado em `test/shared.contract.test.ts`.
      **44 fail / 45 pass** na suíte, **44 fail / 1175 pass** no frontend inteiro — todo o vermelho é
      do contrato novo. "Sem mover o cursor" virou propriedade conferível: subir a caixa preserva o
      comprimento em todo prefixo digitado. `inputMode="numeric"` nos três campos de CNPJ virou
      defeito (o teclado do celular não tem letra) e o contrato o proíbe, mantendo o do CPF.
- [x] **T023** — `companySettingsMask.service.ts:6-8,11-19,51-67`,
      `companySettingsFormValidation.service.ts:57-71`,
      `nfseCredentialForm.service.ts:16,54-57` (fica em `src/modules/nfse-invoice/shared/`, não em
      `company-settings/shared/` como este texto dizia),
      `pixKeyType.service.ts:10-14,24-31,35-40` (só o ramo CNPJ), e as cópias de
      `replace(/\D/g,'')` **onde o valor é CNPJ** (`MdfeDefaultsFields:26`,
      `BillingDefaultsFields:42`, `MdfeManifestLotacaoFields:21`, `fleetForm.service.ts:72`,
      `CompanySettingsForm.component.tsx:74`, `useCompanyWizard.hook.ts:50`). `rntrc.service.ts:11`
      e as de CPF/CEP/telefone ficam. Cria o seam `src/modules/shared/taxId.service.ts`
      (`CNPJ_LENGTH`, `CNPJ_PATTERN`, `hasValidCnpjCharacterSet`, `normalizeTaxId`), a razão
      `characterSet` com `validationCharacterSet` nos dois locales, e tira `inputMode="numeric"` dos
      quatro campos de CNPJ (`DriverForm:70`, `VehicleOwnerFields:42`, `CteProfileMatcherFields:45`,
      `CompanyProfileFields:33` — neste, sem devolver `maxLength` ao campo, que corta em silêncio).
      Verificação: T022 verde; `test/fleet/presentation-boundaries.contract.ts:28` verde.
      Feito: 1219 pass / 0 fail. `BillingDefaultsFields:42` **não** era CNPJ (código e agência de
      banco) e ficou como estava; em compensação apareceram dois campos de CNPJ que o texto não
      listava — `NfseCredentialPanel:150` (o CNPJ da credencial da prefeitura) e
      `NfseInvoiceFilters:49` (o filtro `takerTaxIdEq`, que compara com o valor canônico gravado).
      Em `CompanyProfileFields` o `inputMode` acumulava três papéis (teclado, normalização e
      `maxLength`); o CNPJ precisava de dois deles sem o primeiro, então a definição ganhou
      `normalize: 'digits' | 'taxId'` e o `maxLength` passou a sair dela.

## Fase G — fechamento

> 🤖 Modelo: `sonnet`

- [x] **T024** — Ponta a ponta com uma NF-e de terceiro de emitente alfanumérico: distribuição →
      importação → lote → emissão de CT-e → DACTE → fatura, e o log da corrida inteira conferido
      por CNPJ e chave em texto puro.
      Verificação: evidência da corrida em `evidence.md`; nenhum documento em claro no log.
- [x] **T025** — `CLAUDE.md` com a regra do documento canonicalizado (padrão, onde a
      canonicalização acontece, e o que continua sendo por comprimento).
      Verificação: `make check` verde.

## Depois desta spec

- **036 — tela inicial de avisos**: independente; não toca em documento.
- **Validação de DV de CNPJ no cadastro**: hoje não existe em `api-transportada` (verificado — não
  há nenhuma função de dígito verificador na app). Introduzir junto com esta mudança confundiria a
  causa de qualquer rejeição nova; é decisão de produto separada, e a primitiva da Fase A já
  entrega o cálculo pronto.
