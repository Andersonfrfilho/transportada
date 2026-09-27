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

## Fase 3 — A API recebe, aplica a configuração e devolve

### T3.1 — R1: o painel tolera (frontend-transportada)

Teste antes, em `test/trip/delivery-proof.contract.ts` (entrypoint `test/trip.contract.test.ts`):
comprovante sem os campos, com `neighbor`/"casa 12" e com os dois `null`; um item com relação fora
da lista e outro com detalhe numérico no meio da lista saem sozinhos (os outros ficam); corpo que não
é lista continua recusado; configuração sem `receivedBy` é válida e vale `optional`, com modo inválido
é recusada.

```
$ bun test ./test/trip.contract.test.ts   (antes da implementação)
SyntaxError: Export named 'resolveReceivedByMode' not found in module '.../deliveryProofSettings.service.ts'.
 0 pass, 1 fail, 1 error
```

Implementação: `DELIVERY_PROOF_RECEIVED_BY_OPTIONS` (cópia por valor da API) e
`DELIVERY_PROOF_RECEIVED_BY_KEYS` em `trip.constant.ts`; `isDeliveryProof` passa de `hasExactKeys` a
`hasKeys` (chave desconhecida continua recusada) e confere `receivedBy` (lista ou `null`) e
`receivedByDetail` (string ou `null`) quando presentes; `deliveryProofsFromApi` filtra o item
inválido em vez de recusar a lista; `DeliveryProof` ganha os dois campos opcionais;
`isDeliveryProofFieldSettings` aceita `receivedBy` ausente e `resolveReceivedByMode` o lê como
`optional`.

⚠️ **Conflito de decisão com o WIP da spec 205** (não versionado, `test/trip/late-registration-tolerance.contract.ts`):
dois casos dela esperam que `deliveryProofsFromApi` **lance** com item inválido
(`lateRegistration: 1` e a chave `objectKey`). A T3.1 da 193 (plan.md, "R1") decide o contrário:
o item inválido sai sozinho e a lista fica. Na árvore com o WIP da 205, esses dois casos da 205
falham (1700 pass, 2 fail); os casos da 193 passam. O arquivo da 205 não foi tocado. Quem fechar a
205 ajusta os dois casos para "sai da lista".

Gates da T3.1 (árvore com o WIP da 205):

```
$ bun run --cwd apps/frontend-transportada typecheck  → tsc --noEmit sem erros
$ bun run --cwd apps/frontend-transportada lint       → eslint . sem erros
$ bun run --cwd apps/frontend-transportada test       → 5356 pass, 2 fail (os dois casos da 205 acima)
$ bun run --cwd apps/frontend-transportada test:hooks → 54 pass, 0 fail
```

Variante do commit conferida isolada (cópia de `9add71a0c` só com `apps/frontend-transportada`):
`tsc --noEmit` limpo e `test/trip.contract.test.ts` com 1688 pass e 6 fail. As seis falhas são
contratos de paridade que leem arquivos de fora da cópia (`apps/api-transportada`, `specs/`). Não
têm relação com a T3.1.

### T3.2 — testes antes (vistos falhar)

`test/trip-delivery-proof/received-by.contract.ts` (entrypoint `test/trip-delivery-proof.contract.test.ts`):

- `normalizeReceivedBy`:
  - ausente vira nulo;
  - aplica trim e remove `\p{Cc}`;
  - corta em 120;
  - código fora da lista vira nulo;
  - detalhe sem relação é descartado;
  - `other`/`other_relative` sem detalhe gravam assim mesmo;
  - nunca lança, seja com `null`, número, objeto, lista ou vazio.
- `parseReceivedByStrict`:
  - devolve 400 `INVALID_REQUEST` com `details[].field` nestes casos: código fora da lista; detalhe
    sem relação; detalhe com mais de 120; `other` ou `other_relative` sem detalhe.
- `applyReceivedBySettings`:
  - `off` descarta nos dois canais;
  - `optional` guarda;
  - `required` no motorista grava nulo;
  - `required` no escritório sem relação responde 422 `TRIP_DELIVERY_PROOF_RECEIVED_BY_REQUIRED`.
- Configuração:
  - `optional` de fábrica, na geral e no resolvido por nota;
  - o `PUT` geral e a exceção aceitam o campo ausente e o presente;
  - modo inválido é recusado;
  - a exceção vence por inteiro.

```
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts --timeout 120000
error: Cannot find module '../../src/trips/domain/received-by.policy.js'
 0 pass, 1 fail, 1 error
```

### T3.3 — configuração, snapshot e as peças puras da forma

- `DeliveryProofFieldSettings` ganha `receivedBy`, e a fábrica é `optional`. As duas entradas do
  `PUT`, geral e exceção, levam o campo como opcional (`DeliveryProofFieldSettingsInput`), e o Zod
  `.strict()` aceita `receivedBy` opcional.
- Repositório:
  - lê o campo na geral e nas exceções;
  - na geral, ausente não entra no `set`;
  - na exceção, o `INSERT` usa `optional` e o `ON CONFLICT` só grava o campo quando ele veio. Assim a
    exceção sem o campo preserva o valor do mesmo `taxId`, e a nova nasce `optional`.
- Snapshot do motorista:
  - as leituras de configuração (snapshot e escrita do comprovante) passam a trazer o campo, e o modo
    resolvido por nota vai em `deliveryProof.receivedBy`;
  - `recipientDisplayName` entra na nota e em `pendingProofs`. A regra vem de
    `resolveRecipientDisplayName`, extraída de `resolveDeliveryContact` e agora usada pelos dois.
- As peças puras que a T3.2 importa também entram aqui, para a suíte carregar:
  - `presentation/received-by.schema.ts` (`normalizeReceivedBy`, `parseReceivedByStrict`);
  - `domain/received-by.policy.ts` (`applyReceivedBySettings`);
  - `TripDeliveryProofReceivedByRequiredError`, em `trip-field-office.error.ts`.

  A ligação delas na escrita fica para a T3.4.

- Fixtures dos contratos que montam `DeliveryProofFieldSettings` ganham `receivedBy: 'optional'`,
  exigido pelo tipo, sem mudar o que os testes afirmam.
- Integração:
  - `canhoto-ocr-flag.integration.ts` ganha dois casos:
    - geral sem linha é `optional`, e gravado `required`, um `PUT` sem o campo preserva;
    - a exceção sem o campo preserva o valor do mesmo CNPJ, e a nova nasce `optional`.
  - `me-trip.integration.ts` confere `deliveryProof.receivedBy` e `recipientDisplayName` no snapshot
    e em `pendingProofs`.

```
$ bunx tsc --noEmit -p apps/api-transportada             → sem erros
$ bun run lint (api)                                      → sem erros
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts   → 155 pass, 0 fail
$ bun --env-file=../../.env.test test ./test/integration/canhoto-ocr-flag.integration.ts ./test/integration/me-trip.integration.ts
  17 pass, 0 fail
$ bun --env-file=../../.env.test test --timeout 120000     (contrato, 184 arquivos)
  7481 pass, 23 skip, 0 fail
$ bun --env-file=../../.env.test run test:integration     (116 arquivos, 14 min 42 s)
  624 pass, 7 skip, 4 fail
```

As 4 falhas da integração completa são estouros de 5 s (`[5000ms]`) em três arquivos sem relação
com a spec: `company-user-fleet-link`, `route-depot-query` e `address-components-source`. Rodados
isolados, dão 14 pass e 0 fail. É carga concorrente na máquina (outras sessões na mesma árvore), não
regressão.

⚠️ Um `prettier --write` meu num diretório inteiro reformatou `src/trips/presentation/me-trip.routes.ts`,
que é WIP da 205. Foi só formatação, sem mudança de código, e o arquivo não entra em commit meu.

### T3.4 — escrita: forma, configuração, nome na foto, lista fechada do escritório e 422

- **Motorista.**
  - `parseDeliveryProofUpload` lê `receivedBy`/`receivedByDetail` por `normalizeReceivedBy` e nunca
    recusa.
  - No `attachDeliveryProof`, `carriesReceiverName` passa a `kind !== 'cargo'`. É a D4, que revê a
    decisão da spec 156 T6.
  - Quem recebeu passa por `applyReceivedBySettings` com o modo da nota: `off` descarta; `required`
    grava nulo, sem recusar.
  - `saveProof` grava as duas colunas, no `INSERT` e no `buildProofUpsertSet`. A recaptura com chave
    nova substitui a linha (D12). O replay com a mesma `attachmentKey` devolve a linha sem regravar.
- **Escritório.**
  - `receivedBy`/`receivedByDetail` entram na lista fechada do multipart
    (`office-field-delivery.schema.ts`) por `parseReceivedByStrict`, que responde 400 com `details`.
  - `resolveOfficeReceivedBy` (`office-delivery-proof.policy.ts`) aplica o modo. `required` sem
    relação dá 422 `TRIP_DELIVERY_PROOF_RECEIVED_BY_REQUIRED`, dentro da transação da entrega, que
    desfaz.
  - `persistOfficeProof` grava as colunas e zera em `cargo`. O `field-proof` de `cargo` não passa
    pela configuração.
- **Testes da regra revista.** Dois contratos afirmavam a regra antiga, "a foto do motorista
  descarta o nome": `driver-trip/delivery-proof.contract.ts` e o `describe` da 156 T6 em
  `driver-trip/office-field-delivery.contract.ts`. Foram reescritos pela D4, com o motivo no texto do
  teste.
- **Casos novos:**
  - foto com nome, relação e detalhe (CA03);
  - `cargo` descarta tudo;
  - `off`/`required` nunca recusam (CA05, motorista);
  - replay (CA07).
- **Integração nova** `test/integration/delivery-proof-received-by.integration.ts`, incluída à mão
  no `test:integration`. Usa o molde do `trip-field-office-database.fixture`, e a foto do motorista
  passa pelo mesmo `parseDeliveryProofUpload` da rota. Casos:
  - CA03 + CA07;
  - CA04: `cousin` + detalhe e `other` sem detalhe gravam normalizados, sem recusa;
  - CA05 motorista: `off` e `required`;
  - CA05 escritório: `required` sem relação dá 422 e nada é gravado; `cousin` e `other` sem detalhe
    dão 400 com `details[].field`; `required` com relação dá 201 e as colunas são gravadas.
  - Foi pedido o `me-trip.integration.ts` e o `trip-field-office.integration.ts`. Preferi um arquivo
    próprio para não misturar trechos com o WIP de outras sessões nesses dois.

Vermelho visto antes, rodando os testes novos sobre o código do HEAD (`aea832135`):

```
driver-trip.contract.test.ts                     → 106 pass, 5 fail (os 5 casos novos/revistos)
delivery-proof-received-by.integration.ts         → 2 pass, 5 fail
```

Depois:

```
$ bunx tsc --noEmit -p apps/api-transportada   → sem erros
$ bun run lint (api)                            → sem erros
$ bun --env-file=../../.env.test test --timeout 120000              → 7485 pass, 23 skip, 0 fail
$ bun --env-file=../../.env.test test ./test/integration/{me-trip,trip-field-office,trip-field-office-review,
    trip-field-office-router,canhoto-ocr-flag,driver-score,delivery-proof-received-by}.integration.ts
  77 pass, 1 fail — o "allowed-actions … recorte" de trip-field-office estourou 30 s (load 8,5);
  isolado: trip-field-office 25 pass / 0 fail, router + review 20 pass / 0 fail
```

### T3.5 — `PATCH /me/trips/current/documents/:documentId/proof/receiver` (CA06)

Testes antes, em `test/trip-delivery-proof/proof-receiver.contract.ts` (entrypoint
`trip-delivery-proof.contract.test.ts`) e num caso novo de `rate-limited-routes.contract.test.ts`:

- corpo: ausente não mexe; forma tolerante; `cousin` limpa a relação sem 400; nome aparado e cortado
  em 120; lista, texto ou chave desconhecida dão 400;
- caso de uso com o dublê: atualiza e devolve `changed: true`; a mesma `Idempotency-Key` não refaz;
  `off` grava nulo; sem entrega ou sem comprovante do motorista, 404
  `TRIP_DELIVERY_PROOF_NOT_FOUND`;
- rota `PATCH` com teto próprio no Postgres.

```
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts ./test/rate-limited-routes.contract.test.ts
error: Cannot find module '../../src/trips/application/update-driver-proof-receiver.use-case.js'
error: Cannot find module '../src/trips/presentation/me-proof-receiver.routes'
 0 pass, 2 fail
```

Implementação:

- `me-proof-receiver.schema.ts`: Zod `.strict()` com os três campos `unknown`, depois
  `normalizeReceivedBy`.
- `me-proof-receiver.routes.ts`: arquivo próprio, fora de `me-trip.routes.ts`, que tem WIP da
  spec 209 e nenhuma rota com teto. Usa `DRIVER_REPORT_POLICY` e teto
  `{ maxRequests: 60, scope: 'me-proof-receiver', store: 'postgres', windowSeconds: 60 }`.
- `update-driver-proof-receiver.use-case.ts`:
  - o evento e a configuração saem das mesmas leituras do anexo (`DrizzleDeliveryProofRepository`);
  - `applyReceivedBySettings` no canal `driver_app`;
  - `withFieldReport` com a operação `document.proof-receiver`. O reenvio devolve `changed: false`
    e o mesmo id.
- `DriverFieldReportTransactionPort.updateDriverProofReceiverWithinTransaction`: `SELECT … FOR NO KEY
UPDATE` nas linhas `photo`/`signature` de `driver_app` daquele evento, e `UPDATE` só quando algo
  mudou. Sem linha, devolve `null` e o caso de uso responde 404.
- `TripDeliveryProofNotFoundError` (404), composição no `main.ts` e o dublê
  `field-report.double.ts` com `proofReceivers`.

Integração, em `delivery-proof-received-by.integration.ts`:

- a foto do motorista é atualizada (`changed: true`, nome, relação e detalhe);
- a mesma chave devolve `{ changed: false, id }`, o valor fica o do primeiro envio e há uma linha
  só em `trip_field_reports`;
- o `cargo` do escritório não é tocado;
- sem foto do motorista responde 404, e o canhoto do escritório fica intocado.

```
$ bunx tsc --noEmit -p apps/api-transportada → sem erros;  bun run lint (api) → sem erros
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts ./test/rate-limited-routes.contract.test.ts
  181 pass, 0 fail
$ bun --env-file=../../.env.test test ./test/integration/delivery-proof-received-by.integration.ts → 9 pass, 0 fail
$ bun --env-file=../../.env.test test --timeout 120000 → 7496 pass, 23 skip, 0 fail
```

### T3.6 — leitura e contratos negativos (CA09, CA10, CA11)

Testes antes, em `test/trip-delivery-proof/received-by-read.contract.ts`:

- CA09: `readDeliveryProofs` devolve `receivedBy`/`receivedByDetail` da mesma linha do nome, e
  `null` no comprovante antigo. A consulta lê as duas colunas.
- CA10: nenhum arquivo de `src/contractor-portal/` cita `receivedBy`/`received_by`.
- CA11, log: nenhum arquivo de `src/` que cite `receivedByDetail` ou `recipientContact` chama
  `logger.*`, `log.*` ou `console.*`.
- CA11, auditoria: nenhum `buildOfficeAuditEntry({ … })`, nem a porta ou a persistência da trilha
  do escritório, leva `receivedBy`/`received_by`.

```
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts   (antes)
(fail) … relação e detalhe saem da mesma linha do nome; o antigo sai com null
(fail) … a consulta lê as duas colunas do comprovante
 168 pass, 2 fail
```

Implementação: `DeliveryProofRecord`/`DeliveryProofView` e `listDeliveryProofs` levam as duas
colunas. As fixtures de leitura (`read.contract.ts` e `late-registration.contract.ts`) ganham os dois
`null`. Na integração entra o CA09, com `listDeliveryProofs` contra o Postgres: a foto com relação e
detalhe, e a assinatura antiga com `null`.

Gates ao fechar a Fase 3 (árvore com WIP das specs 205 e 209):

```
$ bunx tsc --noEmit -p apps/api-transportada → sem erros;  bun run lint (api) → sem erros
$ bun --env-file=../../.env.test test --timeout 120000
  7500 pass, 23 skip, 1 fail — toll-booth-catalog-repository estourou 120 s (load 8,6); isolado 9 pass / 0 fail
$ bun --env-file=../../.env.test test ./test/integration/delivery-proof-received-by.integration.ts → 10 pass, 0 fail
$ bun --env-file=../../.env.test run test:integration   (117 arquivos, 778 s)
  641 pass, 7 skip, 1 fail — aggregate-attachment-outbox estourou 60 s; isolado 2 pass / 0 fail
```

O HEAD da T3.5 (`3d2e918c2`), extraído sozinho, compila com `tsc --noEmit`. Isso confere o blob do
`main.ts`, montado a partir do HEAD.

## Rodada 2 — Fase 4 (2026-09-25, mesma sessão/worktree)

### T4.0 — pré-requisitos, decisão mantida da rodada 1

Conferido de novo: `git merge-base --is-ancestor 1e512a9b9 HEAD` → `YES` (o P0, spec 203, está na
branch). `git log --oneline origin/staging -- .../DriverStopCard.component.tsx` não traz nenhum
commit da 193/203/194 — a 194 fases 1–3 **não** está em `origin/staging`, e o P0 também não (só na
branch local). **Decisão mantida**: a inversão de ordem 193 → 194 já registrada na rodada 1 (a
pedido do usuário, "que quer ver o select") segue valendo nesta rodada — não parei. A T4.3 (preview
com `motorista-api-demo`) e a publicação em staging seguem bloqueadas pela mesma condição.

### T4.1/T4.2 — testes e implementação (juntos, testes vieram prontos)

Os testes de `test/driver-trip/received-by.contract.ts` (proof-fields, offline-attachments,
catalog-parity, driverTripClient) chegaram escritos de uma rodada anterior
(`/private/tmp/claude-502/p193/fase4-received-by.contract.ts` e
`fase4-t41-testes.patch`). Vermelho visto antes de existir `receivedBy.constant.ts`, `proofReceiver.service.ts`
e os campos novos:

```
$ bun test ./test/driver-trip/proof-fields.contract.ts (antes)
SyntaxError: Export named 'DEFAULT_PROOF_SETTINGS' ... (campo receivedBy ausente do tipo)
```

Implementado: `receivedBy` no `DriverDeliveryProofSettings`, `recipientDisplayName`/
`recipientIsCompany` na nota; `toDeliveryProof` com fallback por campo (nunca mais `null` por um
campo só); `proofFormPlan.service.ts` ganha `rendersReceivedBy`, `rendersRecipientShortcut`,
`applyRecipientShortcut`, `listPendingReceiverFields` (nunca em `blockedByFields`) e
`buildReceiverFields` (trim, sem `\p{Cc}`, detalhe sem relação descartado — extraído do cartão);
`receivedBy.constant.ts` novo (cópia por valor de `RECEIVED_BY_OPTIONS` da API, vigiada por
`catalog-parity.contract.ts`); `offlineAttachments.service.ts` ganha `receivedBy`/`receivedByDetail`
no `QueuedAttachment`, `applyAttachmentReceiverFields` estendido e `detectReceiverDrift` (a edição
durante o envio vira `receiverDrift` no resultado da drenagem); `proofReceiver.service.ts` novo
(`buildProofReceiverReport`) + `driverTripClient.service.ts` (`PATCH .../proof/receiver`, método
novo no `request()`); `useDriverTrip.hook.ts` (`updateProofFields` decide entre atualizar o item na
fila ou enfileirar `proofReceiver`; a drenagem enfileira o PATCH da diferença apurada).

Tela (`DriverStopCard.component.tsx`, `DeliveryProofSection`): ordem D7 — os três botões de captura
primeiro, depois "Quem recebeu" (botão "O próprio cliente recebeu", select compacto nativo — R1 —,
"Detalhes" `maxLength={120}`), e só então nome e documento. O botão rápido usa
`applyRecipientShortcut`; para destinatário PJ (`recipientIsCompany`), o nome preenchido recebe foco
e seleção (`useEffect` + `nameInputRef`, um tick depois do `setState`) para o motorista digitar por
cima; para PF, só preenche. A pendência de `receivedBy`/`receivedByDetail` é `role="status"`,
calculada a cada render (nunca guardada em estado) e **fora** da fatia de `blockedByFields` — o
contrato que lê o código-fonte entre `function blockedByFields(` e `function attach(` confere isso
de propósito (por isso o cálculo foi movido para depois de `handleRecipientShortcut`, antes do
`return`). `DriverPendingProofs.page.tsx` ganhou `onProofFieldsUpdate` e os dois campos novos, para
reaproveitar o mesmo formulário na tela "Fotos pendentes".

Dois contratos existentes quebraram pela renomeação de `receiverFields()` → `currentFields()` (a
canonicalização do documento saiu do cartão para `buildReceiverFields`, em
`proofFormPlan.service.ts`): `proof-attach-queue-first.contract.ts` (`'...receiverFields(),'` →
`'...currentFields(),'`) e `proof-fields.contract.ts` (a asserção que lia `canonicalReceiverDocument`
no cartão passou a ler `buildReceiverFields`, a função que herdou a responsabilidade).

```
$ bun run --cwd apps/frontend-driver lint       → eslint . sem erros
$ bun run --cwd apps/frontend-driver typecheck  → tsc --noEmit sem erros
$ bun run --cwd apps/frontend-driver test       → 645 pass, 0 fail, 1315 expect() calls
$ bun run --cwd apps/frontend-driver check      → lint + typecheck + test + build, tudo verde
  (precache 13 arquivos, 681779 bytes — dentro do teto de 1,5 MiB)
$ bun run --cwd apps/frontend-driver smoke      → 2 + 23 = 25 passed (30,9s)
```

### D14 — API, commit próprio

`resolveRecipientIsCompany(taxId)` em `delivery-contact.policy.ts` (14 dígitos → CNPJ/PJ; qualquer
outra contagem → PF), testado antes de existir (`SyntaxError: Export named
'resolveRecipientIsCompany' not found`). `recipientIsCompany: boolean` entra em
`DriverTripDocument`/`DriverPendingProof` (`find-current-driver-trip.use-case.ts`) e é calculado nos
dois pontos de leitura de `drizzle-current-driver-trip.repository.ts` a partir de
`row.recipientTaxId ?? ''` — o mesmo campo que já alimentava `resolveProofSettingsForRecipient`, sem
consulta nova. O fixture `seedNfeDocument` (`me-trip.integration.ts`) ganhou
`taxId: '11222333000181'` no participante `recipient`, e as duas asserções de `toMatchObject`
existentes ganharam `recipientIsCompany: true`.

```
$ bun --env-file=../../.env.test test --timeout 120000                       → 7505 pass, 23 skip, 0 fail
$ bun --env-file=../../.env.test test ./test/integration/me-trip.integration.ts → 11 pass, 0 fail
$ bun --env-file=../../.env.test run test:integration (117 arquivos, 872 s)
  641 pass, 7 skip, 1 fail — package-box-measurement-export estourou 60 s por carga concorrente
  (outras sessões na mesma árvore); isolado: 2 pass, 0 fail em 3,26 s. Sem relação com a spec 193.
```

### Preview — pendente, API de demonstração editada mas não recarregada

A API de demonstração
(`/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada--claude-worktrees-pensive-borg-f59971/bb453e02-a58a-48b5-833a-3401376ec42e/scratchpad/driver-preview-api.ts`,
fora do repositório) ganhou: `Document.recipientDisplayName`/`recipientIsCompany` (a nota 3, "Farmácia
Bem Estar", virou PF de propósito — "Fernanda Souza", `recipientIsCompany: false` — as demais ficam
PJ, mesmo nome do `recipientName`); a primeira parada ganhou `deliveryProof.receivedBy = 'required'`;
rota nova `PATCH .../documents/:id/proof/receiver` (sempre `{ changed: true }`, 200); e `PATCH` na
lista de `access-control-allow-methods` do CORS (faltava, e sem ele o preflight do PATCH cairia).
Sintaxe conferida com `bun build --target=bun` (bundла sem executar). **Arquivo só editado, servidor
não reiniciado** — pedido explícito da tarefa era não tocar o processo do usuário
(`http://localhost:53901`). O usuário reinicia quando quiser ver o select.

**Pendente para a próxima rodada:** T4.3 completa (preview com a API de demonstração recarregada,
prints em 375/768 e o ok do usuário), e as duas condições da T4.0 que continuam falsas —
`origin/staging` sem o P0 e sem a 194 fases 1–3.
