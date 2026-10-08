# Tasks — Spec 254

> Spec: `spec.md` · Plano: `plan.md` · Evidência: `evidence.md` (uma linha por task fechada).
> Teste de aceite/contrato **antes** da implementação. Uma task por vez, na ordem.

**Gates de toda task** (`model-economy.md` §3):

- Typecheck da app tocada (`bun run typecheck` na raiz; lint é por app, com a app como cwd).
- Testes da app tocada pelo script `test` do `package.json` — nunca `bun test` cru. Na API, contrato **e**
  integração são dois comandos (CLAUDE.md da raiz).
- ⚠️ A lista de testes é **explícita** no `package.json`/entrypoint: arquivo novo de contrato só roda se
  entrar na lista (`apps/frontend-driver/test/driver-trip.contract.test.ts`, entrypoint equivalente do
  painel e da API).
- Commit isolado por task; linha em `evidence.md` com o comando e o resultado.
- Escalada: gate falhou 2× → sobe um nível (haiku → sonnet → opus) e registra em `evidence.md`.
- Trabalhar em worktree: `make worktree NAME=spec-254`.
- Sem `[NEEDS CLARIFICATION]` aberto. Os valores C1–C5 do `spec.md` valem como padrão até o usuário mudar.

Já existe (não refazer): `apps/frontend-driver/test/driver-trip/occurrence-upload-retry-loop.contract.ts`
(reproduz o laço; está registrado no entrypoint, 4 casos verdes, **sem commit ainda**). A T1.3 estende esse
arquivo.

---

## Fase 1 — Decisão e contratos (tudo vermelho antes do código)

> 🤖 Modelo: `sonnet` (T1.1 é 🧠 → `opus` via `architect`)

- [ ] **T1.1 🧠** Validar com `architect` (opus) a decisão do `plan.md`: diagnóstico só como log, sem
      tabela; enums e limites do corpo; mensagem `driver_client_diagnostic`. Registrar o veredito em
      `evidence.md`. Se pedir tabela/migration → **parar e perguntar ao usuário**.
      Aceite: veredito escrito; nenhuma linha de código.
- [ ] **T1.2** Contrato da API (`apps/api-transportada/test/me-client-diagnostics.contract.ts` + entrypoint):
      corpo válido → `204` e um log por evento; corpo com campo extra → `400` (`.strict()`); todos os erros
      juntos; `companyId` do corpo ignorado/rejeitado; sem permissão → `403`; limite C5 → `429` com
      `Retry-After`; teto C5 declarado na rota (o 429 do roteador já é coberto em `test/rate-limit/router.contract.ts`); log sem URL assinada/observação/coordenada (CA2).
      Aceite: falha por rota inexistente (vermelho esperado).
- [ ] **T1.3** Contrato do backoff, estendendo `occurrence-upload-retry-loop.contract.ts` (RF10/CA3/CA4):
      `computeRetryDelayMs` (30 s × 2, teto 10 min, jitter fixado); 20 ticks com rede caída fazem menos de 20
      pedidos e o número previsto pela fórmula; "Enviar agora" (`immediate`) ignora o espaçamento; `403`/`500`
      seguem recusa; item **continua na fila após 100 ticks** (227 D1); item sem `lastAttemptAt` é devido; um
      item em espera na frente **para** a drenagem do temporizador e não deixa passar os de trás (N3); o agendador
      junta pedidos com `immediate` vencendo; `lastAttemptAt` sobrevive à remontagem do item recusado. Mesmo
      para a fila de anexos (`offline-attachments.contract`).
      Aceite: vermelho esperado (função e parâmetro `origin` ainda não existem).
- [ ] **T1.4** Contrato do coletor (`apps/frontend-driver/test/driver-trip/client-diagnostics.contract.ts`
  - entrypoint): `record` nunca lança; buffer de 50 descarta o mais antigo; `flush` em lote ≤ 20; falha do
    `flush` não propaga e não mexe em `attempts` (CA5); evento de falha do `PUT` de rede sai com
    `step: upload_put`, `failureKind: network`, `attempt` crescente (CA1); varredura do JSON sem URL
    assinada, observação nem coordenadas (CA2); `device` omite o que o navegador não expõe (RF3).
    Aceite: vermelho esperado.

## Fase 2 — Rota de diagnóstico na API

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** `trips.constant.ts`: mensagem de log, enums, limites, código `CLIENT_DIAGNOSTICS_INVALID`
      (strings repetidas viram constante — code-standart §16).
- [ ] **T2.2** `record-client-diagnostics.use-case.ts` + `me-client-diagnostics.routes.ts`
      (molde de `me-location.routes.ts`: `defineRoute`, `parseBody` `.strict()`, política `trip.report`
      `scope: company`, balde de limite C5, `204`). Registrar a rota no roteador.
      Sem `resolveDriver`; limite C5 por configuração do balde; lista de campos permitidos no caso de uso.
      Gate: T1.2 verde.
- [ ] **T2.3** Atualizar docs (`docs/spec/` da API se houver contrato de rotas; `apps/api-transportada/CLAUDE.md`
      só se mudar regra normativa; `docs/ai-context/api-transportada.md` com a rota) — code-standart §14.

## Fase 3 — Espaçamento da drenagem (painel primeiro, depois driver)

> 🤖 Modelo: `sonnet`

- [x] **T3.1** `retryBackoff.service.ts` (puro: `computeRetryDelayMs`, `isRetryDue`; relógio e jitter
      injetáveis) no **painel** (origem da cópia, ADR-0075 §7). Gate: trecho da T1.3 sobre a fórmula verde.
- [x] **T3.2** No painel: `lastAttemptAt` em `QueuedReport` e no item de anexo; parâmetro **obrigatório**
      `origin: 'timer' | 'immediate'` em `drainQueue` e na drenagem de anexos; `timer` **para** a drenagem, sem contar
      tentativa, quando o primeiro item elegível está em espera (N3: nunca pular); `setInterval` chama `timer`, `online`/`pageshow`/visibilidade/"Enviar agora"/abertura
      chamam `immediate`; ajustar os hooks que chamam `drain`. Gate: typecheck pega chamada esquecida;
      contratos do painel verdes (`offline-queue`, `offline-attachments`, `pending-queue`, `session-drain`).
- [ ] **T3.3** **Portar** o mesmo trecho para `apps/frontend-driver/` (os arquivos divergem do painel — não
      copiar por cima: preservar `ownerSubHash`, `createDrainScheduler`/cão de guarda, `recoverProofPhotos`);
      o agendador guarda a origem e `immediate` vence; ajustar o hook do driver. Aceite: T1.3 inteira verde +
      `copy-by-value-header.contract` verde + typecheck.
  > 🤖 `sonnet` (a T1.1 mostrou que deixou de ser mecânica).

## Fase 4 — Coletor e instrumentação no `frontend-driver`

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** `stepTimer.service.ts`, `deviceProfile.service.ts` (verificar na hora se existe variável de
      versão do build; se não, `appVersion` é omitido e isso vai para `evidence.md`).
- [ ] **T4.2** `clientDiagnostics.service.ts` + `sendClientDiagnostics` no `driverTripClient.service.ts`
      (corpo `.strict()` espelhando a rota; sem `await` no caminho do motorista; `400` descarta o lote; `429`/rede
      devolvem os eventos ao buffer limitado a 50; nunca instrumenta o próprio envio; publicar API antes do driver).
      Gate: T1.4 verde.
- [ ] **T4.3** Instrumentar só chamando o coletor, sem mudar regra: `upload_slot`/`upload_put`/
      `upload_confirm`/`report_send` (+ `send_failed` com `toAttachmentSendOutcome`), `photo_reduce`,
      `trip_open`, `baixa_total`. `flush` no fim da drenagem, em `online` e na volta de visibilidade.
      Gate: contratos existentes do driver verdes (nenhuma regra de ocorrência mudou — D2) + T1.4.
- [ ] **T4.4** Atualizar `apps/frontend-driver/CLAUDE.md` (núcleo normativo: coletor é melhor-esforço,
      nunca entra em fila nem em `attempts`; backoff só no temporizador) e `docs/ai-context/frontend-driver.md`.

## Fase 5 — Fechamento

> 🤖 Modelo: `haiku` (T5.2 → `sonnet`)

- [ ] **T5.1** `make check` na raiz (format:check + lint por app + typecheck + test + build); contrato **e**
      integração da API (`--env-file=../../.env.test`). Registrar contagens em `evidence.md`.
- [ ] **T5.2** Revisão final por `code-reviewer` (sonnet), separada da autoria: foco em PII nos eventos,
      chamada de `drain` sem `origin`, `Promise.all` novo (code-standart §15), strings repetidas.
- [ ] **T5.3** Auditoria go-live (code-standart §15 / `security.md` §1 e §3): log sem PII, corpo validado,
      limite na rota, ausência de stack em `500`.

**Depois do deploy (fora desta spec, só com aprovação humana):** reproduzir em staging com login de motorista
e viagem com entrega aberta fornecidos pelo usuário, e buscar `driver_client_diagnostic` no log do Railway.

---

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/254-motorista-registra-por-que-o-envio-falhou/ (leia spec.md, plan.md e tasks.md
antes de começar). Uma task por vez, na ordem do tasks.md. Trabalhe em worktree (make worktree NAME=spec-254).
Já existe e não deve ser refeito: apps/frontend-driver/test/driver-trip/occurrence-upload-retry-loop.contract.ts — estenda-o na T1.3.
Modelos: Fase 1 → executor model=sonnet (T1.1 🧠 → architect em opus, só veredito, sem código) ·
Fase 2 → executor model=sonnet · Fase 3 → executor model=sonnet ·
Fase 4 → executor model=sonnet · Fase 5 → haiku (T5.2 revisão → code-reviewer model=sonnet).
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com typecheck + testes (script test da app, entrypoints explícitos; na API, contrato E integração) +
commit isolado, evidência em evidence.md.
Não toque em regra de ocorrência nem crie interruptor de ocorrência (D2). Backoff nunca descarta item (227 D1).
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION], e se a T1.1 pedir tabela/migration.
```
