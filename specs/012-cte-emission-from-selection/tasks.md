# Tasks

## Fase A — Parametrização

- [x] T001 Schema `cte_emission_profiles` + `cte_emission_profile_matchers` + `cte_emission_profile_components` — `src/database/cte-emission-profile.schema.ts`, `database.schema.ts`, migration + rollback em `drizzle/` — `test/cte-profiles-schema/*.contract.ts` (colunas, constraints, tenant-safety)
- [x] T002 [P] Domínio da resolução de perfil (match CNPJ completo > raiz, prioridade, empate = erro, modo manual) — `src/cte-profiles/domain/emission-profile-resolution.policy.ts` — teste puro antes da implementação
- [x] T002a [P] Domínio do motor de cobrança: componente principal com piso/teto + adicionais (`percentage_of_cargo`, `percentage_of_freight`, `fixed_amount`) na ordem definida em D2b, aritmética BigInt — `src/cte-profiles/domain/charge-composition.service.ts` — teste puro com casos de GRIS, ad valorem, pedágio e frete mínimo
- [x] T003 Application + rotas CRUD `/cte-emission-profiles` (list, create, patch, activate, deactivate) com trava otimista, componentes e escrita transacional da regra de frete vinculada — `src/cte-profiles/{application,infrastructure,presentation}/*` — `test/cte-profiles-http/*.contract.ts`
- [x] T004 [P] Expor `update`/`activate`/`deactivate` de `freight_rules` (já existem no use case sem rota) e estender `findApplicableRule` para considerar `filters.senderTaxIds` e `filters.destinationStates` — `src/freight/**`, `main.ts` — `test/freight-http/*.contract.ts` + teste de exceção por UF
- [x] T005 Frontend: página `/cte-profiles` (form completo, client, validation, i18n PT/EN, CSS module) e entrada no menu Administração — `src/modules/cte-profiles/**`, `src/main.tsx` — teste de contrato do client

## Fase B — Da seleção ao lote

- [x] T006 Corrigir lote multi-documento: `cte_batch_item_documents` + `cte_batch_item_charges`, fingerprint sobre a lista ordenada, remoção do `documentIds[0]`, bloqueio rígido de nota já vinculada a CT-e não cancelado — `src/database/cte-batch.schema.ts`, `src/cte-batches/**`, migration + rollback — `test/cte-batch-application/*.contract.ts`
- [x] T007 `POST /cte-batches/preview` — projeção por CT-e, resolução de perfil, elegibilidade e bloqueios, sem persistir — `src/cte-batches/{application,presentation}/*` — teste de contrato cobrindo a NF-e de referência (base 958,48 → 43,13)
- [x] T008 `POST /cte-batches` com perfil, agrupamento e garantia idempotente do cálculo de frete — `src/cte-batches/application/cte-batch.use-case.ts` — teste de contrato incluindo agrupamento por remetente+destinatário
- [x] T009 [P] `GET /cte-batches/:id/items` com status, valor, notas, chave e protocolo — `src/cte-batches/presentation/cte-batch.routes.ts` — teste de contrato
- [x] T010 [P] Expor CNPJ das partes e município IBGE no item de listagem de notas — `src/nfe-documents/**`, `apps/frontend-transportada/src/modules/nfe-workspace/shared/*` — teste de contrato
- [x] T011 Frontend: ação _Gerar CT-es (N)_ na `selectionBar` + diálogo de prévia (perfil, agrupamento, projeção, bloqueios, total) — `NfeDocumentTable.component.tsx`, `useNfeDocumentTable.hook.ts`, novo componente de diálogo — teste de contrato do hook
- [x] T012 Frontend: página de CT-es reescrita — tabela de lotes, drill-in de itens, ações transmitir/reprocessar/baixar, remoção do `SYNTHETIC_DOCUMENT_ID` — `src/modules/cte-batch/**`, `src/modules/cte-issuance/**`

## Fase C — Emissão real

- [x] T013 `cte-payload.builder.ts` — domínio puro NF-e + perfil + frete → `CteData` — `src/cte-issuance/domain/` — **golden test** contra `example/…CTe-3526…8240.xml`, campo a campo
- [x] T014 `cte_issuance_payloads` + montagem e persistência no `issue` + provider config completa a partir do perfil fiscal (elimina os 10 campos vazios de `toProviderConfig`) — API + migration — teste de contrato
- [x] T015 Série, próximo número e ambiente reais no `issue` e na reserva — remove `homologation`/série `1` hardcoded — `src/cte-issuance/**`, `drizzle-cte-issuance.repository.ts` — teste de contrato
- [x] T016 Ajustes no pacote fiscal: `retira`/`xDetRetira`/`indIEToma` parametrizáveis, `vCargaAverb`, `dPrev` em `infNFe` e `cteProc` (`xmlAutorizado`) no retorno do `emit` — **repositório `adatechnology-packages`, autorizado** — 8 casos de contrato no pacote (23 pass · 0 fail); publicação do release ainda pendente
- [x] T017 Worker: resolver lê o payload persistido, descriptografa o certificado e chama o provider — `apps/worker-transportada/src/cte-issuance/**` (inclui cópia do schema) — contract test com provider fake
- [x] T018 Worker: write-back de execução — `cte_issuance_attempts.status`, `cte_issuance_events` e transição de `cte_batches` (hoje nunca chamada) — contract + integration test
- [x] T018b Worker: `cte_fiscal_documents` + XML autorizado no MinIO — gateway de storage `create-only`, propósito `cte_document` em `stored_objects` (migration + rollback) e write-back idempotente; nunca lança depois da autorização na SEFAZ — contract + integration test
- [x] T019 [P] Injetar `listDocuments` (`main.ts`) e respeitar `:itemId` nas rotas de issuance (`drizzle-cte-issuance.repository.ts`) — URL assinada de download via `cte-document-download.gateway.ts`; 7 casos novos de contrato + tenant-safety das queries (`make check`: api 688 · worker 133 · cron 24 · frontend 148 · 0 fail)
- [x] T020 Frontend: acompanhamento de status com polling, chave/protocolo, download do XML, reprocessar rejeitado — `src/modules/cte-issuance/**` — plano de query puro (`cteIssuancePolling.service.ts`) com polling de 5 s só enquanto em voo, painel `CteIssuanceStatusPanel` com timeline/chave/protocolo/rejeição, download por URL assinada e reprocesso a partir da linha do item; namespace i18n `cteIssuance` PT/EN; 5 casos novos de contrato (`make check`: api 688 · worker 133 · cron 24 · frontend 153 · 0 fail)
- [x] T021 Retry configurável (`cte_retry_schedules`, hoje 3 tentativas / 10s fixos no repositório) — API + worker — teste de contrato — política por empresa em `company_fiscal_profiles` (`cte_retry_max_attempts` + `cte_retry_backoff_seconds`, defaults 3 e 5s/30s/300s, `CHECK` 1..10), domínio único `cte-retry.policy.ts` espelhado no worker, `scheduleRetry` sem constantes fixas, `cte-backoff-policy.ts` removido, `countRetries` passou a filtrar por `companyId`; 14 casos novos de contrato (`make check`: api 699 · worker 137 · cron 24 · frontend 153 · 0 fail; `make migration-test`: 9 pass)
- [x] T021a `indIEToma` real no payload — derivado da inscrição estadual do tomador em
      `cte-receiver-ie.policy.ts` (IE numérica → `1`, `ISENTO` → `2`, CPF sem IE → `9`, CNPJ sem IE
      cai no `receiver_ie_indicator` do perfil e recusa `1` com `CTE_PAYLOAD_RECEIVER_IE_UNAVAILABLE`),
      tomador expedidor/recebedor recusado com `CTE_PAYLOAD_UNSUPPORTED_TAKER`; 7 casos novos com
      golden lendo o XML de `example/` (`make check`: api 706 · worker 137 · cron 24 · frontend 153 · 0 fail)
- [x] T021b Expor a política de retry no endpoint de company-settings + formulário do frontend — API + frontend — teste de contrato — `cteRetry` obrigatório no `PATCH`/`GET` de `/company-settings`, validado por Zod estrito com os limites do domínio e reafirmado por `createCteRetryPolicy` (400, nunca 500), somado ao fingerprint de idempotência e ao snapshot de auditoria; colunas escritas explicitamente no insert/update; frontend com guard exato `isCteRetryPolicy` e `CteRetryFields.component.tsx` (`make check`: api 726 · worker 150 · cron 24 · frontend 155 · 0 fail)
- [x] T021c `retira`/`xDetRetira` no payload — `cte_emission_profiles.pickup_indicator` é persistido
      e exposto na API, mas nunca chega ao `CteData`; hoje o default `1` do pacote coincide com o CT-e
      de referência e esconde a configuração ignorada — `cte-payload.builder.ts` — teste de contrato
- [x] T022a `POST /cte-batches/:id/issue` sempre devolve 409 `CTE_ISSUANCE_INVALID_STATE` — o
      `mapIssuanceAttempt` do repositório não devolve `fiscalEnvironment`/`fiscalSeries`/`fiscalNumber`
      que o `normalizeCreateIssuanceResult` exige; o fixture de teste faz spread do input e esconde a
      lacuna. Tipar o retorno de `createIssuance` no port e extrair o mapper — API — teste de contrato
- [x] T022b ✅ autorizado pelo usuário — corrigido no pacote + [ADR-0013](../../docs/adr/0013-cte-4-00-fixes-in-fiscal-provider.md)
      `@adatechnology/fiscal-provider` não consegue autorizar CT-e 4.00. Quatro defeitos provados
      contra `homologacao.nfe.fazenda.sp.gov.br` com o certificado real: 1. **Transporte** — `CTeRecepcaoSincV4` declara `<s:element name="cteDadosMsg" type="s:string"/>`;
      o pacote embute o XML como elemento e a SEFAZ devolve `HTTP 400` com corpo vazio. Com
      GZip+Base64 devolve `HTTP 200`. XML embutido/Base64 puro → cStat 244 "Falha na descompactação". 2. **`infCTe` → `infCte`** — o schema CT-e 4.00 usa `infCte`; afeta `CteXmlBuilder.ts` e o
      `match(/infCTe Id="…"/)` do `SefazXmlSigner.ts`. 3. **`versao="4.00"` no elemento errado** — o pacote põe em `<CTe>`; o schema exige em `<infCte>`. 4. **`enderRem` → `enderReme`** no grupo `rem`.
      Faltam ainda `infRespTec` (obrigatório no CT-e 4.00) e `infCTeSupl/qrCodCTe`. Referência viva:
      `example/exportacao_20_07_2026_13_17_59/CTe-*.xml` (mesmo CNPJ, autorizado)
- [x] T022c ✅ autorizado pelo usuário — vazamento de segredo corrigido:
      `createFiscalProvider` lança "Modelo fiscal desconhecido" com `JSON.stringify(config)` na mensagem,
      expondo `certificadoBase64` e `certificadoSenha` em log/stack — `FiscalProviderFactory.ts`
- [x] T022 E2E em homologação com a NF-e de referência + `evidence.md` consolidado + `make check` verde
      CT-e autorizado (cStat 100, protocolo `135260001960948`); ver ressalvas e defeitos abertos em
      T022d/T022e
- [x] T022d Backfill de `nfe_addresses.city_code` para documentos importados antes da migração
      `20260727151037` — 867 linhas NULL; sem isso a SEFAZ rejeita `cMun` vazio com cStat 215.
      Reimportar não conserta (`onConflictDoNothing`); reprocessar o XML preservado no storage —
      `apps/worker-transportada/**` — teste de contrato
      865 → 289 NULL (576 preenchidas); as 289 restantes são todas `carrier`, que a NF-e não
      transporta `cMun` no grupo `<transporta>` — estrutural, não lacuna
- [x] T022e ⚠️ Idempotência do consumidor CT-e — reentrega da mesma mensagem **retransmite à SEFAZ**
      e sobrescreve tentativa autorizada com a rejeição 539. `processed_messages` não recebe linha
      alguma do consumidor CT-e. Guardar idempotência e tornar reentrega de tentativa já autorizada
      um no-op — `apps/worker-transportada/src/cte-issuance/**` — teste de contrato
      Causa provada: FK composta de `processed_messages` aponta para `processing_outbox`, e o trilho
      CT-e publica em `cte_issuance_outbox` — todo `markProcessed` estourava. Ledger dedicado
      `cte_processed_messages` + guarda de status liquidado no write-back e no efeito
- [x] T022f `buildIcms` emite `<ICMS40>` para CST 40/41/51; o schema CT-e 4.00 nomeia o grupo
      `ICMS45` — fora do caminho CRT 1 exercitado; exige verificação contra o schema antes de mexer
      (`adatechnology-packages`)
      `TImp` do `cteTiposBasico_v4.00.xsd` não tem `ICMS40`; corrigido e provado com `xmllint`
      (antes falha, depois valida em 40/41/51). ADR-0014. Publicado em `0.3.0-rc.2` e consumido
      pelas duas apps

## Fase D — Ciclo de vida do CT-e e MDF-e

> Escopo acrescentado pelo usuário: CT-e pode ser **criada, removida e transmitida**, e pode ser
> **vinculada a MDF-e**. Nada disso está coberto por T001–T022.

- [x] T023 Remoção de item do lote em rascunho — `DELETE /cte-batches/:id/items/:itemId` desfaz o
      vínculo com as notas e devolve-as à seleção; proibido depois de `submitted` — `src/cte-batches/**`
      — teste de contrato incluindo a nota voltando a ser elegível na prévia
- [x] T024 Cancelamento fiscal do CT-e autorizado (evento 110111) — hoje `POST /cte-batches/:id/cancel`
      só muda o status local do lote, sem tocar na SEFAZ. Exige `protocolo` + `justificativa` ≥ 15
      caracteres (`SefazCteProvider.cancel`), persistência do XML do evento e novo estado no item —
      API + worker + `cte_fiscal_documents` — teste de contrato com provider fake
- [x] T025 Frontend: remover item de lote em rascunho e cancelar CT-e autorizado (com justificativa
      obrigatória) — `src/modules/cte-batch/**`
- [x] T026 🧠 MDF-e (modelo 58): modelagem do manifesto, vínculo N:1 com CT-es, ciclo
      emitir/encerrar/cancelar — **entregue na feature `013-fleet-and-mdfe`**, autorizada pelo usuário
      e registrada em `docs/adr/0016-fleet-drivers-and-mdfe-manifest.md`. A modelagem do manifesto
      (`mdfe_manifests`, `mdfe_manifest_documents`, `mdfe_fiscal_documents`, `mdfe_issuance_*`), o
      vínculo N:1 com os CT-es autorizados, o ciclo emitir/encerrar (110112)/cancelar (110111) com
      justificativa, o trilho `mdfe-issuance.v1` no worker e a tela `/mdfe-manifests` estão completos —
      evidência em `specs/013-fleet-and-mdfe/evidence.md`. **Ressalva registrada:** o efeito de emissão
      é construído sem `createProvider` porque a versão instalada do `@adatechnology/fiscal-provider`
      (0.3.0-rc.2) não publica MDF-e no `dist/`; nesse estado a tentativa é gravada como pendente e
      nada é enviado à SEFAZ. Publicado o pacote, entra só a factory — ver T016 da feature 013

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos arquivos.
Marque como concluída apenas após registrar evidência.
