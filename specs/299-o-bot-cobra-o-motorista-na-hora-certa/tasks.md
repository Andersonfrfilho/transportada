# Tasks — 299 O bot cobra o motorista na hora certa

Uma task por vez, no worktree `../transportada-wt/spec-299`. Cada task fecha com typecheck + testes do app (script
`test`) + commit isolado, evidência em `evidence.md`. Teste novo entra na lista explícita do `package.json` da app.
Na API são **dois** comandos, e nenhum cobre o outro (de dentro de `apps/api-transportada`):

```bash
bun --env-file=../../.env.test test --timeout 120000   # contrato
bun --env-file=../../.env.test run test:integration    # integração (obrigatório se mexeu em test/integration/**)
```

Q1 e Q2 respondidas pelo dono em 2026-11-06 (spec.md § Dúvidas); nenhum `[NEEDS CLARIFICATION]` aberto.
Pré-requisito externo: o suporte de menção do grupo (entregue antes desta spec) trava só a T2.1.

## Fase 0 — Conferência e contratos antes do código

> 🤖 Modelo: `sonnet` (T0.1 é 🧠 — `opus`)

- [x] **T0.1 🧠** Conferir no código as premissas que o `plan.md` deixou para a T0.1: onde fica gravada a origem
      grupo × individual do evento (último canal, D5), nomes das permissões de leitura e gestão de viagens para a
      pendência e a dispensa, aba das Configurações (`automations` ou nova), e o desenho da extração do portão "pergunta
      aberta" (`RouteOfferGate` → `DriverOpenQuestionPort`) sem mudar a oferta da próxima rota. Aceite: `plan.md`
      atualizado com arquivo:símbolo; decisões em `evidence.md`.
- [x] **T0.2** Contratos vermelhos das políticas puras, com relógio injetado:
      `test/driver-stop-reminders/stop-reminder-{schedule,origin,transition,gate,message}.contract.ts` e o entrypoint
      `test/driver-stop-reminders.contract.test.ts` no `package.json`. Aceite: vermelhos pelo motivo certo (módulo ausente).

## Fase 1 — Tabela, cálculo na saída e fechamento automático (API)

> 🤖 Modelo: `sonnet` (T1.1 → `haiku`)

- [x] **T1.1** Chave global `DRIVER_REMINDERS_ENABLED` (padrão `false`) no schema de env da API e do worker, no
      `.env.example` e no `make config`, no molde de `MDFE_AUTO_ISSUE_ENABLED`. Aceite: contrato do schema; `make config`.
- [x] **T1.2** Migration A aditiva: `driver_stop_reminders`, `company_driver_reminder_settings` e a linha de
      `job_schedules` da rotina com os `CHECK` reescritos (plan.md § Dados e § Worker).
      Aceite: `make migration-test`; `db:generate` → `no_changes`.
- [x] **T1.3** Políticas puras (T0.2 verde): schedule, origin, transition, message.
- [x] **T1.4** `driver-stop-reminder.service.ts` (`onStopEvent`) ligado a saída, chegada, baixa, ocorrência,
      cancelamento de saída e encerramento da viagem, na transação do evento; OSRM depois do commit por `id`+`version`;
      chave global desligada → nada grava. Integração: saída abre `arrival` com reserva e depois com OSRM; OSRM fora →
      `origin_kind='fallback'`; chegada fecha e abre `settlement`; chegada marcada junto com a baixa não abre; baixa,
      ocorrência e cancelamento fecham; reenvio não duplica; saída de outra parada substitui.

## Fase 2 — Rotina do worker, envio no grupo e passo do registro

> 🤖 Modelo: `sonnet` (T2.6 → `haiku`)

- [x] **T2.1** Conferir que o suporte de menção do grupo (pré-requisito, D8) está em `origin/staging`; o envio do
      lembrete no grupo pede a menção do motorista da viagem por ele. Sem o suporte → **parar e perguntar** (não
      reimplementar). Aceite: contrato do lembrete com a menção pedida.
- [x] **T2.2** Extrair o portão "pergunta aberta" para `DriverOpenQuestionPort` sem mudar a oferta da próxima rota
      (diff de movimentação; contratos da 294 verdes). Política do portão (RF8) verde e `deliver-driver-stop-reminder.use-case.ts` + rota de robô
      `POST /driver-stop-reminders/:id/delivery` (permissão própria só no papel `automation`), com a vaga da 289 e a
      reserva por `version`. Integração: envia, adia por horário, por pedido aberto e por vaga; fecha se a parada andou;
      concorrência envia uma vez; 404 de outra empresa.
- [x] **T2.3** Passo `reminder.stage` no `GROUP_STEP_REGISTRY`: 1–4 delegam a cheguei/entreguei/não entreguei/
      ocorrência; "4" adia sem consumir tentativa, até 3 adiamentos por etapa (RF13); "cancelar" fecha o passo e não o lembrete; comando digitado escapa.
      Falas como nós `fala_lembrete_*`. Aceite: matrizes `group-{flow,inbound}-isolation` verdes com o passo novo;
      `literal-message-text` verde.
- [x] **T2.4** Rotina `driver.stop-reminder.dispatch` no catálogo (API e worker, paridade), `driver-stop-reminder.routine.ts`
      e gateway para a API; registrada só com a chave global. Aceite: contrato da rotina e da paridade do catálogo.
- [x] **T2.5** Escolha do canal (D5): último canal de WhatsApp do motorista, grupo por padrão. Aceite: contrato.
- [x] ~~T2.6~~ Não se aplica: a API não tem OpenAPI (contrato = arquivo de rotas + schema Zod).

## Fase 3 — Conversa individual e template da Meta

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** Pedido tipado `stop_reminder` no individual, com as regras de isolamento do individual; respostas 1–4
      pelos mesmos caminhos da T2.3. Aceite: contrato de isolamento do individual.
- [ ] **T3.2** Janela de 24 h: dentro → texto livre; fora → template aprovado (modelos `driver.stop-reminder.arrival` /
      `.settlement` do módulo de Notificações, canal `whatsapp`, `{{1}}` = NF; janela por `lastInboundAt` +
      `decideWhatsAppWindowExpiry`) cuja resposta cai no pedido; sem template → grupo; sem grupo → só escala, com
      o motivo gravado. Aceite: integração dos três caminhos. **Pedir ao dono** a submissão do template na Meta
      (aprovação externa; não bloqueia o merge, bloqueia ligar em produção).

## Fase 4 — Escalada, configuração no painel e interruptor da empresa

> 🤖 Modelo: `sonnet` (T4.4 → `haiku`)

- [ ] **T4.1** Escalada: `status='escalated'` depois da última tentativa; fonte de pendência
      `driverStopReminderEscalated`; notificação no sino para a lista efetiva de responsáveis; dispensa
      `POST /driver-stop-reminders/:id/dismissal`. A pendência some quando a etapa se resolve. Aceite: integração.
- [x] **T4.2** `GET/PUT /settings/driver-stop-reminders` (`settings.manage`, `.strict()`, todos os erros de uma vez,
      faixas do RF19) e leitura das configurações pela política (sem linha = desligado + padrões). Aceite: contrato + integração.
- [ ] **T4.3** Painel: bloco "Cobrança do motorista" em Configurações e o tipo "Motorista sem resposta" em
      `/pendencias` com "Dispensar". Aceite: testes do painel (script `test`), typecheck, lint e build.
- [ ] **T4.4** Locale e catálogo das falas novas no editor de fluxo (FlowsWorkspace) — chaves e variáveis listadas.
      Aceite: `grep` das chaves nos locales e teste do catálogo.
      **depende da spec do editor de fluxos** (dono, 2026-11-07: o FlowsWorkspace do SDK não está montado no painel nem tem rotas na API; spec própria depois da 299).

## Fase 5 — Jornada com relógio falso

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** Em `whatsapp-driver-journey-{group,direct}.integration.ts` (+ `driver-journey-*.expected.ts`, regravar com
      `JOURNEY_RECORD=1`): saída → relógio avança → lembrete com menção (grupo) → respostas 1, 2, 3, 4; chegada → o
      "já entregou?" → 1, 2, 3, 4; três sem resposta → pendência e sino; "4" três vezes adia sem
      consumir tentativa e o quarto conta como sem resposta; chegada pelo escritório abre o "já entregou?"; com cada fluxo aberto (ocorrência, entrega em
      preparo, escolha de parada, oferta da próxima rota, pedido de localização) o lembrete espera e sai depois; chave
      global ou da empresa desligada → nada. Aceite: integração da API verde; transcript (`JOURNEY_TRANSCRIPT=1`) colado
      em `evidence.md`.
- [ ] **T5.2** `make check`, integração da API, worker; atualizar `apps/api-transportada/CLAUDE.md`,
      `apps/worker-transportada/CLAUDE.md`, `docs/ai-context/` e o `CLAUDE.md` da raiz (§14 do code-standart).
- [ ] **T5.3** Revisão final (`code-reviewer` `sonnet`) e publicação em etapas: painel tolerante → API
      com migration A → worker. Ligar a chave global em staging e a da empresa de teste só com aprovação do dono.

## Prompt de execução

> Q1 e Q2 respondidas. A Fase 2 (T2.1) espera o suporte de menção do grupo (PR `group-mention`) em `origin/staging`.

```text
/oh-my-claudecode:autopilot Execute a spec specs/299-o-bot-cobra-o-motorista-na-hora-certa/ (leia spec.md, plan.md e
tasks.md antes de começar), no worktree ../transportada-wt/spec-299. Uma task por vez, na ordem do tasks.md.
A T2.1 depende do suporte de menção do grupo (PR group-mention) em origin/staging: sem ele, pare e pergunte.
Modelos: Fase 0 → executor model=sonnet, T0.1 🧠 → opus · Fase 1 → executor model=sonnet (T1.1 → haiku) ·
Fase 2 → executor model=sonnet (T2.6 → haiku) ·
Fase 3 → executor model=sonnet · Fase 4 → executor model=sonnet (T4.4 → haiku) · Fase 5 → executor model=sonnet ·
revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com typecheck + testes do app (script test; na API contrato E integração com --env-file=../../.env.test)
+ commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy, publicar em staging/main, publicar o grafo do bot em
staging/produção, submeter template na Meta, ligar DRIVER_REMINDERS_ENABLED em qualquer ambiente, migration destrutiva,
qualquer [NEEDS CLARIFICATION].
```
