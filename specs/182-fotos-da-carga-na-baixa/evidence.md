# Evidência — Feature 182

## T1.1 — Quem depende da unicidade `(company, stop_event, kind)`

Mapeado em 2026-09-24 com `grep -rn "insert(tripDeliveryProofs)"` em `apps/api-transportada/src`.
Duas escritas, e as duas são `onConflictDoUpdate` com esse alvo exato:

| Arquivo | Linha | Caminho |
|---|---|---|
| `trips/infrastructure/drizzle-delivery-proof.repository.ts` | 331 | anexo do motorista pela rota própria |
| `trips/infrastructure/drizzle-driver-field-report.repository.ts` | 634 | `saveDeliveryProofWithinTransaction` — motorista **e** escritório (`office-delivery-proof.service.ts:146`) |

**Consequência para a T1.3:** trocar a constraint por índice único parcial sem tocar nesses dois
faz o Postgres recusar o `ON CONFLICT` ("there is no unique or exclusion constraint matching the ON
CONFLICT specification") — a baixa quebraria, a do motorista inclusive.

**Decisão:** os dois ganham `targetWhere: kind <> 'cargo'`, repetindo o predicado do índice. O
Postgres infere o índice parcial como árbitro; a linha `cargo` nunca satisfaz o predicado, então
nunca conflita e entra como inserção simples — pela **mesma** função, sem ramo de persistência novo.

## T1.2–T1.4 — Banco (2026-09-24)

**Mudança.** `TRIP_DELIVERY_PROOF_KINDS` ganha `cargo`; a constraint
`trip_delivery_proofs_company_event_kind_unique` vira índice único parcial `where kind <> 'cargo'`;
os dois `onConflictDoUpdate` repetem o predicado em `targetWhere` — **como literal**: com `$1` a
inferência do índice parcial falha do mesmo jeito. Migration `20260924142302_delivery_proof_cargo_kind`
com `rollback.sql` que recusa enquanto houver linha `cargo` e apaga a própria linha do journal
conferindo `ROW_COUNT`.

**Gates.**

| Comando | Resultado |
|---|---|
| `make migration-test` | 110 pass, 0 fail, 0 skip — sobe, desce, sobe, desce |
| contrato da API (`bun --env-file=../../.env.test test`) | 7220 pass, 0 fail (23 skip pré-existentes, `testWithPostgres` sem banco) |
| integração da API (`bun --env-file=../../.env.test run test:integration`) | 571 pass, 0 fail, 7 skip pré-existentes — 106 arquivos, 502 s |
| `bun run typecheck` | limpo |

**Mutações — o teste falha sem a correção:**

| Mutação | Resultado |
|---|---|
| mensagem do `RAISE` do rollback trocada | `migration-test` 109/1: a sonda do CA08 roda de verdade |
| `targetWhere` removido do repositório compartilhado (escritório) | 3 falhas com `there is no unique or exclusion constraint matching the ON CONFLICT specification` |
| `targetWhere` removido do repositório do motorista | 4 falhas no app do motorista |

Sem o `targetWhere`, **toda baixa com foto quebraria em produção** — do escritório e do motorista.
O risco que o plano apontou era real, e agora tem teste.

**CA01, CA02, CA08:** `delivery-proof-cargo.assertion.ts` grava duas fotos `cargo` no mesmo evento,
recusa o segundo canhoto pelo índice parcial e prova que o rollback recusa sem apagar. O teste novo
em `trip-field-office.integration.ts` força o `DO UPDATE` pela rota real: o segundo canhoto do
escritório substitui o primeiro.

## T2.1–T2.2 — API

**Mudança.** `field-proof` ganha `kind` multipart opcional (`photo` padrão | `cargo`; `signature`
recusado com 400 — o escritório não colhe assinatura, ADR-0067 §5). `persistOfficeProof`
(`office-delivery-proof.service.ts`) ganha o ramo `cargo`: sem `findProofForEvent`/substituição, sem
nome nem documento do recebedor, idempotência por `attachmentKey` filtrada por `kind` (já genérica),
e contagem do evento (`countProofsForEvent`, porta nova em `driver-field-report.port.ts`, implementada
em `drizzle-driver-field-report.repository.ts` com `count(*)::int`) — a partir da sexta, 422
`TRIP_DELIVERY_PROOF_CARGO_LIMIT` (`TripDeliveryProofCargoLimitError`, nova em
`trip-field-office.error.ts`). Limite `TRIP_DELIVERY_PROOF_CARGO_LIMIT = 5` em
`delivery-event.constant.ts` (D3). `reportFieldProof` pula `assertOfficeProofMeetsSettings` para
`kind: cargo` — a foto de carga não é o canhoto e não precisa satisfazer "foto"/"assinatura
obrigatória" da configuração da empresa. `field-delivery` continua sem o campo `kind` (só
`field-proof` aceita, RF3/D5) e segue gravando sempre `photo`.

**Arquivos.** `domain/delivery-event.constant.ts`, `domain/trip-field-office.error.ts`,
`presentation/office-field-delivery.schema.ts`, `application/office-delivery-proof.service.ts`,
`application/report-field-proof.use-case.ts`, `application/document-outcome-proof.service.ts`
(passa `kind: PHOTO_PROOF_KIND` explícito no `field-delivery`), `application/driver-field-report.port.ts`,
`infrastructure/drizzle-driver-field-report.repository.ts`,
`presentation/trip-field-office-document.routes.ts`, `main.ts` (composição). Testes:
`test/trip-field-office/upload-hardening.contract.ts` (parsing de `kind`),
`test/integration/trip-field-office.integration.ts` (soma, idempotência, limite, teto de bytes e
cabeçalho), `test/driver-trip/field-report.double.ts` e `test/driver-trip/office-field-delivery.contract.ts`
(dublê ganha `countProofsForEvent` e `kind: 'photo'` explícito, sem mudar comportamento).

**Gates.**

| Comando | Resultado |
|---|---|
| `bun run typecheck` | limpo |
| `bun run lint` | limpo (`eslint src test drizzle.config.ts eslint.config.js --max-warnings=0`) |
| contrato da API (`bun --env-file=../../.env.test test --timeout 120000`) | 7226 pass, 0 fail, 23 skip pré-existentes |
| integração afetada (`bun --env-file=../../.env.test test ./test/integration/trip-field-office.integration.ts ./test/integration/trip-field-office-router.integration.ts --timeout 120000`) | 26 pass, 0 fail, 0 skip |

**CA01, CA03, CA04, CA05, RF3, RF4, RF5, RF6:** `trip-field-office.integration.ts` ganhou quatro
testes contra Postgres real — `kind: cargo` soma duas linhas sem mexer no canhoto e a mesma
`attachmentKey` devolve o id já gravado sem duplicar; a sexta foto de carga do evento recebe 422
`TRIP_DELIVERY_PROOF_CARGO_LIMIT` sem gravar (confirmado por contagem no banco); foto de carga acima
de 960 KiB ou com cabeçalho que não é imagem é recusada com os mesmos códigos do canhoto
(`TRIP_DELIVERY_PROOF_TOO_LARGE`, `TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE`). `upload-hardening.contract.ts`
prova a análise de `kind` isolada: sem campo → `photo`; `photo` explícito → `photo`; `cargo` → `cargo`;
`signature` ou valor desconhecido → 400; `field-delivery` continua recusando o campo `kind` (só
`field-proof` aceita). O teste de CA02 já existente (T1.4, "o segundo canhoto do escritório substitui
o primeiro") cobre RF3 item "sem `kind`, comportamento de hoje" sem precisar de teste novo — ele nunca
manda o campo.

## T4.1–T4.2 — Comprovante (Frontend)

**Mudança.** `DeliveryProofKind` ganha `'cargo'`; `DeliveryProofView` ganha campo `cargoPhotos`; 
`resolveDeliveryProofView` filtra `cargoPhotos` com `kind === 'cargo'` e atualiza lógica de 
`receiverName` (assinatura > photo > nada; cargo nunca fornece nome — ADR-0067 §5); validação em 
`tripResponse.validation.ts` aceita `'cargo'` em `isDeliveryProof`; 
`TripDeliveryProof.component.tsx` renderiza grupo com fotos de carga após assinaturas e canhotos, 
reusando `ProofImage` com `alt` próprio; strings de localização em português e inglês 
(`cargoPhotoAlt`, `cargoPhotosTitle`) adicionadas em ordem alfabética.

**Arquivos.** `src/modules/trip/shared/deliveryProof.service.ts`, 
`src/modules/trip/shared/tripResponse.validation.ts`, 
`src/modules/trip/components/TripDeliveryProof.component.tsx`, 
`src/modules/trip/locales/trip.locale.json`, `src/modules/trip/locales/trip.en.locale.json`, 
`test/trip/delivery-proof.contract.ts`.

**Gates.**

| Comando | Resultado |
|---|---|
| `bun run typecheck` | limpo |
| `bun run lint` | limpo |
| `bun --env-file=../../.env.test run test` | 5160 pass, 0 fail; test:hooks 44 pass, 0 fail |

**CA06, RF8:** `TripDeliveryProof.component.tsx` exibe grupo "Fotos da carga" após assinaturas e 
canhotos; renderização condicional (só exibe se `cargoPhotos.length > 0`). Prova: título e `alt` 
aparecem apenas quando há fotos de carga; grupo vazio não ocupa espaço.

**RF1, CA06:** Validação em `isDeliveryProof` aceita `kind: 'cargo'`; `deliveryProofsFromApi` 
processa lista com múltiplas fotos `cargo` do mesmo evento sem rejeição. Prova: testes de contrato 
passam com `cargo` na lista.

**Prioridade de nome (ADR-0067 §5):** `receiverName` segue ordem — assinatura (imagem do canhoto 
assinado) tem prioridade sobre canhoto com nome digitado; cargo nunca fornece nome. Prova: testes 
verificam que com assinatura e canhoto ambos com nome, o retorno é o da assinatura; sem assinatura, 
usa nome do canhoto; sem ambos, retorna `null`.

## T3.1–T3.2 — Assistente

**Mudança.** `FieldDeliveryDraft` ganha `cargoImageBlobs: readonly Blob[]` (sempre presente, `[]`
quando a nota não tem foto de carga). No passo de revisão (D4), ao lado de quem recebeu, o bloco
"Fotos da carga (opcional)" oferece `FileField` com `accept="image/*"`, `multiple` e
`capture="environment"` (câmera traseira no celular; seletor de arquivo sempre disponível no
computador) — cada arquivo escolhido passa por `loadImageFromFile` + `reduceFieldDeliveryImageToJpeg`
(mesma redução do canhoto) antes de virar miniatura local; miniaturas em grid (`repeat(auto-fill,
minmax(4.5rem, 1fr))`, sem `border-radius`) com botão "Remover foto N da carga" por posição; contador
"N de 5"; ao chegar em cinco, o `FileField` cede lugar ao aviso `cargoLimitReached`; escolher mais
arquivos do que cabe aceita só os que cabem e mostra `cargoOverflowNotice`. O Blob reduzido só entra
no rascunho (`cargoImageBlobs`) ao confirmar o passo — nunca antes. Limite `FIELD_DELIVERY_CARGO_PHOTO_LIMIT
= 5` (D3) em `fieldDeliveryCargoPhoto.service.ts`, junto com `canAddFieldDeliveryCargoPhoto` e
`splitFieldDeliveryCargoPhotoSelection`, puras e testadas sem DOM.

**Cliente HTTP.** `attachFieldProof` (`tripClient.service.ts`) — `POST
.../documents/:documentId/field-proof`, multipart (`file`, `kind`, `driverId` opcional),
`Idempotency-Key` no cabeçalho, mesmo molde de `attachOccurrencePhoto`/`reportFieldDelivery`. Tipos
novos `FieldProofKind`/`AttachFieldProofInput` em `trip.types.ts`; resposta reaproveita
`FieldReportIdResult` (`{ id }`, mesmo formato de `field-proof` na API). Exposto no controller
(`useTripWorkspace.hook.ts`) atrás de `trip.report-on-behalf` (mesmo gate de `reportFieldDelivery`) e
passado ao `useFieldDelivery` em `TripDetail.component.tsx`.

**Envio (D5).** `useFieldDelivery.hook.ts`: depois que `reportFieldDelivery` resolve para uma nota
(`delivered` ou `alreadySettled`), `sendCargoPhotos` sobe cada `cargoImageBlobs[i]` **em sequência**
(`for` com `await`, nunca `Promise.all`) via `attachFieldProof({ kind: 'cargo', ... })`. Cada foto usa
uma `Idempotency-Key` própria, estável por `(documentId, índice)`, guardada em
`cargoIdempotencyKeysRef` (mesmo padrão de `idempotencyKeysRef` da baixa) — nunca regenerada, nem no
retry. Foto que falha não lança: só soma em `cargoPending`, e a nota continua `delivered`/
`alreadySettled` — a baixa nunca é desfeita por causa de upload de foto. `FieldDeliverySendOutcome`
ganha `cargoPending?: number` nos dois casos de sucesso (`fieldDeliverySend.service.ts`).
`retryFailed` passou a incluir, além das notas `failed` retryable, as notas já entregues com
`cargoPending > 0` — o reenvio inteiro (baixa + fotos) é seguro porque as duas pontas são idempotentes
pela mesma chave. `reset` limpa `cargoIdempotencyKeysRef` junto com o resto.

**Tela de envio.** `FieldDeliverySendStep.component.tsx` mostra, na linha da nota, um aviso
(`role="alert"`) com `cargoPending` fotos que não subiram quando `cargoPending > 0`; o botão "Tentar
de novo" agora conta também as notas com foto de carga pendente, não só as `failed`.

**Locale.** `fieldDelivery.*` ganhou nove chaves (pt-BR e en, ordem alfabética dentro do bloco):
`cargoAdd`, `cargoCount`, `cargoLimitReached`, `cargoOverflowNotice`, `cargoPending`/`cargoPending_other`
(sufixo i18next 25), `cargoPhotosLabel`, `cargoPhotosRemove`, `cargoPhotosThumbAlt`.

**Decisões não 100% especificadas no prompt:**
- Nome do campo de pendência: `cargoPending?: number` (ausente/zero = nenhuma pendente), em vez de um
  terceiro `kind` — a nota nunca deixa de ser `delivered`/`alreadySettled` por causa da foto de carga
  (RF/D5), só o aviso muda.
- Formato do aviso na tela de envio: linha própria, `role="alert"`, junto do status da nota — mesma
  posição de `finishedRecipient`, sem criar uma seção separada.
- Retry de foto pendente sem falha de nota: em vez de um caminho novo, o retry reenvia o `sendDraft`
  inteiro para a nota (baixa + fotos) — seguro pela idempotência das duas chamadas, e reusa a mesma
  função de envio em vez de duplicar lógica de reenvio só de foto.
- Ordem "em sequência, nunca em paralelo": provada travando a primeira chamada de `attachFieldProof`
  (promise controlada) e confirmando que a segunda só dispara depois de liberar a primeira — mais
  forte que comparar `idempotencyKey`.

**Gates.**

| Comando | Resultado |
|---|---|
| `bun run typecheck` | limpo (`tsc --noEmit`) |
| `bun run lint` | limpo (`eslint .`) |
| `bun --env-file=../../.env.test run test` | 5166 pass, 0 fail (`bun test`, 29 arquivos) + 48 pass, 0 fail (`test:hooks`, 1 arquivo) |

**T3.1 (CA07 parcial — a revisão visual completa é T5.1):** os quatro casos pedidos e o teste de
limite (item 5) estão em `test/trip-hooks/field-delivery.contract.ts` (descrição "fotos da carga") e
`test/trip/field-delivery-review.contract.ts` (descrição "limite de fotos da carga") — duas fotos →
baixa e depois duas chamadas `cargo` em sequência; falha numa foto → `delivered` com `cargoPending: 1`;
`retryFailed` reenvia com a mesma `Idempotency-Key`; nota sem foto de carga nunca chama
`attachFieldProof`; teto de cinco como função pura.

## T5.1–T5.2 — Revisão de design e auditoria (2026-09-24)

**Smoke** `apps/frontend-transportada/test/field-delivery-cargo.smoke.spec.ts` — câmera simulada,
canhoto capturado, duas fotos de carga reduzidas pelo `reduceFieldDeliveryImageToJpeg`, envio. Registrado
no `testMatch` do `playwright.config.ts`, ao lado do `field-delivery.smoke.spec.ts`.

| Execução | Resultado |
|---|---|
| `VITE_SMOKE_AUTH_BYPASS=true … PLAYWRIGHT_TEST_MATCH='field-delivery-cargo.smoke.spec.ts' bunx playwright test` | 5 passed |

O teste de comportamento confirma, contra a rota interceptada: a baixa sobe, **depois** duas chamadas
`field-proof` com `kind=cargo`, com `Idempotency-Key` distintas. Em 375px, sem rolagem horizontal.

**Prints** em `prints/`: `review-{desktop,mobile}-{light,dark}.png` (a revisão inteira),
`cargo-{desktop,mobile}-{light,dark}.png` (o bloco das fotos — o diálogo rola por dentro, e o print
do diálogo inteiro mostra só o topo) e `send-desktop.png`.

**Achados da revisão de design:**

| Achado | Veredito |
|---|---|
| Botão de remover sobre a miniatura — 38px de controle sobre 72px de foto, no meio da imagem | **Corrigido**: embaixo da foto, largura toda, altura de toque do sistema |
| Rótulo "Fotos da carga (opcional)" duplicado | Não é defeito: o segundo `<label>` do `FileField` fica escondido, e o nome acessível do input vem do `aria-label` (comentário em `file-field.tsx`) |
| Barra fixa cobrindo o botão de adicionar | Não é defeito: a barra está no fluxo, no fim do formulário; rolando até o fim, o bloco fica acima dela — o print é que rolou só o mínimo |

**Auditoria §15:**

- Log: nenhuma linha de log nova no diff contra `origin/staging` — nome, documento e imagem não vão para log.
- Storage: mesmo caminho do canhoto — bucket privado, entrega por URL assinada.
- Erro: `TripDeliveryProofCargoLimitError` (422) é erro de domínio; nada de `AppError` cru nem stack trace.
- N+1: uma contagem por envio (`countProofsForEvent`), não por foto em laço.
- **Limite conhecido — taxa:** a rota do escritório aceita 300 chamadas por 5 min por usuário, somando
  baixa, anexo e devolução. Lote realista (10–30 notas) tem folga; 50 notas com cinco fotos cada chega
  ao teto, e o excedente volta 429 — reenviável: a nota fica entregue e a foto pendente, com "Tentar de novo".
- **Limite conhecido — concorrência:** o teto de cinco é contagem seguida de inserção; dois envios
  simultâneos da mesma nota poderiam passar juntos da quarta foto. O assistente envia uma por vez, então
  não acontece por ele; um cliente que paralelizasse poderia gravar a sexta.

**Gates finais do frontend:** `bun run typecheck` limpo · `bun run lint` limpo ·
`bun --env-file=../../.env.test run test` → 5166 pass / 0 fail + 48 pass / 0 fail.
