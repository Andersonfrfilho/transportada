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
