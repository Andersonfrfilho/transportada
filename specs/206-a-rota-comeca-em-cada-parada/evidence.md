# Evidência — 206 A rota começa em cada parada

## Numeração (2026-09-25)

- Antes de criar a pasta, `git fetch && git log --all -- 'specs/206*' 'docs/adr/0087*'` não
  retornou nada. `ls specs` mostrava a 205 (registro tardio) como a última, e `ls docs/adr`, a 0086.
  A 0085 está reservada para a 203 (`specs/204-.../spec.md:7`).
- Nenhum worktree em `.claude/worktrees/*` e `../transportada-wt/*` tinha `specs/206*` nem
  `docs/adr/0087*`.
- **Colisão:** enquanto esta spec era escrita, a sessão da 207 criou
  `docs/adr/0087-a-parada-mostra-quanto-falta-e-o-caminho.md` e já cita a ADR-0087 na spec dela.
  Esta ADR passou a **0088**: conferido que nem `ls docs/adr` nem o `git log --all` nem as specs
  207–209 usavam o número.

## Leitura do código que a spec cita (2026-09-25, árvore `work/driver-app`)

- **API:**
  - `trip.schema.ts:986-987`, `:989-1035`, `:1104-1107` e `:1289-1354`;
  - `me-trip.routes.ts:46-49`, `:299-356`;
  - `report-stop-arrival.use-case.ts:24`, `:51-166`;
  - `start-field-trip.use-case.ts:87-163`;
  - `trip-state.policy.ts:106-118`, `:254-255`, `:282-298`;
  - `trip-timeline.types.ts:19-51`, `trip-timeline-stop.query.ts:38-57`;
  - `drizzle-driver-field-report.repository.ts:274-305`, `drizzle-trip-route.repository.ts:717-750`.
- **App:**
  - `DriverTripWorkspace.page.tsx:492-590`;
  - `driverTripView.service.ts:19-43`;
  - `driverTripClient.service.ts:125-126`, `:260-262`;
  - `documentActivity.service.ts:70-78` (WIP);
  - `DriverStopCard.component.tsx:244-250`, `:378-384`, `:463-490` (WIP);
  - `lateRegistration.service.ts:11-16` (WIP).
- **Painel:** `tripResponse.validation.ts:901-911`, `:1299-1325`; `trip.types.ts:267-277`.
- **E-mail, só pelos nomes das variáveis:**
  - worker: `environment.schema.ts:22`, `:69-71`, `:140`, `:157-162`, `:423-435`;
  - produção: `.railway/railway.ts:151`, `:175-179`;
  - local: `.env.example:151-157`.
- **Cota gratuita do Resend** (conferida em `resend.com/pricing` em 2026-09-25): 3 000/mês, 100/dia,
  sem excedente pago no plano Free.

## Decisões do usuário (2026-09-25)

- "O iniciar rota é em cada item da viagem." Fluxo Iniciar rota → Cheguei → Entreguei, fim do botão
  de viagem, aviso ao cliente e medição do trajeto.
- Sobre o aviso ao destinatário: "pode mandar e-mail se for sem custo".

## Revisão 1 — crítica (opus), 2026-09-25

A crítica reprovou a primeira versão. O que mudou, por achado:

- **C1** — o CHECK passou a `en_route_since is null or (arrived_at is null and completed_at is null)`.
  - Toda escrita de `arrived_at`/`completed_at` zera `en_route_*` no mesmo `UPDATE`.
  - Os dois escritores foram conferidos: `drizzle-driver-field-report.repository.ts:263-264` e
    `:418-428`. Os outros `update(tripStops)` (`drizzle-trip-route.repository.ts:240`, `:379`,
    `:385`, `:735`) não tocam essas colunas.
  - Há contrato estático, e os casos (a), (b) e (c) estão na T2.2. O (b) é defeito provável da 205.
- **M1** — trava `trip_stops ... order by id` antes da decisão, e depois `trips`. Sem `catch` de
  `23505`. CA4 ampliado.
- **M2** — `markTripOnDeliveryRoute` na porta, no molde de `markTripInTransit` (`:310-343`). O
  `updateStatus` abre a própria transação (`drizzle-current-driver-trip.repository.ts:166-203`).
- **M3** — `trip_field_reports.result_changed`. O no-op liquida a chave, e o replay repete
  `changed: false`.
- **M4** — a chegada `office` zera só a própria parada.
- **M5** — `drainQueueWithAttachments` mantém o recusado (`offlineAttachments.service.ts:302-306`,
  `:318-326`).
  - `resolveEnRouteStopId` ignora o item recusado.
  - Entra o `tappedAt`, com o servidor ordenando pelo toque.
  - D16 e R1 corrigidas: a fila não descarta.
- **M6** — chave ausente é API antiga e libera o Cheguei (D17). A reversão é app → API → banco.
- **M7** — D9 dá um nome e um dono: `resolveEnRouteStopId`, `en_route_since` e `en_route_tapped_at`
  (`enRouteTappedAt`, âncora da 207). `findCurrentStop` é da 206. A tabela de conflito ganhou 195,
  200, 203, 207 e 209.
- **M8** — D15 ganhou:
  - supressão por bounce e reclamação (Svix);
  - subdomínio próprio;
  - os dois `429`;
  - o interruptor global;
  - o opt-in do contratante;
  - o atraso de 2 min;
  - HMAC com segredo;
  - a retenção.
- **Menores:**
  - `NOT VALID` + `VALIDATE` e medição na T1.3;
  - a asserção de rollback com o journal;
  - `occurredAt = input.now`;
  - prioridade 0 (o cursor é `::int`, `trip-timeline-condition.helper.ts:43`);
  - o contrato da ADR-0081 §7 condicional à 196;
  - testes em `test/trip-application/`;
  - API de demonstração versionada;
  - premissas atualizadas (HEAD `19f8a2afd` na conferência, 106 commits atrás de `origin/staging`;
    `3e3730732` commitado localmente; migration `20260926003822_late_registration`;
    `canhoto_ocr_enabled` em `:59`);
  - a sonda sem efeito (`401`/`400`);
  - o N da RF8 lido do snapshot;
  - as emendas da ADR-0081 e o aviso à 196 na T0.1;
  - as duas ADR-0058 citadas pelo caminho;
  - a emenda da 158 D6;
  - a cascata declarada;
  - as irmãs (Iniciar rota, aviso, amostra);
  - `expired` fora;
  - a R2 com a penalidade;
  - `route_planned` escondido;
  - aceite em todas as tasks.

## Pendências registradas ao escrever

- A entrada no `docs/SECURITY.md` sobre o aviso ao destinatário **não foi escrita nesta sessão**
  (edição recusada pelo modo de permissão). Ela ficou como T7.1, com o ok do usuário ao texto.

## Tasks

### T0.1 — ADR-0088 conferida e `aceita` (2026-09-26)

**Árvore:** `work/driver-app`, HEAD `af049bb73`, worktree
`.claude/worktrees/pensive-borg-f59971`. `origin/staging` em `16c4ad780`.
`git rev-list --left-right --count HEAD...origin/staging` → **75 à frente, 184 atrás**.

**⚠️ O rebase que esta task pedia não aconteceu, e não podia acontecer.** A árvore tem trabalho não
commitado de outras sessões (`apps/frontend-driver/src/.../DriverStopCard.component.tsx`, os dois
`driverTrip*.locale.json`, `received-by.contract.ts`, `.claude/launch.json`,
`specs/PERGUNTAS-ABERTAS.md`) e, no índice, deleções preparadas dos `.md` das specs 206/207 e da
ADR-0088 com os arquivos de volta como não rastreados. Com a árvore suja o `git rebase` recusa, e
`git stash` está proibido (pilha compartilhada). Por isso **as premissas foram conferidas contra
`origin/staging` por `git grep <ref>`**, que é mais forte do que conferir contra a árvore local
atrasada. Consequências para as tasks seguintes em "Base da árvore", abaixo.

**A ADR-0088 já estava alinhada com as Revisões 2 a 5** quando esta task começou — o texto foi
emendado ainda em 2026-09-26, antes desta sessão, e o conteúdo é **byte a byte igual ao de
`origin/staging`**. Conferido item por item do aceite:

- `:24` diz "evento, estado, fila, **bloqueio**, cancelamento, travas, medição, teto, supressão e a
  porta de saída do aviso" — sem "troca";
- `:73-78` é o bloqueio: "A parada aberta bloqueia as outras — tocar noutra é recusado, não troca",
  com `409 TRIP_HAS_STOP_EN_ROUTE`, `{ enRouteStopId, enRouteStopSequence }`, sem tocar a parada
  aberta, sem liquidar a chave, e a recusa **depois** do no-op por toque velho;
- `:79-83` dá à trava a justificativa nova (serializar a leitura de "alguma parada a caminho?");
- `:89-112` é a §2b inteira do "Cancelar rota", com `departure_cancelled`,
  `409 TRIP_STOP_DEPARTURE_NOT_CANCELLABLE`, "cancelar não inicia parada nenhuma" e a amostra
  descartada;
- `:166-180` é o aviso de cancelamento com a supressão nos 2 min, o "cada Iniciar rota avisa", a
  unicidade por saída e a vaga reservada por obrigação em aberto (D19);
- `:185-211` é a §7b: nasce desligado por configuração de empresa, "desligado é não existir", o aviso
  como evento com destinos, uma porta e um adaptador, teto por canal (D20);
- decisores `:10-23`: os quatro pedidos de 2026-09-26 estão citados.
- **A linha desatualizada que a task mandava conferir nas alternativas descartadas já não existe.** No
  lugar de "Recusar a segunda parada a caminho" está "Trocar a parada a caminho no segundo toque →
  Decisão do usuário em 2026-09-26: a parada aberta bloqueia as outras" (`:239`). As três menções
  restantes a "troca" são **históricas ou descartadas** (`:12`, `:95`, `:239`), nunca a decisão
  vigente — que é como o aceite "sem nenhuma menção a troca de parada" pode ser cumprido sem apagar o
  registro de que a decisão mudou.

**Status:** `proposta` → **`aceita`** (`0088:3-6`).

#### As onze premissas do `plan.md`, conferidas em `origin/staging`

| #   | Premissa                                                                                      | Conferido em `origin/staging`                                                                                                                                                                                                                                                                                                                                                                                         | Resultado                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `TRIP_STOP_EVENT_KINDS` = `arrived\|delivered\|returned\|occurrence`, `kind` `text` com CHECK | `apps/api-transportada/src/database/trip.schema.ts:986`; CHECK `trip_stop_events_kind_check` em `:1104-1107`; contrato do CHECK em `test/database-migration/trip-constraints.assertion.ts:489` (o `'chegou'` recusado)                                                                                                                                                                                                | **confere**                                                                                                                                                                                                                                            |
| 2   | Idempotência em `trip_field_reports`, unique `(company_id, idempotency_key)`                  | `trip.schema.ts:1294`, `:1342` (`trip_field_reports_company_key_unique`), `:1343`                                                                                                                                                                                                                                                                                                                                     | **confere**                                                                                                                                                                                                                                            |
| 3   | `start-route` ignora o corpo; `updateStatus` abre a própria transação                         | `me-trip.routes.ts:48` (`TRIP_START_ROUTE_PATH`)                                                                                                                                                                                                                                                                                                                                                                      | **confere**                                                                                                                                                                                                                                            |
| 4   | Chegada exige `TRIP_ON_ROAD_STATUSES`; `dispatched → in_transit` por `markTripInTransit`      | `drizzle-driver-field-report.repository.ts:50`, `:61` (`FIELD_REPORTABLE_TRIP_STATUSES`), `:312`                                                                                                                                                                                                                                                                                                                      | **confere**                                                                                                                                                                                                                                            |
| 5   | Só dois escritores de `arrived_at`/`completed_at`                                             | `drizzle-driver-field-report.repository.ts:265` (`markStopArrived`) e `:419-427` (`completeStopIfSettled`, com `fillMissingArrival` em `:426`). Os sete `update(tripStops)` do `src` foram listados: os quatro de `drizzle-trip-route.repository.ts` (`:240`, `:379`, `:385`, `:735`) não tocam essas colunas, e o terceiro do repositório de campo (`:291`, `shiftPendingStops`) grava **só** `estimated_arrival_at` | **confere** — e o terceiro escritor, que a premissa não nomeava, foi conferido e está fora                                                                                                                                                             |
| 6   | A app manda `start-route` direto; a drenagem mantém o item recusado                           | `apps/frontend-driver/.../driverTripClient.service.ts:128`, `:272`; `DriverTripWorkspace.page.tsx:511`; `offlineAttachments.service.ts:332` (`drainQueueWithAttachments`)                                                                                                                                                                                                                                             | **confere**                                                                                                                                                                                                                                            |
| 7   | O painel recusa a página da linha do tempo com um kind desconhecido                           | `apps/frontend-transportada/src/modules/trip/shared/tripResponse.validation.ts:1331` — `isOneOf(value.kind, TRIP_TIMELINE_KINDS)` dentro de `isTimelineItem`, sem descarte; `TRIP_TIMELINE_KINDS` em `shared/trip.types.ts:267-278`, nove kinds, **sem** `stop.departed`                                                                                                                                              | **confere — e a 192 T0.2 não está publicada**: a T0.3 vai pelo caminho longo ("Senão"), não pelo curto                                                                                                                                                 |
| 8   | `3e3730732` local; a API da 205 sem commit; migration `20260926003822_late_registration`      | `git branch -r --contains 3e3730732` → vazio (segue local). **A API da 205 já está em `origin/staging`** (`lateRegistration` em `trip.schema.ts`, `attach-delivery-proof.use-case.ts`, `document-outcome-steps.service.ts`, `driver-field-report.port.ts`, `read-delivery-proof.use-case.ts`). Última migration de `origin/staging`: `20260926003822_late_registration`                                               | **divergiu para melhor** — a premissa era "a API da 205 continua sem commit", e ela subiu. Nada do desenho depende disso; o que muda é que a Fase 4 perde metade da espera, e o caso (b) da T2.2 (`completed_requires_arrived`) já pode ser exercitado |
| 9   | A 196 não está implementada: `location_state` não existe no `src`                             | `git grep -l 'location_state\|locationState' origin/staging -- apps/api-transportada/src` → vazio                                                                                                                                                                                                                                                                                                                     | **confere**                                                                                                                                                                                                                                            |
| 10  | O e-mail do destinatário não é gravado                                                        | `git grep -n email origin/staging -- 'apps/api-transportada/src/database/nfe*.schema.ts'` → vazio. A Fase 7 segue dependente da 193 T6.5                                                                                                                                                                                                                                                                              | **confere**                                                                                                                                                                                                                                            |
| 11  | O interruptor da leitura do canhoto                                                           | `company-delivery-proof-settings.schema.ts:59` (`canhotoOcrEnabled`, `default false`)                                                                                                                                                                                                                                                                                                                                 | **confere**                                                                                                                                                                                                                                            |

#### Emendas commitadas nesta task

- `docs/adr/0088-a-rota-comeca-em-cada-parada.md:3-6` — status `aceita`.
- `docs/adr/0081-todo-toque-do-motorista-carimba-onde-aconteceu.md:46-47` — a linha "Iniciar rota /
  Conferir carga" da tabela "Finalidade" virou duas: "Conferir carga → marcar onde a viagem começou" e
  "Iniciar rota (ADR-0088) → base do tempo de trajeto **da parada**".
- `docs/adr/0058-a-viagem-comeca-e-termina-por-toque-do-motorista.md` e
  `docs/adr/0058-o-motorista-abre-a-porta-do-despacho.md` — "**Emendada por ADR-0088**" no cabeçalho.
- `specs/196-todo-evento-carrega-onde-aconteceu/tasks.md`, T5.3 — aviso de que o "Iniciar rota" saiu do
  toque direto e foi para a fila, e que o alvo de 3,2 s perde o objeto.

#### Base da árvore — o que isto bloqueia (aberto para o usuário decidir)

`git diff --name-only HEAD origin/staging` sobre os arquivos das Fases 0 e 1:

- **`apps/api-transportada/src/database/trip.schema.ts` é idêntico** nos dois lados, e
  `test/database-migration/trip-constraints.assertion.ts` também. Estas partes da Fase 1 são seguras.
- **`apps/frontend-transportada` divergiu em 112 arquivos (+14 102/−334 linhas)**, incluindo o
  `tripResponse.validation.ts` da T0.3, que em `origin/staging` mudou até de diretório
  (`modules/trip/shared/`, não `modules/trip/validations/`) e de linha (`:1331`, não `:1299-1325`).
  Implementar a T0.3 nesta árvore produz um diff que não se publica.
- **A cadeia de migrations divergiu.** `origin/staging` tem sete migrations que esta árvore não tem
  (`20260924201711_contractor_contact_channels` … `20260925185207_occurrence_conversation_automatic_message`),
  e por isso o `snapshot.json` da última pasta comum (`20260926003822_late_registration`) é **diferente**
  nos dois lados. O `drizzle-kit@1.0.0-rc.4` gera o snapshot novo diffando contra o último da cadeia:
  gerado aqui, ele nasce sem as tabelas daquelas sete migrations e, depois do rebase, o
  `bun run db:generate` **não** diria `no_changes` — ele quereria criar `occurrence_conversation*` de
  novo. É exatamente o gate que a T1.2 exige. A numeração, essa, está livre: nenhuma outra sessão
  numerou depois de `20260926003822`.
