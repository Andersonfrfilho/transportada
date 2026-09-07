# Tasks

> 🤖 Modelo: `sonnet` (T001 e T002 são 🧠 — decidir a fronteira falha × pulo antes de codificar)

⚠️ **T001 bloqueia T006.** A dúvida do MinIO decide a metade do contrato que afirma o pulo
legítimo; sem ela, T006 nasce afirmando meia regra.

- [ ] **T001** 🧠 Fechar `[NEEDS CLARIFICATION: o pulo do MinIO deve virar falha no CI?]` — decidir
      entre opcional sempre, exigido sob `CI=true`, ou opt-out explícito — `specs/092-.../spec.md`
      — decisão escrita na spec, com a razão

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

- [ ] **T006** Segunda metade do contrato: o pulo do MinIO **continua existindo** e é distinguível
      do pulo por defeito — depende de **T001** —
      `apps/api-transportada/test/integration-scaffold/database-seam.contract.ts` +
      `test/fixtures/integration-database.fixture.ts` — contrato reprova quem apagar
      `testWithObjectStorage` junto

- [ ] **T007** Alvo `make api-integration` no molde de `worker-integration:269`, e `ci.yml` passa a
      **chamar o alvo** em vez de repetir as linhas — `Makefile`, `.github/workflows/ci.yml` — alvo
      roda local com a infra de pé; o comando inline do CI some

- [ ] **T008** Prova de ponta, que é a única que fecha a spec — `evidence.md` —
      sem env: exit ≠ 0 e **nenhum teste executado**; com env: **196 pass**, os mesmos de hoje;
      `make check` e a suíte de contratos seguem verdes

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos
arquivos. Marque como concluída apenas após registrar evidência.
