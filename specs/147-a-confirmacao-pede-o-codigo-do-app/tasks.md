# Tasks

⚠️ **Bloqueada por dois motivos:**

1. **Depende da spec 144 em staging.** A confirmação que esta feature interrompe só existe no branch
   `work/spec-144`.
2. **Tem `[NEEDS CLARIFICATION]` aberto** na `spec.md`: D1 (os modos e o padrão), D2 (quem recebe o
   código), D4 (a dependência de Web Push no Bun) e D6 (fatura de CT-e sem `billing.create`). Pela
   regra de spec-driven development, nada se implementa com pergunta aberta.

## Fase 1 — Configuração e a parada da conversa

> 🤖 Modelo: `opus` 🧠 — muda a máquina de estados do pedido fiscal

- [ ] **T001** 🧠 Migration e rota de `company_whatsapp_confirmation_settings`, com o painel na aba
      WhatsApp de Configurações. Contrato de schema e de rota.
- [ ] **T002** 🧠 `awaiting_code` no CHECK e as colunas do código selado. Contrato de estado: o
      `resume` e o índice de pedidos em andamento ignoram o novo estado.
- [ ] **T003** 🧠 Parada da confirmação entre o hash e o `claim`: gerar, selar e notificar. O nó da
      conversa lê os 6 dígitos. Contratos do AC1 ao AC4.

## Fase 2 — O código chega ao app sem ficar exposto

> 🤖 Modelo: `sonnet`

- [ ] **T004** Template só INBOX `whatsapp.confirmation-code`, sem o valor no corpo. Contrato do AC5.
- [ ] **T005** `GET /me/whatsapp-confirmation-codes/current` na allowlist da T005b, e a tela do código
      no painel e no PWA. Contratos de dono, de estado e de "mostra uma vez".

## Fase 3 — Web Push

> 🤖 Modelo: `opus` 🧠 na troca do service worker e no protocolo; `sonnet` no resto

- [ ] **T006** 🧠 Medir a dependência (`web-push` no Bun ou implementação nativa do RFC 8291/8292) e
      registrar a decisão em ADR, antes de qualquer código.
- [ ] **T007** 🧠 `generateSW` → `injectManifest` com `src/sw.ts` (precache atual + `push` +
      `notificationclick`). Smoke do PWA verde e o contrato do service worker.
- [ ] **T008** Chaves VAPID no ambiente, validadas no boot, e a rota da chave pública.
- [ ] **T009** Inscrição por gesto, com `POST`/`DELETE /me/web-push-subscriptions` e o aviso de iOS
      exigir o app instalado.
- [ ] **T010** Driver de envio `web`, com o código **fora** do payload do push. Integração do AC6.

## Fase 4 — O B1 da 144 e o fechamento

> 🤖 Modelo: `sonnet`; revisão final em `opus`

- [ ] **T011** A liquidação revalida `billing.create` só quando há CT-e a faturar, e o comportamento de
      CT-e sem a permissão segue a D6. Contrato do AC7.
- [ ] **T012** ADR, `CLAUDE.md` e `docs/SECURITY.md`.
- [ ] **T013** Revisão de segurança e de código em `opus`, e a prova em staging.

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos arquivos. Marque como
concluída apenas após registrar evidência.

## Perguntas pendentes (no lugar do prompt de execução)

Esta spec ainda **não** tem prompt de autopilot: pela regra, spec com `[NEEDS CLARIFICATION]` aberto
ganha a lista das perguntas no lugar dele.

1. **D1:** os modos são `never` · `always` · `without_billing_create`? Entra um modo por valor da
   prévia? Qual é o padrão para quem nunca configurou?
2. **D2:** o código vai para o próprio usuário, como segundo fator, ou para quem fatura, como
   aprovação entre duas pessoas?
3. **D4:** medir `web-push` no Bun ou implementar o protocolo com `crypto` nativo. Resolve-se na T006,
   mas precisa de autorização para acrescentar dependência.
4. **D6:** CT-e emitido por quem não fatura gera fatura, porque houve aprovação, ou fica "fature pelo
   painel"?
