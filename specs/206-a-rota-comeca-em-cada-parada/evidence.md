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

#### Base da árvore — resolvida (2026-09-26)

O bloqueio acima foi desfeito pela opção B: árvore nova em
`…/scratchpad/spec-206`, criada com
`git worktree add -b work/spec-206 … origin/staging`, HEAD `16c4ad780`, **zero commits atrás**, `.env`
e `.env.test` por link simbólico, `bun install --frozen-lockfile` (1545 pacotes) e `format:check`
verde — o vermelho de 12 arquivos era da árvore antiga. O commit da T0.1 (`1e348d814`) foi
cherry-pickado para `6efbf8549`. Numeração das migrations reconferida em `origin/staging` depois do
`fetch`: a última segue `20260926003822_late_registration`. **Todas as tasks a partir da T0.2 correm
nesta árvore.**

### T0.2 — Roteiro de publicação e de reversão da D16 (2026-09-26)

A regra que manda é a da **ADR-0081 §9: a API não é revertida com a app nova no ar.** Dela sai tudo o
que está abaixo — a ordem de subida é a ordem em que cada peça passa a _tolerar_ a próxima, e a de
reversão é a inversa porque é a ordem em que cada peça deixa de ser _exigida_.

#### O que sobe em cada etapa

⚠️ **Cada etapa é um push próprio para `staging`, e isso é o que faz a ordem existir.** Em
`.railway/railway.ts`, `watchPatterns` só existe nos serviços `deploy/*` (`:395`, `:462`, `:509`,
`:530`); `api-transportada` (`:65`), `frontend-transportada` (`:186`) e `frontend-driver` (`:636`) **não
têm nenhum**, e o comentário de `:490` registra que sem `watchPatterns` o serviço redeploya a **todo**
push. Um commit que carregue painel + API + app sobe os três de uma vez e a ordem abaixo deixa de
existir. O push da etapa 2 não leva mudança da app; o da etapa 3 não leva mudança de API nem de painel.

**Etapa 1 — painel tolerante (T0.3), sozinha.**

- Sobe: `apps/frontend-transportada` com o descarte do kind desconhecido na linha do tempo, os dois
  kinds novos em `TRIP_TIMELINE_KINDS` e os rótulos pt/en.
- Não sobe nada de banco, de API nem da app do motorista.
- **Por que primeiro:** hoje o painel recusa a **página inteira** da linha do tempo diante de um kind
  que não conhece (`isOneOf(value.kind, TRIP_TIMELINE_KINDS)`). Se a API subisse antes, o primeiro
  `departed` gravado apagaria a linha do tempo de toda viagem que o contivesse — não um item faltando,
  a página em branco.
- **Efeito observável:** nenhum. Nenhum `departed` existe ainda. É por isso que esta etapa pode subir
  em qualquer janela, sem acompanhamento.
- **Como se sabe que deu certo:** a linha do tempo de uma viagem com histórico continua abrindo. Só
  isso; não há caso novo para exercitar.

**Etapa 2 — banco, worker e API, juntos, na mesma publicação.**

- **O worker acompanha** (a ADR-0081 §9 diz "banco, worker e API", e a T1.2 altera a cópia do schema em
  `apps/worker-transportada/src/database/trip-execution.schema.ts`). A mudança é **inerte nas duas
  direções**: o expurgo de posição projeta só `id` e atualiza colunas nomeadas
  (`trip-location-purge/infrastructure/drizzle-trip-location.repository.ts:25-37`), então o Drizzle nunca
  emite `tapped_at` no SQL. Por isso o rollback do banco **não** exige reverter o worker, e o worker
  velho conviveria com o schema novo. `apps/cron-transportada` não toca `trip_stops`/`trip_stop_events` e
  `apps/frontend-client` não consome linha do tempo — os dois estão fora do roteiro de propósito.
- Sobe: a migration `<ts>_stop_departure` (as duas colunas de `trip_stops`, os dois CHECKs, o índice
  único parcial, `trip_stop_events.tapped_at`, `trip_field_reports.result_changed` e os **dois** kinds
  `departed`/`departure_cancelled` no CHECK), e a API com `depart`, `cancel-departure`, os kinds na
  linha do tempo e a amostra de trajeto.
- **Por que juntos:** a migration é aditiva e sem efeito sozinha, mas a API não sobe sem ela — a
  primeira consulta a `en_route_since` responderia `42703`. O `preDeployCommand` da API roda as
  migrations, e `assertMigrationsAreComplete` aborta o deploy inteiro se sobrar migration pendente, o
  que é exatamente a rede que se quer aqui.
- **Efeito observável:** nenhum, até a app subir. Nada no produto chama `depart` nesta etapa; o painel
  passa a saber ler um evento que ninguém grava ainda.
- **Como se sabe que deu certo:** a **sonda da T2.6**, abaixo.

**Etapa 3 — a app do motorista (`apps/frontend-driver`), por último.**

- Sobe: o botão "Iniciar rota" por parada, o bloqueio das outras paradas com motivo e atalho, o
  "Cancelar rota" com confirmação, o `tappedAt` no item de fila e o `resolveEnRouteStopId`.
- **Por que por último:** é a única peça que _exige_ as anteriores. Com ela no ar, a etapa 2 fica presa
  (ADR-0081 §9).
- **Efeito observável:** aqui, e só aqui, o motorista vê a mudança. É a etapa que pede janela e
  acompanhamento.

**Fase 7, quando existir: sobe depois de tudo e sobe sem efeito** (Revisão 5). A migration cria os
dois interruptores `default false`, o relay não encontra outbox, e o efeito aparece quando uma
transportadora liga o aviso. Não há janela de risco de envio indevido no deploy; a atenção é na
**primeira empresa a ligar**, não na publicação.

#### A sonda da T2.6

Depois do deploy da **etapa 2** em staging, e **antes de a etapa 3 subir**, quatro requisições que não
gravam nada:

⚠️ **A primeira versão desta sonda estava errada, e o `architect` pegou** (achados 1 a 4 do parecer,
colado abaixo). O `401` **não** prova que a rota existe: `authentication.authenticate()` roda **antes**
do `matchRoute` (`src/http/router.service.ts:279` vs. `:286`), então um caminho que nunca existiu também
responde `401` sem token. O que prova o deploy é o **par** `400` na rota real × `404` num caminho
deliberadamente falso. A sonda corrigida:

| #   | Requisição                                                                                      | Resposta esperada | O que ela prova                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | `POST .../stops/<uuid>/depart` **sem token**                                                    | `401`             | só que **nenhuma rota anônima** foi aberta nesse caminho. Não prova existência — qualquer caminho inexistente também dá `401` |
| 2   | `POST .../stops/<uuid>/cancel-departure` **sem token**                                          | `401`             | idem                                                                                                                          |
| 3   | `POST .../stops/<uuid>/depart` com token de motorista e **uma chave extra no corpo**            | `400`             | a rota passou do roteamento e chegou ao parser Zod `.strict()`                                                                |
| 4   | `POST .../stops/<uuid>/cancel-departure`, idem                                                  | `400`             | idem                                                                                                                          |
| 5   | **controle:** `POST .../stops/<uuid>/caminho-que-nao-existe`, com o mesmo token e o mesmo corpo | `404`             | que o `400` das linhas 3 e 4 **significa** algo: sem este `404`, o par não distingue nada                                     |

Quatro condições sem as quais a sonda não vale:

- **O `<uuid>` é um UUID v4 canônico gerado na hora** (`crypto.randomUUID()`), nunca uma string
  inventada à mão. O segmento dinâmico é casado por formato (`router.service.ts:715-722`), e o que não
  for UUID canônico "vira 404 sem tocar na rota" (`:86`) — daria exatamente o `404` que reprova a etapa.
- **O token é de um motorista da empresa, com `trip.report`** (`DRIVER_REPORT_POLICY`,
  `me-trip.routes.ts:99`). `resolveCompany` (`router.service.ts:291`) e `authorize` (`:295`) rodam
  **antes** do `parse` (`:328`), então token de outra empresa ou sem a permissão responde `403`, não
  `400`. **`403` e `429` também provam que a rota existe; só `404` reprova.**
- **O `depart`/`cancel-departure` têm de parsear o corpo com schema `.strict()`, no molde do
  `STOP_ARRIVE_PATH`** (`me-trip.routes.ts:362-368`, sobre `me-trip.schema.ts:69`) — e **não** no do
  `start-route`, que é `parse: () => undefined` (`:337`). Escrito no molde do `start-route`, a chave
  extra responderia `200` e a sonda passaria a não provar nada. **Isto é obrigação da T2.1**, e vai lá
  como contrato: "chave extra no corpo → `400`".
- **Sem `Idempotency-Key`**, para não reservar chave nenhuma.

O que a sonda **gasta**: nada de domínio — nenhuma parada é tocada e nenhuma chave de idempotência é
liquidada —, mas o teto de rota é conferido **antes** do `parse` (`router.service.ts:296-301`, e o
comentário de `:76-81`: "corpo inválido e replay idempotente também gastam"), então ela consome cinco
requisições do teto e grava a janela de rate limit. Com o teto em Postgres (D15), isso conta entre
réplicas.

As cinco respostas vão para este arquivo, na T2.6, **antes de a etapa 3 subir**.

#### O critério para reverter cada peça

A pergunta que decide é sempre a mesma: **a peça de cima ainda está no ar?**

| Peça                           | Reverter quando                                                                                                                                         | Pré-condição                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Custo da reversão                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **App (etapa 3)**              | o motorista não consegue trabalhar: "Iniciar rota" não responde, o bloqueio prende uma parada que já fechou, ou o Cheguei desaparece                    | nenhuma — é a primeira a voltar, sempre                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | nenhum dado se perde. A app velha funciona contra a API nova: ela chama `POST /me/trips/current/start-route`, que **segue aceito** (ADR-0074 §5), e o snapshot com `enRouteSince` é chave a mais que ela ignora                                                                                                                                                                                                     |
| **API (etapa 2, código)**      | erro de servidor no `depart`/`cancel-departure`, `500` do índice único (que seria defeito da trava), ou o `409` recusando parada que não está a caminho | **a app da etapa 3 já voltou, e a volta dela é uma janela, não um instante.** A app é PWA: a versão antiga sobrevive nos aparelhos até o service worker atualizar (`spec.md:485-486`), e isso vale igual na volta. A pré-condição é **medida**: zero `depart`/`cancel-departure` chegando por 15 min contados depois do deploy de reversão da app, não "o deploy terminou". Com a app nova ainda no ar, o `depart` passa a responder `404`: o item fica recusado e visível na fila, com `rejectionCause`, nunca descartado — mas o motorista fica sem caminho para abrir parada, e isso é pior do que o defeito que se está revertendo | nenhum dado se perde; os `departed` já gravados ficam. O painel continua lendo os dois kinds (etapa 1 fica no ar)                                                                                                                                                                                                                                                                                                   |
| **Banco (etapa 2, migration)** | só por defeito **de schema**: um CHECK que recusa escrita legítima ou o índice único bloqueando parada que devia poder abrir                            | **API e app já voltaram**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | ⚠️ **destrutivo.** O `rollback.sql` apaga todos os `trip_stop_events` de kind `departed` e `departure_cancelled` e derruba `en_route_since`/`en_route_tapped_at`. Só roda **antes de haver uso real** ou com **aprovação humana explícita**. As linhas de `trip_field_reports` com `operation = 'stop.depart'` sobrevivem (não têm FK para o evento), e isso é inofensivo: uma app velha nunca reusa aquelas chaves |
| **Painel (etapa 1)**           | praticamente nunca — e **nunca enquanto houver um `departed` gravado**                                                                                  | banco já revertido                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | reverter a tolerância com eventos no banco devolve o defeito que ela existe para evitar: a página da linha do tempo volta a ser recusada inteira. É a peça que sobe primeiro e desce por último                                                                                                                                                                                                                     |

Duas regras que atravessam a tabela:

1. **Reverter o banco não é a primeira reação a nada.** As três primeiras linhas são reversíveis sem
   perda; a quarta é a única com perda, e o defeito que a justifica é de schema, não de
   comportamento. Defeito de comportamento se conserta na API.
2. **Nenhuma reversão é parcial dentro de uma etapa.** Banco e API sobem juntos e voltam juntos —
   API velha com o schema novo funciona (as colunas são aditivas e nulas), mas API nova com o schema
   velho responde `42703` **em toda leitura que projeta as colunas novas**, a começar pelo snapshot
   `/me` e pelo `listStops` da T2.4. Consulta do painel que não as projeta continua respondendo, e é por
   isso que o sintoma apareceria primeiro no motorista, não no escritório.

#### Pendência que o parecer levantou e não é desta fase

O descarte de `location_state = 'expired'` da amostra de trajeto (`spec.md:507`, `tasks.md:271`, Fase 3)
usa coluna que a **premissa 9 diz não existir** — a 196 não está implementada, e a T0.1 reconfirmou isso
em `origin/staging`. Ou o caso vira código morto, ou trava a T3.1. Fica condicionado à 196, do mesmo
jeito que `spec.md:226` já condiciona a **escrita**. Não mexi na spec: é decisão da Fase 3.

#### Parecer do `architect` (opus) sobre este roteiro, e o que foi feito de cada achado

Revisão pedida sobre a primeira versão da seção acima. **Veredito:** _"ordem e critérios de reversão
aprovados; a sonda não é publicável como está — feche os achados 1 a 4 e acrescente o push separado por
etapa (5) antes de tratar a T0.2 como concluída."_

| #   | Sev.           | Achado (com o arquivo:linha do parecer)                                                                                                                                                                                                           | O que foi feito                                                                                                                                                                          |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **bloqueante** | `401` sem token **não** prova que a rota existe: `authentication.authenticate()` roda antes do `matchRoute` (`router.service.ts:275` vs. `:286`; `authentication.service.ts:37-40`). Caminho inexistente também dá `401`                          | **corrigido.** Conferi eu mesmo (`:279` vs. `:286`). As linhas 1 e 2 passaram a afirmar só "nenhuma rota anônima", e entrou a **linha 5 de controle**, que exige `404` num caminho falso |
| 2   | importante     | "uuid inventado" pode dar `404` falso: o segmento dinâmico é casado por formato (`router.service.ts:717`, `:721`, comentário de `:86`)                                                                                                            | **corrigido.** Agora é "UUID v4 canônico gerado na hora (`crypto.randomUUID()`)"                                                                                                         |
| 3   | importante     | `403` é desfecho possível e também prova existência: `resolveCompany` (`:291`) e `authorize` (`:295`) rodam antes do `parse` (`:328`); `DRIVER_REPORT_POLICY` em `me-trip.routes.ts:99`                                                           | **corrigido.** O token ficou nomeado ("motorista da empresa, com `trip.report`"), e está escrito que `403` e `429` provam existência — só `404` reprova                                  |
| 4   | importante     | O `400` depende de decisão de implementação: o `arrive` parseia corpo `.strict()` (`me-trip.routes.ts:362-368`, `me-trip.schema.ts:69`), mas o vizinho `start-route` é `parse: () => undefined` (`:337`) — nesse molde a chave extra daria `200`  | **corrigido.** Conferi os dois moldes. A condição está escrita na sonda **e virou obrigação da T2.1** ("chave extra → `400`")                                                            |
| 5   | importante     | Cada etapa é um push separado, e o roteiro não dizia: sem `watchPatterns` o serviço redeploya a todo push (`.railway/railway.ts:65`, `:186`, `:636`, comentário de `:490`)                                                                        | **corrigido**, como aviso no começo de "O que sobe em cada etapa"                                                                                                                        |
| 6   | importante     | "a app já voltou" não é estado observável num PWA (`spec.md:485-486`)                                                                                                                                                                             | **corrigido.** A pré-condição virou janela medida: zero `depart` por 15 min                                                                                                              |
| 7   | importante     | O worker sai do roteiro e muda nesta spec (ADR-0081 §9; `tasks.md:129-130`). O revisor conferiu que a mudança é **inerte** (`drizzle-trip-location.repository.ts:25-37` projeta só `id`), e que cron e `frontend-client` estão legitimamente fora | **corrigido.** A etapa 2 virou "banco, worker e API", com o motivo da inércia e a consequência (o rollback do banco não exige reverter o worker)                                         |
| 8   | menor          | "não gravam nada" é inexato: o teto de rota é conferido antes do `parse` (`router.service.ts:296-301`, `:76-81`)                                                                                                                                  | **corrigido.** "nada de domínio; gasta o teto e grava a janela de rate limit"                                                                                                            |
| 9   | menor          | "`42703` em toda leitura de parada" é largo demais — só quebra o que **projeta** as colunas novas                                                                                                                                                 | **corrigido**, com o snapshot `/me` e o `listStops` da T2.4 nomeados                                                                                                                     |
| 10  | menor          | A Fase 3 não pede etapa própria, mas o descarte de `location_state = 'expired'` (`spec.md:507`, `tasks.md:271`) usa coluna que a premissa 9 diz não existir                                                                                       | **registrado** como pendência da Fase 3 nesta evidência; não mexi na spec                                                                                                                |

O parecer também **confirmou por leitura de código**, e isso vale registrar porque sustenta as
afirmações que ficaram: a ordem de subida e de reversão; que a etapa 1 é necessária antes da 2 (o painel
recusa a página inteira, `tripResponse.validation.ts:1331`); que banco e API vão juntos e a rede existe
(`.railway/railway.ts:69`, `pre-deploy.service.ts:22`, `:129`); o critério (a) — o leitor do snapshot da
app lê chaves nomeadas sobre `Record<string, unknown>`, sem `.strict()`
(`driverTripResponse.validation.ts:28`, `:154`, `:213`), e `on_delivery_route` já existe
(`trip.schema.ts:79`), então não há status novo escondido na etapa 2; o critério (b), pela aditividade da
migration (`plan.md:260-276`); o critério (c), pelo mesmo `isOneOf`; e que **nenhuma rota inexistente
responde `400`** — fora do `parse` os desfechos são `401`, `404`, `403` e `429`, e nenhuma rota existente
tem forma `.../stops/:stopId/:algo` que casasse `depart` por acidente (`me-trip.routes.ts:47-92`).

### T0.3 — Painel tolerante (2026-09-26)

Foi pelo **caminho longo** ("Senão" da task): a T0.2 da 192 **não** está em `origin/staging`, como a
T0.1 mediu. Caminhos de `origin/staging`, não os da spec: `modules/trip/shared/`, não
`modules/trip/validations/`.

**Contrato antes, e o vermelho:** `bun test ./test/trip.contract.test.ts` →
**`1748 pass, 9 fail`**, as nove novas:

```
(fail) tolerância a kind desconhecido … > descarta o item de kind desconhecido e mantém os conhecidos, na ordem
(fail) tolerância a kind desconhecido … > página inteira desconhecida vira lista vazia e preserva o cursor
(fail) tolerância a kind desconhecido … > aceita stop.departed
(fail) tolerância a kind desconhecido … > aceita stop.departure_cancelled
(fail) tolerância a kind desconhecido … > os dois kinds novos estão no vocabulário
    error: expect(received).toContain("stop.departed")
(fail) rótulos da saída da parada … > stop.departed traz a sequência da parada        → Received: undefined
(fail) rótulos da saída da parada … > stop.departure_cancelled traz a sequência …     → Received: undefined
(fail) rótulos da saída da parada … > sem parada, os dois caem no título sem sequência
(fail) rótulos da saída da parada … > os quatro rótulos existem em pt e en            → Received: undefined
```

**O que foi implementado**

- `src/modules/trip/shared/trip.types.ts` — `stop.departed` e `stop.departure_cancelled` em
  `TRIP_TIMELINE_KINDS`, logo depois de `stop.arrived`.
- `src/modules/trip/shared/tripResponse.validation.ts` — `hasUnknownTimelineKind` (novo) e o
  `tripTimelineFromApi` **descartando** o item de kind desconhecido em vez de recusar a página.
- `src/modules/trip/shared/tripTimeline.service.ts` — dois `case` no `switch` de
  `resolveTripTimelineTitle`, com o desvio de `stop === null` no molde do `stop.arrived`.
- `src/modules/trip/locales/trip.locale.json` e `trip.en.locale.json` — quatro rótulos cada.
- `apps/api-transportada/src/trips/application/trip-timeline.types.ts` — **os dois kinds e a prioridade
  0**. Não estava previsto na T0.3, e é obrigatório: `test/trip/timeline.contract.ts:233-243` guarda a
  **paridade exata, na ordem**, entre a lista do painel e a da API (cópia por valor, o bundle não carrega
  código de lá). Sem isso a T0.3 não fecha. É o bullet "API" da D12; o mapeamento de `listStopEventRows`
  **continua** na Fase 2, e até lá nenhum `departed` é emitido — a lista é vocabulário, não comportamento.

**Três decisões de desenho que o contrato fixou**

1. **O `nextCursor` é preservado mesmo quando a página inteira é descartada.** Sem isso, "carregar mais"
   pararia numa página só de kinds novos e o histórico antigo ficaria inalcançável. Conferido no
   consumidor: `hooks/useTripTimeline.hook.ts:22` é `getNextPageParam: (lastPage) => lastPage.nextCursor`,
   então lista vazia com cursor continua paginando.
2. **Tolerância de vocabulário não é tolerância de forma.** Item que não é objeto, `kind` que não é
   texto e chave a mais em kind **conhecido** continuam reprovando a página. `hasUnknownTimelineKind`
   exige objeto **e** `kind` de texto exatamente para isso.
3. ⚠️ **Uma asserção minha nasceu invertida, e foi corrigida com o vermelho na mão.** Eu havia escrito
   que kind desconhecido **com chave a mais** deveria reprovar a página. Isso mataria a própria
   tolerância: uma API mais nova que acrescentasse um kind **e** uma chave junto voltaria a deixar a
   linha do tempo em branco — o defeito que a T0.3 existe para fechar. O painel não pode julgar a forma
   de um kind que não conhece; pode afirmar que **não é um item dele**, e descartar. A razão está escrita
   no próprio teste, e o guarda de chave segue inteiro para os kinds conhecidos (`recusa chave
desconhecida no item`, com `BASE_ITEM`).

**Um teste existente mudou de sentido, e é a decisão que muda:** `recusa kind fora do vocabulário`
(spec 158 D6/aceite 8) saiu e virou `descarta …`. É exatamente o que a D12 emenda na 158 D6, e o que a
192 T0.2 faria — as **chaves** do item continuam recusadas como antes.

**Tom:** os dois ficaram em `progress`, sem tocar `resolveTripTimelineTone`. Cancelar a rota é fato de
operação, não erro (ADR-0088 §2b, o log é `info`), e nenhuma penalidade nasce aqui (ADR-0070).

**Gates**

| Gate                   | Comando                                              | Resultado                                                                    |
| ---------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Contratos do painel    | `bun run --cwd apps/frontend-transportada test`      | **5542 pass + 54 pass, 0 fail** (30 + 1 arquivos, duas invocações do script) |
| — só a suíte de viagem | `bun test ./test/trip.contract.test.ts`              | **1757 pass, 0 fail** (era `1748 pass, 9 fail`)                              |
| Typecheck do painel    | `bun run --cwd apps/frontend-transportada typecheck` | verde                                                                        |
| Lint do painel         | `bun run --cwd apps/frontend-transportada lint`      | verde                                                                        |

`test/trip/timeline.contract.ts` e `test/trip/timeline-view.contract.ts` já estavam no entrypoint
`test/trip.contract.test.ts` (`:2` e `:3`), que já está na lista explícita do `package.json` do painel —
nenhuma lista precisou de linha nova, e conferi que rodam pelo script da app, não só pelo comando solto.
