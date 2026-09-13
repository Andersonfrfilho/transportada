# Tasks

⚠️ **Depende da spec 144 em staging.** As operações que esta feature interrompe só existem no branch
`work/spec-144`. Antes da primeira task: `git fetch && git rebase origin/staging` neste worktree, e
conferir que `apps/api-transportada/src/whatsapp-commands/` existe. Se não existir, **pare**: a 144
ainda não foi publicada.

Todas as decisões estão fechadas (D1, D2, D4 e D6 respondidas pelo usuário em 2026-09-13; ver
`spec.md`).

⚠️ **Meça antes de codificar em cima.** O `plan.md` foi levantado por leitura do commit da 144 e do
`dist` do módulo de notificação, sem execução. A task que herdar uma afirmação confere primeiro.

## Fase 1 — Configuração e a parada

> 🤖 Modelo: `opus` 🧠 — muda o que o bot executa nas quatro operações

- [ ] **T001** 🧠 Migration de `company_whatsapp_confirmation_settings` com chave
      `(company_id, channel, operation)`, CHECKs de `channel` e `operation` vindos de
      `WHATSAPP_CONFIRMATION_OPERATIONS` e da constante de canais, e o padrão por canal em constante (no
      WhatsApp, as quatro ligadas). Rota `GET`/`PUT`/`DELETE /company-settings/whatsapp-confirmation`
      (`settings.manage`) e painel na aba WhatsApp de Configurações. Contratos de schema, de rota e de
      "linha ausente segue o padrão do canal".
- [ ] **T002** 🧠 Tabela do código ligada à operação: `whatsapp_confirmation_codes` (empresa, ator,
      sessão, operação, referência opaca da operação, `code_hash`, `code_sealed`, `expires_at`,
      `attempt_count` com CHECK, `consumed_at`), com o código vivo único por (empresa, ator, sessão).
      Na emissão, `awaiting_code` entra no CHECK de `whatsapp_command_requests`. O `resume` e o índice de
      pedidos em andamento o ignoram. Contratos de schema, de tenant e de estado.
- [ ] **T003** 🧠 O seam da parada: `requireConfirmationCode({ actor, channel, operation, reference })`
      decide pela configuração, gera, sela, grava e notifica, e devolve "aguardando". Um nó comum da
      conversa lê os 6 dígitos e executa a operação guardada. Contratos do AC1 ao AC4, com o seam
      testado isolado.
- [ ] **T004** 🧠 Plugar o seam nas quatro operações: a confirmação da emissão (entre o hash e o
      `claim`), entrega e devolução (T015), ocorrência (T015 e T016), e separar, carregar e despachar
      (T016). O `context` da sessão guarda só ids opacos. Contrato por operação: ligada pede código,
      desligada executa como na 144.

## Fase 2 — O código chega ao app sem ficar exposto

> 🤖 Modelo: `sonnet`

- [ ] **T005** Template só INBOX `whatsapp.confirmation-code`, sem o valor no corpo, e a lista de
      canais só com INBOX (o catálogo hoje herda o e-mail). Contrato do AC5.
- [ ] **T006** `GET /me/whatsapp-confirmation-codes/current` na allowlist por extenso da T005b da 144,
      abrindo o selado só para o próprio ator e só com o código vivo. A tela do código no painel e no
      PWA, com esqueleto, contagem e "mostra uma vez". Contratos de dono, de estado e de não exposição.

## Fase 3 — Web Push

> 🤖 Modelo: `opus` 🧠 na decisão da dependência e na troca do service worker; `sonnet` no resto

- [ ] **T007** 🧠 Medir `web-push` (npm) no Bun: gerar par VAPID, cifrar `aes128gcm` e mandar para um
      endpoint fake. Se falhar, implementar com `crypto` nativo (RFC 8291/8292). ADR com a decisão e a
      medida **antes** de qualquer código de envio.
- [ ] **T008** 🧠 `generateSW` → `injectManifest` com `src/sw.ts`: o precache atual, `push` e
      `notificationclick` abrindo a tela do código. Smoke do PWA verde, e o `Cache-Control` do `sw.js`
      no `server.ts` conferido. Contrato do service worker.
- [ ] **T009** Chaves VAPID no ambiente, validadas no boot (a privada nunca chega ao bundle), e a rota
      da chave pública.
- [ ] **T010** Inscrição por gesto do usuário: `POST`/`DELETE /me/web-push-subscriptions`, em
      `notification.devices` com `platform: 'web'`, na allowlist da T005b. Aviso de que no iPhone é
      preciso instalar o app.
- [ ] **T011** Driver de envio `web`, que manda só "Há um código de confirmação", nunca o valor. As
      inscrições expiradas (410) são removidas. Integração do AC6.

## Fase 4 — O B1 da 144 e o fechamento

> 🤖 Modelo: `sonnet`; revisão final em `opus`

- [ ] **T012** Liquidação: revalidar `billing.create` só quando há CT-e autorizado a faturar. Pedido só
      de NFS-e liquida como `settled` e manda o resumo. Com CT-e e sem a permissão, emite, não fatura,
      e o resumo diz "fatura não gerada: fature pelo painel" (`settled_partial`, desfecho novo por
      migration aditiva). Ator inativo continua sem resumo. O ponto de entrada está registrado na T020
      da 144 (`settleDispatched`, chamada de `revalidateActor`). Contrato do AC7.
- [ ] **T013** ADR "a segunda confirmação", `CLAUDE.md` (inclusive o aviso de que o primeiro deploy
      liga o código nas quatro operações do WhatsApp) e `docs/SECURITY.md`.
- [ ] **T014** Revisão de segurança e de código em `opus`, e o roteiro da prova em staging, para o
      usuário executar.

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos arquivos. Marque como
concluída apenas após registrar evidência.

## Ordem

```
T001 ─> T002 ─> T003 ─> T004 ─> T005 ─> T006 ─┬─> T012 ─> T013 ─> T014
                              T007 ─> T008 ─> T009 ─> T010 ─> T011 ─┘
```

A Fase 3 (Web Push) é independente das Fases 1 e 2 até a T011, que usa o seam da T003. Mesmo assim,
as duas mexem em `main.ts` e `package.json`, então rodam **em sequência** no mesmo worktree.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/147-a-confirmacao-pede-o-codigo-do-app/ (leia
spec.md, plan.md e tasks.md antes de começar; leia também specs/144-o-comando-chega-pelo-whatsapp/,
de que ela depende). No worktree spec-147: git fetch && git rebase origin/staging, e confira que
apps/api-transportada/src/whatsapp-commands/ existe — se não existir, a 144 não foi publicada: PARE.
Uma task por vez, na ordem do tasks.md.
Modelos: Fase 1 (T001–T004 🧠) → executor model=opus, architect valida o seam da T003 antes da T004 ·
Fase 2 → executor model=sonnet · Fase 3: T007 e T008 🧠 → opus, T009–T011 → sonnet ·
Fase 4 → sonnet · revisão final → security-reviewer e code-reviewer model=opus.
Cada task fecha com bun run typecheck + testes da app + make check + commit isolado, evidência em
evidence.md. Teste novo entra na lista explícita do package.json. Integração da API só com
bun --env-file=../../.env.test a partir de apps/api-transportada.
Pare e pergunte antes de: deploy, migration destrutiva, acrescentar dependência sem a ADR da T007,
enviar Web Push ou mensagem real fora de fake, e qualquer mudança no pacote @adatechnology.
```
