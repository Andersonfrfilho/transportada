# Spec 156 — Tarefas

| fase | tasks                      | modelo recomendado               | fallback se der 429 |
| ---- | -------------------------- | -------------------------------- | ------------------- |
| 0    | T1                         | `sonnet`                         | `opus`              |
| 1    | T2 🧠 (ADR), T3 🧠         | `opus` (validar com `architect`) | `fable`             |
| 2    | T4, T5, T6, T7             | `sonnet`                         | `opus`              |
| 3    | T8, T9                     | `sonnet`                         | `opus`              |
| 4    | T10, T11, T12              | `sonnet`                         | `opus`              |
| 5    | T13 🧠, T14                | `opus` / `sonnet`                | `fable` / `opus`    |
| 6    | T15 (revisão)              | `opus`                           | `fable`             |
| 7    | T16 (design e usabilidade) | `opus` (`designer`)              | `fable`             |

Cada task fecha com typecheck (`bun run typecheck`), lint (`bun run lint`), os testes da app
alterada, o arquivo de teste novo listado no `package.json` da app, a evidência em `evidence.md` e um
commit isolado. A integração da API roda com `bun --env-file=../../.env.test test --timeout 120000`,
de dentro de `apps/api-transportada`: sem o `.env.test` ela pula, e pular não é passar. O
contrato/aceite vem **antes** da implementação em toda task de código.

## Fase 0 — O defeito que já existe

> 🤖 Modelo: `sonnet`

- [x] **T1 — Entregar e devolver aparecem em `on_delivery_route`** (D10, aceite 4). Primeiro, um teste
      de `tripStatus.service.ts` que falha com a regra de hoje; depois, a correção. Esta task **não**
      espera o `allowedActions` (T7), porque é o conserto mínimo e sai sozinho em staging.

## Fase 1 — Decisões e o alvo da viagem

> 🤖 Modelo: `opus` 🧠 (validar com `architect` antes de fechar)

- [ ] **T2 🧠 — ADR-0067 "o escritório dá baixa em nome do motorista"** (conferir o próximo número
      livre em `origin/staging`). Registra D1, D3, D4 e D6. Ao fechar, acrescenta
      `trip.report-on-behalf` em `authorization.policy.ts` para `admin`, `operator` e `finance`
      (D1 confirmada) e o contrato negativo para `separator`, `driver` e `viewer`.
- [ ] **T3 🧠 — `FieldTripTarget` nas portas de campo.** Refatora `start-field-trip`,
      `report-document-delivery`, `attach-delivery-proof`, `register-driver-occurrence` e
      `report-stop-occurrence`, junto com os repositórios, para receber o alvo. Gate: os contratos de
      `/me/trips` e do WhatsApp rodam verdes **sem edição**. Contratos novos: alvo `trip` de outra
      empresa → `null`; viagem sem motorista → `TRIP_WITHOUT_DRIVER`.

## Fase 2 — API do escritório

> 🤖 Modelo: `sonnet`

- [ ] **T4 — Migration de autoria** (`channel`, `on_behalf_of_driver_id` e CHECK) nas seis tabelas de
      campo. Aditiva. `make migration-test` verde, incluindo o rollback. O WhatsApp passa a gravar
      `whatsapp`.
- [ ] **T5 — Rotas de viagem e parada**: `confirm-load`, `start-route`, `arrive` e ocorrência de
      parada, em `trip-field-office.routes.ts`. Contratos: 403 sem permissão (aceite 1), 404 para
      outra empresa (aceite 3), autoria gravada e `audit_logs` (aceite 2).
- [ ] **T6 — `field-delivery`, `field-return` e `deliveredAt`**: multipart com foto, entrega e
      comprovante na mesma transação, `Idempotency-Key`, validação de `deliveredAt` (aceite 8),
      configuração de foto obrigatória (aceite 9) e logs sem PII (aceite 11).
- [ ] **T7 — `allowedActions` em `GET /trips/:id`** e ocorrência em massa `field-occurrences`
      (aceite 10).

## Fase 3 — Tela: ações de campo

> 🤖 Modelo: `sonnet`

- [ ] **T8 — `TripFieldActions`**: iniciar rota, chegada e ocorrência de parada, controlados por
      `allowedActions`. `tripStatus.service.ts` deixa de decidir as ações de campo.
- [ ] **T9 — Linha do tempo com autoria** ("por X (escritório) pelo motorista Y") e
      `FieldOccurrenceDialog` para uma nota ou para várias.

## Fase 4 — Entrega com canhoto, individual e em massa

> 🤖 Modelo: `sonnet`

- [ ] **T10 — `canhotoIdentification.service.ts`**: função pura com fixtures de DANFE (código de
      barras legível, de outra nota, de fora da viagem e sem código). Contrato antes (aceite 6).
- [ ] **T11 — `FieldDeliveryWizard`**: preview da câmera com a faixa da nota, captura, envio de
      arquivo, conferência, pular e "Entregue em". Serve para **uma** nota (ação da linha) e para
      **várias** (ação em massa em `TripStateActions`). Imagem reduzida antes do envio.
- [ ] **T12 — `useFieldDelivery`**: envia com concorrência 3, mostra o resultado de cada nota e
      repete só as que falharam (aceites 5 e 7). Smoke Playwright da entrega em massa com câmera
      simulada (`--use-fake-device-for-media-stream` com a imagem da fixture).

## Fase 5 — Identificar o canhoto destacado (experimental)

> 🤖 Modelo: `opus` 🧠 para T13 · `sonnet` para T14

- [ ] **T13 🧠 — ADR da dependência de OCR** (code-standart §13) e o interruptor
      `canhoto_ocr_enabled` em `company_delivery_proof_settings`, desligado por padrão.
- [ ] **T14 — OCR do número**, só com dígitos, casando com exatamente uma nota da viagem. Carrega
      sob demanda, mostra o selo "Experimental" e não entra no bundle inicial (medir o bundle antes e
      depois no `evidence.md`).

## Fase 6 — Revisão

> 🤖 Modelo: `opus`

- [ ] **T15 — Revisão final**: `code-reviewer` + `security-reviewer` (BOLA nas rotas `/trips/:id`,
      upload, PII nos logs) e auditoria do code-standart §15. Atualizar `CLAUDE.md` da API e do
      frontend, e `docs/spec/domain-model.md` (que também está desatualizado quanto a
      `ON_DELIVERY_ROUTE`).

## Fase 7 — Revisão de design e usabilidade

> 🤖 Modelo: `opus` (agente `designer`)

- [ ] **T16 — Revisão de design e usabilidade** (web.md §15). Percorrer de ponta a ponta, no desktop
      (o escritório com o maço de canhotos) e no celular (375 px): - **Design**: cada componente novo (`TripFieldActions`, `FieldDeliveryWizard`, faixa da nota
      sobre a câmera, `FieldOccurrenceDialog`, autoria na linha do tempo) comparado com os vizinhos
      da tela da viagem: primitivo do `shadcn/ui`, altura, borda, contraste em cada estado, claro e
      escuro. - **Usabilidade**: quantos toques custa dar baixa em 10 notas; a faixa da nota lida sobre a
      câmera; o que acontece ao negar a câmera, sem código de barras, com canhoto de outra nota, com
      falha parcial no envio; os estados vazio, carregando e erro; foco e teclado no assistente
      (Enter captura, Esc sai sem perder as fotos já tiradas, com confirmação); alvo de toque ≥ 44
      px; textos no vocabulário do escritório. - Achados corrigidos na própria task ou registrados no `evidence.md` com decisão. Fecha com os
      prints (desktop e celular) enviados ao usuário.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/156-o-escritorio-da-baixa-pelo-motorista/ (leia
spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet · Fase 1 (T2, T3 🧠) → opus, validado por architect antes de
implementar · Fases 2, 3 e 4 → executor model=sonnet · T13 🧠 → opus · T14 → executor model=sonnet ·
revisão final T15 → code-reviewer + security-reviewer model=opus ·
T16 revisão de design e usabilidade → designer model=opus, com prints ao usuário.
Cada task fecha com typecheck + lint + testes da app (integração da API com --env-file=../../.env.test)
+ teste novo listado no package.json + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy
em produção, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
