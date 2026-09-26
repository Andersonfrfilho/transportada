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

_a preencher na execução_
