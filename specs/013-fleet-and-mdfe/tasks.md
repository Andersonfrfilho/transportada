# Tasks

Feature 013 — Frota, condutores e MDF-e. Fecha a `T026` da feature 012.
Regra do repo: teste de aceite/contrato antes da implementação; task só fecha com evidência em
`evidence.md`.

## Fase A — Pacote fiscal

- [x] T001 Evento de encerramento MDF-e (110112) no `@adatechnology/fiscal-provider`: `nProt`,
      `dtEnc`, `cUF` e `cMun` de encerramento, assinatura do `infEvento`, `MDFeRecepcaoEvento`,
      `procEventoMDFe` devolvido em `xmlEvento` — `src/sefaz/MdfeEventoXmlBuilder.ts`,
      `MdfeSoapClient.ts`, `SefazMdfeProvider.ts` — `test/contract/mdfe-evento-wire.contract.test.ts`
- [x] T002 Evento de cancelamento MDF-e (110111) com `nProt` + justificativa ≥ 15, mesmo caminho —
      substitui o `MDFE_EVENTO_NAO_SUPORTADO` de `SefazMdfeProvider.cancel` — mesmo arquivo de teste

## Fase B — Identidade

- [x] T003 Papel `driver` e permissões novas (`fleet.*`, `mdfe.*`, `trip.*`) — `COMPANY_ROLES`,
      `TRANSPORTADA_PERMISSIONS`, `COMPANY_ROLE_PERMISSIONS`, check constraint de `membership_roles`,
      migration + rollback, contrato do realm em `realm/` — `test/identity-*/*.contract.ts`
- [x] T004 [P] Allowlist do frontend em sincronia (`COMPANY_PERMISSIONS`) e papel `driver` no
      view-model de sessão — `apps/frontend-transportada/src/modules/identity/**` — teste de contrato

## Fase C — Frota

- [x] T005 Schema `fleet_vehicles` + `fleet_drivers` + `fleet_driver_vehicle_assignments` —
      `src/database/fleet.schema.ts`, `database.schema.ts`, migration + rollback —
      `test/fleet-schema/*.contract.ts` (colunas, constraints, unicidade de placa e CPF por empresa,
      tenant-safety)
- [x] T006 Application + rotas `/fleet/vehicles` e `/fleet/drivers` (list, create, patch) com trava
      otimista e vínculo motorista↔membership — `src/fleet/**`, `main.ts` —
      `test/fleet-http/*.contract.ts`
- [x] T007 [P] Frontend: página de frota (veículos e motoristas) com client, validação, i18n PT/EN e
      CSS module — `src/modules/fleet/**`, `src/main.tsx` — teste de contrato do client

## Fase D — Modelagem do manifesto

- [x] T008 Schema `mdfe_manifests` + `mdfe_manifest_drivers` + `mdfe_manifest_items` +
      `mdfe_manifest_loading_cities` + `mdfe_fiscal_documents` + `mdfe_issuance_attempts` +
      `mdfe_issuance_events` + `mdfe_issuance_outbox` — `src/database/mdfe.schema.ts`, migration +
      rollback — `test/mdfe-schema/*.contract.ts` incluindo o unique parcial de CT-e em manifesto vivo
- [x] T009 [P] Domínio da elegibilidade: CT-e `authorized`, sem manifesto vivo, mesma empresa —
      `src/mdfe-manifests/domain/mdfe-manifest-eligibility.policy.ts` — teste puro antes
- [x] T010 [P] Domínio do estado: transições `draft → issuing → authorized → closed` com `rejected` e
      `cancelled`; encerrado não cancela — `src/mdfe-manifests/domain/mdfe-manifest-state.policy.ts` —
      teste puro antes
- [x] T011 `mdfe-payload.builder.ts` — manifesto + perfil fiscal + veículo + condutores → `MdfeData`,
      com `UFIni`/`UFFim` derivados, agrupamento por município de descarga e totais congelados —
      `src/mdfe-manifests/domain/` — **golden test** campo a campo

## Fase E — API do manifesto

- [x] T012 `POST /mdfe-manifests/preview` — prévia sem persistir: municípios derivados dos CT-es,
      totais, bloqueios com motivo — `src/mdfe-manifests/{application,presentation}/*` — teste de
      contrato
- [x] T013 `POST /mdfe-manifests` + `GET /mdfe-manifests` + `GET /mdfe-manifests/:id` com escrita
      transacional dos itens, condutores e municípios — teste de contrato + tenant-safety
- [x] T014 `POST /:id/issue`, `POST /:id/close`, `POST /:id/cancel` — attempt + evento de outbox +
      202, `Idempotency-Key`, sem chamar SEFAZ no request — teste de contrato

## Fase F — Worker

- [x] T015 Trilho `mdfe-issuance.v1` (main/retry/dead) + envelope Zod versionado + cópia do schema
      Drizzle — `apps/worker-transportada/src/messaging/**`, `src/database/**` — contract test do
      envelope e da topologia
- [x] T016 Gateway MDF-e + consumer: resolve input pela linha, emite/encerra/cancela, guarda XML em
      storage create-only e faz write-back — `apps/worker-transportada/src/mdfe-issuance/**` —
      contract test com provider fake

## Fase G — Frontend do manifesto

- [x] T017 Página de manifestos: tabela conforme `docs/frontend/data-tables.md`, criação a partir de
      CT-es autorizados com prévia, ações transmitir/encerrar/cancelar com justificativa —
      `src/modules/mdfe-manifest/**` — teste de contrato do hook e do client

## Fase H — Fechamento

- [x] T018 `make check` verde ponta a ponta, `make migration-test`, evidência consolidada em
      `evidence.md` e `T026` da feature 012 marcada como concluída apontando para esta feature

## Fase I — Carga lotação, contratante, pagamento e seguro (aberta pela homologação na SVRS)

Rejeições reais da SVRS (`726`, `578`, `302`, `580`, `698`) provaram que o manifesto não autoriza em
carga lotação sem esses grupos. Cada task nasceu de um teste vermelho.

- [x] T019 Colunas de lotação/contratante/frete/seguro em `mdfe_manifests` e defaults de MDF-e em
      `company_settings` (responsável pelo seguro, seguradora, CNPJ/CPF, apólice, banco, agência,
      chave PIX) — `src/database/{mdfe,companies}.schema.ts`, migration
      `20260728201709_mdfe_lotacao_contratante_pagamento_seguro` + rollback —
      `test/mdfe-schema/*.contract.ts` e `test/database-migration/mdfe-constraints.assertion.ts`
- [x] T020 Defaults de MDF-e em `PATCH /companies/settings` e `GET /companies/settings`: port,
      use-case com trava otimista, mapper, mutation, repositório, rota e Zod —
      `src/companies/**` — `test/company-settings-application/*.contract.ts` e
      `test/company-settings-http/*.contract.ts` (validação, auditoria sem dado sensível)
- [x] T021 `mdfe-payload.builder.ts` emitindo `infContratante` (dentro do `infANTT`, após o `RNTRC`),
      `infLotacao` (dentro do `prodPred`, após o `NCM`), `infPag` com `infBanc` e `seg` — mais
      `POST /mdfe-manifests` aceitando contratante, CEPs de carregamento/descarregamento, valor do
      frete e averbação — `src/mdfe-manifests/**` — **golden test** campo a campo
- [x] T022 Frontend em sincronia: bloco "Seguro e pagamento do MDF-e" nas configurações da empresa e
      bloco "Carga lotação" na criação do manifesto, com normalização do valor do frete para duas
      casas sem float binário — `src/modules/{company-settings,mdfe-manifest}/**` — contratos do
      client, do form service e das allowlists de resposta

- [x] T025 Pendências herdadas: `activeCertificate` sempre `null` removido do contrato de
      `GET /companies/settings`; `POST /cte-batches` passando a devolver o `itemCount` real; RNTRC
      validado como 8 dígitos na borda, alinhado às constraints de `mdfe_manifests` e
      `fleet_vehicles` — `src/{companies,cte-batches}/**`, `src/modules/company-settings/**` —
      contratos de aplicação e HTTP

## Fase J — Pendências externas (bloqueadas fora do repositório)

- [x] T023 Publicar `@adatechnology/fiscal-provider@0.3.0-rc.3` (exige `npm login` do usuário) e subir
      a versão em `apps/api-transportada/package.json` e `apps/worker-transportada/package.json` — a
      `rc.2` instalada não expõe nenhum símbolo de MDF-e
- [x] T024 Ligar `createProvider` de MDF-e no worker: fábrica
      `adatechnology-mdfe-fiscal-provider.factory.ts` espelhando a de CT-e e injeção em
      `createMdfeIssuanceWorkerEffect` (`apps/worker-transportada/src/main.ts`) — depende de T023

## Fase K — E2E do produto contra a SEFAZ

- [x] T027 Certificado com `purpose = 'mdfe'`: o worker busca
      `digital_certificates.purpose = 'mdfe'`, mas a check constraint aceita só `'cte'` e a rota de
      upload rejeita qualquer outro valor — nenhuma emissão de MDF-e consegue sair hoje. Estender
      `CERTIFICATE_PURPOSES`, constraint (migration + rollback), `POST`/`DELETE`
      `/companies/digital-certificates` e o upload do frontend —
      `apps/{api,frontend}-transportada/**` — `test/digital-certificates-http/*.contract.ts`,
      `test/digital-certificate-application/*.contract.ts`, `test/certificate-schema/*.contract.ts`
- [x] T028 MDF-e autorizado em homologação pelo caminho do produto (API → outbox → worker → SVRS),
      espelhando o E2E de CT-e da T022 da feature 012 — evidência com chave, protocolo e encerramento
      — depende de T027

## Fase L — Buracos que o E2E da T028 abriu

Decisão em `docs/adr/0017-discarding-a-rejected-mdfe-manifest.md`. Não abrimos feature nova: os três
itens são dívida do que esta mesma feature entregou.

- [x] T029 Descarte de manifesto: estado `discarded` em `MDFE_MANIFEST_STATUSES` (migration da check
      constraint + rollback), `POST /mdfe-manifests/:id/discard` com `mdfe.manage`, idempotente,
      aceitando só `draft` e `rejected`, carimbando `released_at` em todo `mdfe_manifest_items`, mais
      a ação de descarte na tela de manifestos (ADR-0017) —
      `apps/api-transportada/src/{database/mdfe.schema.ts,mdfe-manifests/**}`,
      `apps/frontend-transportada/src/modules/mdfe-manifest/**` —
      `test/mdfe-schema/*.contract.ts` (constraint, tenant-safety), `test/mdfe-http/*.contract.ts`
      (403/409 por estado, idempotência), `test/mdfe-domain/eligibility.contract.ts` (o CT-e liberado
      volta a ser candidato — não `grouping.contract.ts`, que só cobre a soma da carga) e, no
      frontend, `test/mdfe-manifest/{client-and-queries,table-and-actions}.contract.ts`
- [x] T030 Cancelamento devolve o CT-e: o write-back do worker que confirma o 110111 carimba
      `released_at` dos itens, cumprindo o que o `evidence.md` já documentava — não em
      `src/mdfe-manifests/application/**` como esta linha dizia: quem grava a confirmação é
      `apps/worker-transportada/src/mdfe-issuance/infrastructure/drizzle-mdfe-issuance-write-back.repository.ts`
      — `test/mdfe-issuance-write-back.contract.test.ts` (libera só item vivo, na mesma transação,
      nada liberado quando a SEFAZ recusa ou quando a tentativa já estava encerrada)
- [x] T031 Motivo da recusa persistido e visível: coluna de mensagem em `mdfe_issuance_attempts`
      (migration + rollback), `recordRejected` gravando `outcome.rejection.message`, campo no detalhe
      do manifesto e na tela; e falha de `decode` do envelope logada com `markDeadLettered` em vez de
      morrer calada dentro do `provider.consume` — `apps/{api,worker,frontend}-transportada/**` —
      contratos de aplicação da rejeição e do consumer
- [x] T032 Descartar por esta rota os manifestos `4ef75fa1` e `4da262d0`, devolvendo os CT-es
      `3abe7870` e `fbe957fa` ao pool de candidatos — evidência com o CT-e reaparecendo no preview —
      depende de T029

## Fase M — Achados da T032

Dois defeitos que a operação da T032 desenterrou, nenhum regressão dela: um esconde CT-e autorizado
da lista de candidatos a manifesto, o outro mantém morto o único caminho de login real dos testes de
smoke. Mesma regra de sempre: teste vermelho antes da correção.

- [x] T033 Status do item do lote reconciliado com o documento fiscal: `listItems` devolve
      `status: attempt?.status`
      (`apps/api-transportada/src/cte-batches/infrastructure/drizzle-cte-batch-item.repository.ts:96`)
      e ignora o `cte_fiscal_documents` que a própria query já junta — uma tentativa `rejected`
      posterior passa a esconder um CT-e autorizado, que foi o que tirou o CT-e `3abe7870` da lista
      de candidatos a MDF-e na T032 enquanto a elegibilidade do backend continuava aceitando o
      documento. Extrair a precedência (documento fiscal autorizado manda sobre a última tentativa;
      cancelamento vem do documento) reaproveitando `resolveIssuedDocumentStatus` de
      `drizzle-cte-issuance.repository.ts`, e registrar a decisão em
      `docs/adr/0018-authorized-fiscal-document-outranks-latest-attempt.md` —
      `test/cte-batch-infrastructure/*.contract.ts` (função pura: tentativa `rejected` + documento
      autorizado → `authorized`; documento cancelado → `cancelled`; sem documento → status da
      tentativa), arquivo novo **adicionado à lista explícita de testes do `package.json`** — e
      evidência com o CT-e `3abe7870` aparecendo como candidato na tela de manifestos
- [x] T034 Login real do smoke autenticado de volta à vida:
      `apps/frontend-transportada/test/authenticated-smoke.helper.ts:53` compara a resposta de
      `/auth/me` com a origem fixa `http://localhost:53001`, que só vale quando `VITE_API_URL` aponta
      direto para a API; com o `VITE_API_URL=http://localhost:53000/api` do proxy o `waitForResponse`
      nunca resolve e o teste morre no timeout. Derivar a origem esperada de `VITE_API_URL` em vez de
      fixá-la, espelhar `server.proxy` em `preview.proxy` no `vite.config.ts` (hoje só o dev tem
      proxy — com `VITE_API_URL` proxiado o `vite preview` do smoke não alcança a API) e expor um
      script `smoke:auth` sem `VITE_SMOKE_AUTH_BYPASS`, mantendo o bypass como padrão de
      `bun run smoke` para que o gate do `make smoke` siga rodando sem depender de Keycloak —
      `apps/frontend-transportada/{test/smoke-api-url.helper.ts,test/authenticated-smoke.helper.ts,vite.config.ts,package.json}` —
      evidência: `smoke:auth` verde nas duas formas de `VITE_API_URL`, sem senha nem token no log
