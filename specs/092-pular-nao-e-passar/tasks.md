# Tasks

> 🤖 Modelo: `sonnet` (T002 é 🧠 — decidir a fronteira falha × pulo antes de codificar)

⚠️ **Meça antes de codificar em cima.** Duas premissas da primeira versão desta spec eram
inferência e caíram ao rodar o arquivo isolado: que o pulo por object storage era legítimo (não é —
`make up` cria o bucket, e os testes falham em vez de pular) e que os 4 skips vinham dele (vêm de
`DRIZZLE_TEST_DATABASE_URL`). A task que herdar uma afirmação da spec confere primeiro.

- [ ] **T001** Unificar as três variáveis de gate — `API_TEST_DATABASE_URL`/`DATABASE_URL`,
      `DRIZZLE_TEST_DATABASE_URL` (`test/database-migration/support.ts:5`) e `STORAGE_*` — num
      lugar só, e supri-las pelo alvo do T007 — `test/fixtures/integration-database.fixture.ts`,
      `test/database-migration/support.ts` — os 4 skips de migration passam a rodar

- [ ] **T002** 🧠 [P] Fechar `[NEEDS CLARIFICATION: make check passa a incluir a integração?]` —
      `specs/092-.../spec.md` — decisão escrita; não bloqueia T003..T008

- [ ] **T003** Contrato do RF6, **vermelho** — varre `test/integration/*.integration.ts` por glob e
      falha em quem lê `process.env` para banco ou declara o próprio ternário de skip —
      `apps/api-transportada/test/integration-scaffold/database-seam.contract.ts` + entrypoint +
      linha no `package.json` — reprova os 33 de hoje, nominalmente

- [ ] **T004** `resolveIntegrationDatabaseUrl()` e o guard de carga — precedência
      `API_TEST_DATABASE_URL ?? DATABASE_URL`, lança quando nenhuma existe, mensagem cita
      `make api-integration` e **nunca** o valor da URL —
      `apps/api-transportada/test/fixtures/integration-database.fixture.ts` — teste próprio nos três
      estados (só a primeira, só a segunda, nenhuma)

- [ ] **T005** Migrar os 38 `*.integration.ts` para o seam — remover as 33 cópias de
      `const databaseUrl` e o ternário; o guard de topo de `server.integration.ts:18` sai porque
      vira o padrão de todos —
      `apps/api-transportada/test/integration/*.integration.ts` — T003 fica verde;
      `grep -c "const databaseUrl"` devolve 0

- [ ] **T006b** Fechar o escape do `test(` cru — os 4 testes de `local-identity-seed` (3) e
      `company-user-listing` (1) que correm sem banco enquanto os vizinhos pulam —
      `apps/api-transportada/test/integration/{local-identity-seed,company-user-listing}.integration.ts`
      — com o guard, `test` e `testWithPostgres` passam a ser a mesma coisa; contrato de T003 cobre
      a reincidência

- [ ] **T006** Segunda metade do contrato: o pulo **se anuncia com a razão** — o único que sobra é o
      do OSRM, no worker, e `(skip)` sozinho não diz de onde vem (foi o que escondeu os 4 skips de
      migration) — `apps/api-transportada/test/integration-scaffold/database-seam.contract.ts` +
      `test/fixtures/integration-database.fixture.ts` — contrato reprova pulo sem razão declarada

- [ ] **T007** Alvo `make api-integration` no molde de `worker-integration:269`, e `ci.yml` passa a
      **chamar o alvo** em vez de repetir as linhas — `Makefile`, `.github/workflows/ci.yml` — alvo
      roda local com a infra de pé; o comando inline do CI some

- [ ] **T008** Prova de ponta, que é a única que fecha a spec — `evidence.md` —
      sem env: exit ≠ 0 e **nenhum teste executado**; com env: **200 pass** (os 196 de hoje mais os
      4 contratos de migration que deixam de pular) e as 2 falhas do `cte-archive-gateway` visíveis
      e nomeadas; `make check` e a suíte de contratos seguem verdes

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos
arquivos. Marque como concluída apenas após registrar evidência.
