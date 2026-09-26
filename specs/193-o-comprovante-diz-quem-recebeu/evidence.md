# Evidence — Spec 193 (o comprovante diz quem recebeu)

Sessão de 2026-09-25, branch `work/driver-app`, worktree `pensive-borg-f59971`. Rodada 1: Fases 1,
2 e 3 (inclusive a T3.1). A Fase 4 fica para a próxima rodada.

## Ordem 193 → 194 invertida (decisão do orquestrador)

O `tasks.md` e o `plan.md` pedem P0, depois a 194 fases 1–3, e só então a Fase 4 da 193. Nesta
rodada a ordem entre 193 e 194 foi **invertida por decisão do orquestrador, a pedido do usuário, que
quer ver o select**. O P0 já está na branch (spec 203, commit `1e512a9b9`, "o attach nunca
descarta"). Consequência combinada: a 194 faz rebase sobre a 193 e, se as migrations de
`trip_delivery_proofs` colidirem, **quem chega depois regenera a sua** (`db:generate` → `no_changes`).
A T4.0 (P0 e 194 em `origin/staging`) fica para a próxima rodada.

## Fase 1 — A fila no cabeçalho

### T1.1 — testes antes (vistos falhar)

Arquivos: `apps/frontend-driver/test/driver-trip/queue-header.contract.ts` (importado em
`test/driver-trip.contract.test.ts`) e o caso novo em `test/shared/touch-target.contract.ts`.

```
$ bun test ./test/driver-trip/queue-header.contract.ts ./test/shared/touch-target.contract.ts
SyntaxError: Export named 'formatQueueBadge' not found in module '.../pendingQueue.service.ts'.
(fail) alvo de toque ... > o botão da fila no cabeçalho tem o alvo do sino (spec 193 D13)
 3 pass, 2 fail, 1 error

$ bun test test/driver-trip.contract.test.ts test/shared.contract.test.ts
 60 pass, 2 fail, 1 error   (o import quebrado derruba o entrypoint inteiro do driver-trip)
```

### T1.2 — implementação

- `pendingQueue.service.ts`: `selectPendingTotal` (o `total` de `countPending` com `ownerSubHash`) e
  `formatQueueBadge` (`''`, o número, `'99+'`).
- `useDriverTrip.hook.ts`: `pendingTotal` como estado da mesma leitura que alimenta o temporizador.
- `DriverShellHeader.component.tsx`: prop `pendingCount`; botão entre a marca e o sino, ícone
  `upload` (já no mapa), selo cobre com tinta escura, `aria-label` "Fila de envio, N pendentes",
  toque → `navigateToDriverSection('queue')`. As seis montagens do workspace passam
  `driverTrip.pendingTotal`. `/notificacoes` fica de fora (D13).
- CSS `.queueButton` no molde do `.adn-bell` (44 px, `--touch-target`) e `margin-inline-start: auto`,
  que agrupa fila, sino e avatar à direita. O `prettier --write` do arquivo também tirou uma linha em
  branco dupla que já estava no HEAD (`.occurrencePreviewText`), sem outra mudança.
- Locale pt-BR e en: `queueHeader.label_zero|_one|_other` (conferido no i18next: 0 → "nada
  pendente", 1 → "1 pendente", 3 → "3 pendentes", 120 → "120 pendentes").

```
$ bun run --cwd apps/frontend-driver lint        → eslint . sem erros
$ bun run --cwd apps/frontend-driver typecheck   → tsc --noEmit sem erros
$ bun test test/shared.contract.test.ts test/identity.contract.test.ts test/driver-trip.contract.test.ts
  592 pass, 0 fail, 1209 expect() calls
$ bun run --cwd apps/frontend-driver build
  precache: 13 arquivos, 669511 bytes — dist.contract 6 pass, 0 fail
```

### T1.3 — smoke e prints

Caso novo no `driver-app.smoke.spec.ts`: "CA13 (193): a fila presa mostra o selo no cabeçalho e o
toque abre a fila" — API sem sinal, um "Cheguei" preso, `Fila de envio, 1 pendente` com selo `1` e
≥ 44×44 px em viagem, `/fotos` e `/perfil`; o toque abre `/fila` (h1 "Eventos pendentes"), o botão
continua ali, nenhum relato subiu, sem rolagem lateral.

**Defeito achado pelo smoke e corrigido nesta task:** com a fila ao lado do sino, a 375 px o
cabeçalho media 403 px (medido por `getBoundingClientRect`) e a tela inteira rolava de lado — 13
casos do smoke caíam no `assertNoHorizontalOverflow`. Causa: `.moduleHeader` é item da grade de
`.moduleShell` e o nome da empresa (`white-space: nowrap`) ditava o mínimo da coluna. Correção:
`min-width: 0` em `.moduleHeader` e `.moduleCompanyName` (o nome corta com reticências) e
`flex-shrink: 0` na fila e no avatar (o avatar encolhia para 36 px). Depois: cabeçalho de 16 a 359 px,
fila 44×44, sino 44×44, avatar 40×40.

```
$ bunx playwright test (driver-app.smoke.spec.ts, bypass, porta 53112) --grep "CA13|CA15|CA08|sem sinal, a confirma"
  4 passed (8.8s)
```

⚠️ **O smoke completo não é evidência nesta rodada.** A partir do meio da T1.3 outro executor passou
a editar a mesma árvore (`DriverStopCard`, `useDriverTrip`, locales, workspace, CSS, o próprio
`driver-app.smoke.spec.ts`), e o build do Playwright leva esse WIP junto. Medido: o
`driver-service-worker.smoke.spec.ts` passa 2/2 numa cópia de `1e512a9b9` (duas vezes, 53112) e cai
na árvore atual por falta do botão "Entreguei" na parada — comportamento do WIP da parada, não do
cabeçalho. O smoke completo fica para quando a árvore estiver só com commits.

Prints (build de smoke, API mockada, 375 e 768 px) em `prints/`: `t1.3-cabecalho-zero-*.png` (sem
selo), `t1.3-viagem-fila-*.png` (selo `1`) e `t1.3-fila-*.png` (a fila aberta pelo ícone).

**Preview do usuário:** não mexido (53200 e 53901 seguem no ar, mesmos PIDs). O
`PREVIEW_HOLD_QUEUE=1` da API de demonstração não foi aplicado: exigiria reiniciar a 53901, que é do
usuário. **Pendente: o ok do usuário nos prints.**

## Fase 2 — O banco guarda quem recebeu

⚠️ **Árvore compartilhada com a spec 205** ("o registro tardio pesa como foto atrasada"): outro
executor edita, sem commit, `trip.schema.ts` (`late_registration` em `trip_delivery_proofs` e
`trip_stop_events`), `attach-delivery-proof.use-case.ts`, `delivery-proof-read.support.ts`,
`drizzle-delivery-proof.repository.ts`, `static-migration.contract.ts`, `me-trip.integration.ts` e
criou `drizzle/20260926001939_late_registration/` (não versionada). Os commits desta spec levam só os
trechos da 193 (blob montado a partir do HEAD); os testes rodam sobre a árvore com o WIP da 205.

### T2.1 — testes antes (vistos falhar)

`test/trip-schema/received-by.contract.ts` (importado em `test/trip-schema.contract.test.ts`): os dez
códigos na ordem da D1, os dois que pedem detalhe, `varchar(16)`/`varchar(120)` anuláveis, os três
CHECKs (lista ou nulo; detalhe só com relação; `cargo` sem nada), o `receiver_check` novo
(`kind <> 'cargo' or length(receiver_name) = 0`), nenhum CHECK de detalhe obrigatório e
`received_by` `optional` + CHECK nas duas tabelas de configuração. Tenant-safety:
`trip-schema/tenant-safety.contract.ts` (as colunas ficam na linha do comprovante, nunca como FK) e
`delivery-proof-settings-tenant-safety.contract.ts` (o modo mora nas linhas do tenant).

```
$ bun --env-file=../../.env.test test ./test/trip-schema.contract.test.ts --timeout 120000
SyntaxError: Export named 'RECEIVED_BY_OPTIONS' not found in module '.../src/database/database.schema.ts'.
 0 pass, 1 fail, 1 error
```

### T2.2 🧠 — migration `20260926002743_delivery_proof_received_by`

- Schema: `RECEIVED_BY_OPTIONS`, `RECEIVED_BY_OPTIONS_REQUIRING_DETAIL` e
  `RECEIVED_BY_DETAIL_MAX_LENGTH` em `src/database/trip.schema.ts` (sem importar `trips/domain`);
  `received_by varchar(16)` e `received_by_detail varchar(120)` anuláveis; CHECKs
  `trip_delivery_proofs_received_by_check` (lista ou nulo), `_received_by_detail_check` (detalhe só
  com relação) e `_received_by_kind_check` (`cargo` sem os dois); `receiver_check` passa a
  `"kind" <> 'cargo' or length("receiver_name") = 0`. `received_by text not null default
'optional'` + CHECK de modo em `company_delivery_proof_settings` e
  `delivery_proof_setting_overrides`. O detalhe obrigatório em `other`/`other_relative` **não** é
  CHECK (D2).
- `migration.sql`: SQL do `db:generate`, conferido à mão, com um `DO $$ … RAISE EXCEPTION` **antes**
  de tudo: aborta se existir `cargo` com `receiver_name` (o único caso em que o CHECK novo é mais
  estreito que o antigo — o canal `office` podia gravá-lo).
- `rollback.sql` à mão ("Manual rollback only"): recusa, sem desfazer nada, se houver relação ou
  detalhe gravados, foto do motorista com nome (o CHECK antigo a recusaria) ou configuração com
  `received_by` diferente de `optional`; sem dado, volta o CHECK antigo, derruba os três CHECKs e as
  colunas e apaga a própria linha do journal (exatamente uma).
- `static-migration.contract.ts`: a pasta nova na lista e um caso que prova a ordem (verificação
  antes da troca do CHECK, recusas antes do `DROP COLUMN`).

**Conferência 🧠 do CHECK relaxado e do rollback com dado** — feita pela asserção da T2.3 contra
Postgres, antes de fechar esta task (e um teste de mutação: trocar o texto esperado da verificação
prévia por `MUTANTE` derruba a suíte com `Expected to contain: "MUTANTE"`, 74 pass / 1 fail).

**Snapshot com a 205 na árvore.** O `db:generate` rodou com a migration não versionada da 205
(`20260926001939_late_registration`) presente, então o `snapshot.json` da árvore encadeia nela e
leva as duas colunas `late_registration`. **O commit leva outra variante**, coerente com o HEAD:
`prevIds` = snapshot de `20260924201710_occurrence_type_leaves_document_behind` e sem as duas
colunas da 205 (4398 entradas de `ddl` contra 4400). Na árvore fica a variante que encadeia na 205,
para o trabalho dela seguir com `no_changes`. **Quem chega depois regenera:** a 205 precisa refazer a
migration dela depois desta (timestamp maior que `20260926002743`) e, nesse momento, o
`snapshot.json` desta pasta volta ao do HEAD.

⚠️ **Incidente, corrigido na hora:** um script meu abriu
`test/database-migration/static-migration.contract.ts` para escrita antes de lê-lo e zerou o
arquivo, que tinha uma linha não versionada da 205 (`'20260926001939_late_registration',`). O
arquivo foi refeito a partir do HEAD mais essa linha — o diff da 205 era exatamente essa linha, e
voltou idêntico — antes de aplicar a mudança da 193.

```
$ bun --env-file=../../.env.test test ./test/database-migration.contract.test.ts ./test/trip-schema.contract.test.ts --timeout 120000
  189 pass, 0 fail
$ bun run db:generate --name should_be_empty   → {"status":"no_changes","dialect":"postgresql"}
$ bun run db:check                             → Everything's fine
$ make migration-test   (Postgres do Docker, 55432, bancos descartáveis por execução — funcionando)
  111 pass, 0 fail, 1458 expect() calls (1432 antes da asserção da T2.3)
```

### T2.3 — `delivery-proof-received-by.assertion.ts` (CA08, CA14)

Ligada em `test/database-migration/database-migration.integration.ts`, logo depois da asserção da
foto da carga. Prova, contra Postgres, numa parada/evento de sonda:

- os CHECKs recusam (`23514`, com o nome do constraint): `cargo` com relação
  (`_received_by_kind_check`), `cargo` com nome (`_receiver_check`), relação fora da lista
  (`_received_by_check`), detalhe sem relação (`_received_by_detail_check`) e modo inválido na
  configuração (`company_delivery_proof_settings_received_by_check`);
- a foto do motorista (`driver_app`) grava nome + `neighbor` + "casa 12", e a assinatura grava
  `other` **sem** detalhe (D2);
- o rollback recusa com relação gravada (e as duas linhas continuam lá), depois com nome na foto do
  motorista, depois com `received_by = 'required'` na configuração — as três mensagens conferidas;
- sem dado, o rollback passa; um `cargo` com nome gravado pelo escritório (aceito pelo CHECK antigo)
  faz `runDatabaseMigrations` abortar com `refusing spec 193 receiver_check`; apagado o `cargo`, a
  migration reaplica e o journal volta. A sonda limpa tudo o que criou (objetos das inserções
  recusadas inclusive) antes do rollback completo da suíte.

```
$ make migration-test
  111 pass, 0 fail, 1458 expect() calls — as asserções novas somam 26 expect() (1432 → 1458)
```
