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
