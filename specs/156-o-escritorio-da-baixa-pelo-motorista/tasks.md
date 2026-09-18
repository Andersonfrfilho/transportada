# Spec 156 — Tarefas

| fase | tasks                      | modelo recomendado               | fallback se der 429 |
| ---- | -------------------------- | -------------------------------- | ------------------- |
| 0    | T1                         | `sonnet`                         | `opus`              |
| 1    | T2 🧠 (ADR), T3 🧠         | `opus` (validar com `architect`) | `fable`             |
| 2    | T4, T5, T6                 | `sonnet`                         | `opus`              |
| 2    | T7 🧠                      | `opus` (validar com `architect`) | `fable`             |
| 2    | T7b                        | `sonnet`                         | `opus`              |
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
- [x] **L6a — `GET /trips` recorta `amounts` sem `trip.financials`** (achado L6 da T7, ADR-0049 §6,
      spec 061 D4). Anterior à spec e fora do escopo dela; registrado aqui para ter evidência. Modelo:
      `sonnet`.

## Fase 1 — Decisões e o alvo da viagem

> 🤖 Modelo: `opus` 🧠 (validar com `architect` antes de fechar)

- [x] **T2 🧠 — ADR-0067 "o escritório dá baixa em nome do motorista"** (conferir o próximo número
      livre em `origin/staging`). Registra D1, D3, D4 e D6. Ao fechar, acrescenta
      `trip.report-on-behalf` em `authorization.policy.ts` para `admin`, `operator` e `finance`
      (D1 confirmada) e o contrato negativo para `separator`, `driver` e `viewer`.
- [x] **T3 🧠 — `FieldTripTarget` nas portas de campo.** Refatora `start-field-trip`,
      `report-document-delivery`, `attach-delivery-proof`, `register-driver-occurrence` e
      `report-stop-occurrence`, junto com os repositórios, para receber o alvo. Gate: os contratos de
      `/me/trips` e do WhatsApp rodam verdes **sem edição**. Contratos novos: alvo `trip` de outra
      empresa → `null`; viagem sem motorista → `TRIP_WITHOUT_DRIVER`; `driverId` opcional no alvo
      `trip` (padrão: motorista de `position = 1`; fora da viagem → 422 `DRIVER_NOT_ON_TRIP`).

## Fase 2 — API do escritório

> 🤖 Modelo: `sonnet`

- [x] **T4 — Migration de autoria** (`channel`, `on_behalf_of_driver_id` com FK composta
      `(company_id, on_behalf_of_driver_id)`, `recorded_at` e CHECK) nas seis tabelas de campo. Aditiva. `make migration-test` verde, incluindo o rollback. O WhatsApp passa a gravar
      `whatsapp`.
- [x] **T5 — Rotas de viagem e parada**: `confirm-load`, `start-route`, `arrive` e ocorrência de
      parada, em `trip-field-office.routes.ts`. Contratos: 403 sem permissão (aceite 1), 404 para
      outra empresa (aceite 3), autoria gravada e `audit_logs` (aceite 2).
- [x] **T6 — `field-delivery`, `field-return`, `field-proof` e `deliveredAt`**: multipart com foto,
      entrega e comprovante na mesma transação, `Idempotency-Key` (`operation` prefixada `office.`;
      mesma chave de outro ator → 409 `TRIP_FIELD_REPORT_KEY_REUSED`, o código que já existia —
      emenda da ADR-0067 §2), validação de `deliveredAt` contra
      `trip_dispatch_snapshots.dispatched_at` (aceite 8), configuração de foto obrigatória (aceite 9),
      assinatura `required` cumprida com foto do canhoto assinado + nome do recebedor (D8), e logs sem
      PII (aceite 11). Baixa repetida no canal `office` → 409 `DOCUMENT_ALREADY_SETTLED` sem evento
      novo, com o canal do motorista inalterado (aceite 12). `field-proof` anexa ao evento `delivered`
      existente, substitui pelo unique `(company, stop_event, kind)` e não muda `delivered_at`.
- [x] **T7 🧠 — `allowedActions` (rota própria `GET /trips/:id/allowed-actions`, ressalva M1)**, ocorrência em massa `field-occurrences`
      (aceite 10) e **leitura da viagem pelo `finance`** (D11): política `anyPermission` com
      `['fleet.read', 'trip.report-on-behalf']` só em `GET /trips`, `GET /trips/:id`,
      `GET /trips/:id/stops`, `GET …/documents/:documentId/proof` e
      `GET …/documents/:documentId/occurrences`. Contratos: `finance` 200 nas cinco; 403 em
      `/fleet/drivers`, no feed e na geometria; `driverTaxId`/`driverEmail`/`driverPhone` nulos sem
      `fleet.read`, `driverName` presente (aceite 14). `opus`, validado com `architect`.
- [x] **T7b — Anexo da ocorrência em massa** (D7, decisão L3 da T7). Modelo: `sonnet`. Migration
      aditiva de `trip_document_occurrences.attachment_object_id`, com FK composta para
      `stored_objects` pela empresa, `snapshot.json` e `rollback.sql`. A rota `field-occurrences`
      aceita multipart com `file` opcional, validado pelo mesmo teto e tipos do canhoto do
      escritório. Um objeto guardado serve às N ocorrências do lote. **O que foi feito de verdade:**
      o upload acontece **dentro** da transação do lote, depois de tipo e alcance validarem (não
      antes, com lease, como este texto previa); a T15 acrescentou a limpeza de recurso
      (`runWithStoredObjectCleanup`: se a transação desfaz depois do upload, o objeto sai do bucket)
      e registrou em `docs/SECURITY.md` a falta de varredura periódica de órfãos. O feed
      (`listTripOccurrenceAttachmentLocations`) passa a ler também o anexo da ocorrência de nota.
      Desenho em `t7-design.md` §3.5.

## Fase 3 — Tela: ações de campo

> 🤖 Modelo: `sonnet`

- [x] **T8 — `TripFieldActions`**: iniciar rota, chegada e ocorrência de parada, controlados por
      `allowedActions`. `tripStatus.service.ts` deixa de decidir as ações de campo. Seletor de
      motorista só quando a viagem tem mais de um. `canReadTrip(permissions)` substitui
      `TRIP_READ_PERMISSION` (`trip.constant.ts:15`, `useTripWorkspace.hook.ts:130`), e o detalhe
      funciona sem `useFleet` (placa pelo dado da viagem, ou omitida).
- [x] **T8b — Entregar e devolver pelo escritório só pelo caminho com autoria** (ressalva A1 e
      achado B2 da validação da T7; decisão do usuário: remover o caminho antigo e trocar os
      botões). **T8b.1:** `findDriverReachableDocument` passa a filtrar `releasedAt`, igual a
      `findReachableDocumentIds`: nota liberada da viagem não recebe ocorrência, entrega nem
      devolução, nem do motorista nem do escritório. **T8b.2:** saem `POST …/documents/:documentId/deliver`,
      `POST …/documents/:documentId/return` e as ações `deliver`/`return` do `batch-status`
      (`trip.manage`, sem autoria). O separador tinha acesso a elas. Os botões "Entregar" e
      "Devolver" da linha da nota e o "Devolver" em massa passam a chamar `field-delivery`/`field-return`
      (`trip.report-on-behalf`, com `channel` e `on_behalf_of_driver_id`), mostrados por
      `allowedActions`. Contratos negativos: as rotas antigas não existem mais; o lote recusa
      `deliver`/`return` com 400; o separador recebe 403 em `field-delivery`/`field-return`.
- [x] **T9 — Linha do tempo com autoria** ("por X (escritório) pelo motorista Y") e
      `FieldOccurrenceDialog` para uma nota ou para várias.

## Fase 4 — Entrega com canhoto, individual e em massa

> 🤖 Modelo: `sonnet`

- [x] **T10 — `canhotoIdentification.service.ts`**: função pura com fixtures de DANFE (código de
      barras legível, de outra nota, de fora da viagem e sem código). Contrato antes (aceite 6).
- [x] **T11 — `FieldDeliveryWizard`**: preview da câmera com a faixa da nota, captura, envio de
      arquivo, conferência, pular e "Entregue em". Serve para **uma** nota (ação da linha) e para
      **várias** (ação em massa em `TripStateActions`). Imagem reduzida antes do envio. Seletor de
      motorista só quando a viagem tem mais de um.
- [x] **T12 — `useFieldDelivery`**: envia com concorrência 3, mostra o resultado de cada nota e
      repete só as que falharam (aceites 5 e 7). Smoke Playwright da entrega em massa com câmera
      simulada (`--use-fake-device-for-media-stream` com a imagem da fixture).

## Fase 5 — Identificar o canhoto destacado (experimental)

> 🤖 Modelo: `opus` 🧠 para T13 · `sonnet` para T14

- [x] **T13 🧠 — ADR da dependência de OCR** (code-standart §13) e o interruptor
      `canhoto_ocr_enabled` em `company_delivery_proof_settings`, desligado por padrão.
- [x] **T14 — OCR do número**, lendo o texto inteiro e extraindo o número depois de `Nº` e a série
      depois de `SÉRIE` (ADR-0069 §3 — **não** whitelist só de dígitos), casando com exatamente uma nota
      da viagem. Carrega sob demanda, mostra o selo "Experimental" e não entra no bundle inicial (medir o
      bundle antes e depois no `evidence.md`). Itens explícitos da ADR-0069:
  - **R1** — assets em `public/canhoto-ocr/<versão>/`, versão lida do `package.json` instalado;
    contrato: versão do caminho == versão em `node_modules`.
  - **R2** — número só no formato `\d{3}\.\d{3}\.\d{3}`; confiança mínima por palavra (limiar
    provisório, o final sai da validação); a sugestão mostra o número lido ao lado da nota sugerida;
    protocolo do §6 com uma viagem de notas consecutivas e a frase do limite estatístico (50 com zero
    erro ≈ 6% a 95%).
  - **R3** — o script de preparo gera `.br`/`.gz`; o `server.ts` serve o pré-comprimido com cache
    imutável sob `/canhoto-ocr/<versão>/`.
  - **R4** — unicidade contada sobre todas as notas da viagem sem as liberadas (`released_at`);
    número que casa com nota da viagem fora da seleção → escolha manual, sem bloqueio.
  - **R7** — o script copia `LICENSE` e avisos (Tesseract, Leptonica); sem `trustedDependencies`;
    registrar no `evidence.md` as transitivas que entram no lockfile (`node-fetch`, `idb-keyval`,
    `zlibjs`, …).
  - **R8** — erro da query do interruptor (ou da carga do motor) vira escolha manual; o hook
    `useFieldDeliverySettingsQuery` declara o tipo de retorno. A rota sem `rateLimit` está em
    `docs/SECURITY.md` (2026-09-18).
  - Painel do interruptor com o selo, perto do efeito (`SETTINGS_PANEL_PLACEMENT`).

## Fase 6 — Revisão

> 🤖 Modelo: `opus`

- [ ] **T15 — Revisão final**: `code-reviewer` + `security-reviewer` (BOLA nas rotas `/trips/:id`,
      upload, PII nos logs) e auditoria do code-standart §15. Atualizar `CLAUDE.md` da API e do
      frontend, e `docs/spec/domain-model.md` (que também está desatualizado quanto a
      `ON_DELIVERY_ROUTE`). Corrigir no `apps/api-transportada/CLAUDE.md` a frase de que nenhuma rota
      usa `trip.read`, e conferir se `GET /delivery-charges` (`trip.read`) recorta por vínculo para
      motorista e agregado.

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
      px; textos no vocabulário do escritório. - Achados já vistos nos prints das tasks anteriores
      (conferir e corrigir): borda cor de cobre do painel "Ações de campo" diferente do cinza do
      vizinho "Ações da viagem" (T8); textarea "Observação" com fundo cinza diferente dos selects do
      mesmo diálogo (T9); "nota(s)" em vez de plural de verdade (T9); texto de autoria na linha do
      tempo com contraste baixo (T9); ocorrência de parada pelo escritório sem foto (T8 — a rota da
      T5 é JSON; decidir se entra multipart como no motorista). - Achados corrigidos na própria task ou registrados no `evidence.md` com decisão. Fecha com os
      prints (desktop e celular) enviados ao usuário.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/156-o-escritorio-da-baixa-pelo-motorista/ (leia
spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet · Fase 1 (T2, T3 🧠) → opus, validado por architect antes de
implementar · Fases 2, 3 e 4 → executor model=sonnet, exceto T7 🧠 → opus validado por architect · T13 🧠 → opus · T14 → executor model=sonnet ·
revisão final T15 → code-reviewer + security-reviewer model=opus ·
T16 revisão de design e usabilidade → designer model=opus, com prints ao usuário.
Cada task fecha com typecheck + lint + testes da app (integração da API com --env-file=../../.env.test)
+ teste novo listado no package.json + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy
em produção, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
