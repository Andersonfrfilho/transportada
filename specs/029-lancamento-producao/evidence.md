# Evidências — 029 Lançamento em produção

Uma seção por task, preenchida no fechamento dela. Task sem evidência aqui não está concluída.

## Levantamento inicial (07/08/2026)

`railway status --json`, projeto `62de4c69-216a-4335-93a0-4942c6a95c54`:

```text
staging     Postgres  Postgres-q0RQ  api  cron  keycloak  rabbitmq  transportada-frontend  worker
production  Postgres-FDoz  Postgres-Hqfu
```

Ambos os Postgres em `ghcr.io/railwayapp-templates/postgres-ssl:18`, com volume, sem TCP proxy
(`railway variables` não devolve variável `*_PROXY_*` em nenhum dos quatro).

```text
$ git rev-list --count main..staging   → 82
$ git rev-list --count staging..main   → 0
$ git diff --name-only main..staging -- 'apps/api-transportada/drizzle/*.sql' | wc -l → 18 (9 migrations)
```

Busca por observabilidade no repositório: `rg -i "sentry|drain|otel|opentelemetry"` → nenhum
resultado. `@adatechnology/logger@0.0.1` não expõe redação (`src/` tem `logger.ts`, `context.ts`,
`middleware.ts`, `trace-stack.ts`, `types.ts` — nenhum redator).

## Fase A — O que sai do processo

- [x] T001 — `adatechnology-packages/packages/backend/logger/src/redact.test.ts`, 20 casos em 6
      blocos: denylist por nome de chave (primeiro nível, variação de caixa/separador/camelCase,
      aninhamento em array, chave extra por configuração), varredura por forma (CPF cru e
      formatado, CNPJ cru e formatado, e-mail, telefone com e sem DDI, mensagem além do meta),
      chave de acesso (máscara, CNPJ do emitente não escapa, duas chaves continuam distintas),
      teste negativo (12 campos opacos/enum/contagem/duração/diagnóstico intactos, número de
      negócio, tipos primitivos), estruturas hostis (ciclo, profundidade 40 com corte no padrão,
      `maxDepth` configurado, 6 valores exóticos sem exceção) e custo.

      Falha esperada antes da implementação, pelo motivo certo:

      ```text
      $ bun test src/redact.test.ts
      error: Cannot find module './redact' from '.../src/redact.test.ts'
      0 pass · 1 fail · 1 error
      ```

- [x] T002 — `src/redact.ts` + export em `src/index.ts` (`redact`, `redactMeta`,
      `DEFAULT_REDACTED_KEYS`, `RedactOptions`).

      Camada 1: 25 tokens normalizados (NFD sem diacrítico, minúsculo, sem separador), casando por
      igualdade **ou sufixo** — `clienteCpf` cai, `enderecoId` não. Camada 2: 9 padrões aplicados
      em ordem fixa, e a ordem é o contrato — a chave de acesso é consumida antes de CNPJ e CPF,
      senão o CNPJ do emitente no meio dos 44 dígitos seria comido pelo padrão curto. Chave de
      acesso vira `****` + 6 últimos (`****012347`). Número inteiro de 11/14/44 dígitos também é
      varrido; qualquer outro volta como número. Ciclo → `[CIRCULAR]` (guarda por caminho, não
      global — objeto repetido em ramos irmãos não é falso positivo), profundidade → `[TRUNCATED]`
      com teto padrão 8. `Error` vira `{name, message, stack}` redigidos, `bigint` vira string
      (senão o `JSON.stringify` do logger lança).

      ```text
      $ bun test src/redact.test.ts
      20 pass · 0 fail · 65 expect() calls  [149ms]

      $ bun run check            # tsc --noEmit
      (sem saída)

      $ bun test                 # pacote inteiro, redact + logger
      29 pass · 0 fail · 89 expect() calls
      ```

      Custo medido no próprio contrato: 10.000 redações de um `meta` típico (6 campos, um objeto
      aninhado, uma string com CPF e e-mail) abaixo do teto de 2s.

- [x] T003 — `src/http-transport.ts` (`HttpTransport`) + wiring no `Logger.write` (`src/logger.ts`)
      + `logger.flush()`/`logger.stop()` novos. Export de `HttpTransport`/`HttpTransportConfig`
      no `index.ts`.

      Teste do transporte primeiro (`src/http-transport.test.ts`, servidor Bun.serve fake),
      falhando pelo motivo certo antes da implementação:

      ```text
      $ bun test src/http-transport.test.ts
      error: Cannot find module './http-transport' from '.../src/http-transport.test.ts'
      0 pass · 1 fail · 1 error
      ```

      9 casos: `sinkUrl` vazio desliga (`enqueue`/`flush` viram no-op sem lançar), NDJSON (uma
      linha por entrada, `content-type: application/x-ndjson`), batch automático ao cruzar
      `batchSize`, request nunca maior que `batchSize` mesmo com fila maior (drenagem em vários
      lotes numa só chamada de `flush()`), fila com teto (o mais antigo cai quando lota,
      confirmado pelos índices que sobrevivem), descarte silencioso (resposta 5xx e host
      inexistente não lançam, fila volta a aceitar depois), `stop()` idempotente.

      Design que evitou um teste frágil por corrida: `flush()` guarda uma única promise de
      drenagem em andamento (`flushPromise`) — quem chama `flush()` enquanto uma já roda recebe a
      **mesma** promise em vez de um no-op prematuro, e o laço interno drena tudo que for
      enfileirado durante a espera. Assim `await logger.flush()` espera o esvaziamento real, sem
      `sleep` arbitrário no teste nem nos consumidores.

      Redação ligada no `Logger.write`, antes de todo destino (console, arquivo, transporte) —
      novo bloco em `src/logger.test.ts`: `logger.info` com CPF e e-mail no `meta` não aparece no
      console capturado nem no corpo recebido pelo servidor fake; `companyId` sobrevive nos dois.
      Segundo caso: sem `sinkUrl` configurado, `logger.flush()` resolve sem lançar.

      ```text
      $ bun test src/http-transport.test.ts
      9 pass · 0 fail · 16 expect() calls  [27ms]

      $ bun run check             # tsc --noEmit
      (sem saída)

      $ bun test                  # pacote inteiro: redact + http-transport + logger
      40 pass · 0 fail · 113 expect() calls  [164ms]
      ```

      Commit `4e2bc1f` (T001+T002) e o desta task em `adatechnology-packages`, isolados do
      trabalho não relacionado em `notification-module`/`fiscal-provider` presente no working
      tree.
- [x] T004 — Changeset `.changeset/redactor-logger-http-sink.md` (`minor`) commitado isolado
      (`41492a0`, só esse arquivo — `notification-module`/`fiscal-provider` alheios ficaram de
      fora), rebase sobre `origin/main` (só um commit `chore(release): version packages` do bot à
      frente) e push. `publish.yml` (run `31234400514`) verde: `Build all packages` →
      `Version packages` → `Commit version bump` → `Publish packages` → as duas etapas de
      manutenção de pacotes legados.

      Achado durante a task: `adatechnology-packages` está em **modo pre-release do changesets**
      (`.changeset/pre.json`, `mode: "pre"`, `tag: "rc"`), aberto para outro trabalho já pendente
      (`notification-module`, `catalog-module` etc. — changesets deles já existiam antes desta
      task). Isso é repo-wide: qualquer publish nesse estado sai como prerelease. Resultado real —

      ```text
      $ npm view @adatechnology/logger dist-tags --json
      { "latest": "0.0.1", "rc": "0.1.0-rc.0" }
      ```

      `@adatechnology/logger` saiu como `0.1.0-rc.0` na tag `rc`, não `0.1.0` estável na `latest`.
      Sair do modo pre-release resolveria isso, mas forçaria o release de tudo mais que está
      pendente nesse modo — decisão que pertence ao outro workstream, fora do escopo desta task.
      Decisão tomada com o usuário: instalar a versão exata `0.1.0-rc.0` agora (não um range
      `^0.1.0`, que não resolveria prerelease), e registrar aqui a pendência de normalizar para
      `^0.1.0` quando o modo pre-release do repo de packages sair.

      Dependência subida nas três apps (`api-transportada`, `worker-transportada`,
      `cron-transportada`), `bun install` regerou o lockfile:

      ```text
      $ grep 'adatechnology/logger@' bun.lock
      "@adatechnology/logger": ["@adatechnology/logger@0.1.0-rc.0", ...]

      $ bun run typecheck   # api, worker, cron, frontend
      (sem saída — as 4 apps limpas)
      ```

      **Pendência aberta:** trocar `0.1.0-rc.0` por `^0.1.0` nas três apps quando
      `adatechnology-packages` sair do modo pre-release e `0.1.0` publicar na tag `latest`.
- [ ] T005 —
- [ ] T006 —
- [ ] T007 —
- [ ] T008 —
- [ ] T009 —

## Fase B — Sobrevivência do dado

- [ ] T010 —
- [ ] T011 —
- [ ] T012 —
- [ ] T013 — **RTO medido:** _(preencher)_
- [ ] T014 —

## Fase C — O portão humano

- [ ] T015 —
- [ ] T016 —
- [ ] T017 —

## Fase D — Subir production

- [ ] T018 — **Custo mensal projetado do stack de ops:** _(preencher)_
- [ ] T019 —
- [ ] T020 —
- [ ] T021 —
- [ ] T022 —
- [ ] T023 —

## Fase E — Prova de vida

- [ ] T024 —
- [ ] T025 —
- [ ] T026 —
- [ ] T027 —
- [ ] T028 —
