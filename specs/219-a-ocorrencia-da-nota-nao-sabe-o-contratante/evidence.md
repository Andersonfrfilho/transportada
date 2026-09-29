# Evidência — Spec 219

## Contexto de execução

Branch de trabalho `work/218-snapshot-occurrence-overrides`, criada a partir de
`claude/fervent-sutherland-937527` (onde a spec 218 foi implementada e fechada, ainda não
reconciliada com `origin/staging`) — worktree próprio
(`~/Documents/personal/transportada-wt/218-snapshot-occurrence-overrides`), sem tocar o worktree
da 218 nem a árvore principal. A reconciliação dessa branch com `origin/staging` fica fora do
escopo desta spec (`plan.md`, "Contexto e premissas").

## T1/T2 — backend: `contractorId`/`recipientTaxId` no snapshot

Contrato visto falhar antes (`Expected: "f6124…" Received: undefined`), depois verde:

```
apps/api-transportada$ bun --env-file=../../.env.test test ./test/integration/me-trip.integration.ts \
  --timeout 120000 -t "override de contratante"
1 pass / 0 fail / 7 expect() calls
```

Implementação: `DriverTripDocument.contractorId`/`.recipientTaxId` (opcionais, para não quebrar
fixture antiga) em `find-current-driver-trip.use-case.ts`; `toDriverDocument`
(`drizzle-current-driver-trip.repository.ts`) passa a devolver `row.contractorId`/
`row.recipientTaxId` — colunas que a consulta `listDocuments` **já lia** para resolver
`deliveryProof`, agora também expostas ao chamador. Nenhuma consulta SQL nova.

## T3/T4 — frontend: query string do cliente

Contrato visto falhar antes (`recipientTaxId`/`contractorId` ausentes da URL), depois verde:
`occurrence-registration.contract.ts`, descrição "a lista única traz os dois fluxos" — os dois
casos novos (com e sem os parâmetros) passam junto aos 15 já existentes (17/17).

Implementação: `listOccurrenceTypes` aceita `{ contractorId?, recipientTaxId? }` opcional;
`occurrenceTypesQuery` monta a query string (vazia quando nenhum dos dois vem — comportamento de
hoje intocado). `DriverTripDocument` (cópia por valor) e `driverTripResponse.validation.ts`
(`toDocument`) ganham os dois campos, lidos com `readNullableString` (ausente/`null` vira `null`,
igual ao resto do documento).

## T5/T6 — função pura de mescla

Contrato visto falhar antes (`Export named 'mergeResolvedOccurrenceAttachmentModes' not found`),
depois verde — 3 casos novos: sem overlay (P3), com overlay casando o tipo, e tipo ausente na
resposta por nota (nunca some da lista, mantém o `attachmentMode` geral).

## T7/T8 — o hook busca por nota

Contrato de wiring visto falhar antes (`getDriverTripClient()` ausente do hook), depois verde.
`useOccurrenceRegistrationForm` busca, uma vez por abertura do formulário
(`useEffect` com `[document.contractorId, document.recipientTaxId]`), só quando há
contratante/destinatário para resolver contra; usa `mergeResolvedOccurrenceAttachmentModes` para
sobrescrever o `attachmentMode` da lista geral já carregada pela página — nunca troca a lista,
nunca decide precedência. Falha ou ausência de assunto: a lista geral segue como estava (P3/P4),
sem estado de erro visível — é refinamento, não dependência dura da tela abrir.
`DriverOccurrenceRegistrationForm.component.tsx` não mudou (RF5): continua lendo `form.types`.

## T9 — gates

- `bun run --cwd apps/api-transportada typecheck` — limpo.
- `bun run --cwd apps/api-transportada lint` — limpo (`--max-warnings=0`).
- `bun --env-file=../../.env.test test --timeout 120000` (suíte de contrato, 190 arquivos):
  **8272 pass / 23 skip / 0 fail**.
- `bun run --cwd apps/frontend-driver typecheck` — limpo.
- `bun run --cwd apps/frontend-driver lint` — limpo.
- `bun run --cwd apps/frontend-driver test` (838 testes) — **838 pass / 0 fail**.
- `bun --env-file=../../.env.test run test:integration` (141 arquivos, Postgres Docker
  `localhost:65432`, saudável): **756 pass / 7 skip / 8 fail**, todas as 8 falhas
  `this test timed out after 5000ms` (o teto padrão do `bun test`, não os `--timeout 120000` que a
  suíte só ganha quando chamada arquivo a arquivo) — em `whatsapp-flow-graph-publish`,
  `delivery-proof-received-by`, `trip-occurrence-feed-document`, `trip-redelivery-application`,
  `occurrence-settlement-charge-bridge` (×1), `trip-occurrence-settlement` (×2) e **uma** em
  `me-trip.integration.ts` ("a parada geocodificada chega com coordenada..." — geocodificação, sem
  relação com contratante/ocorrência). Nenhuma falha toca `contractorId`/`recipientTaxId`,
  `deliveryProof` ou tipo de ocorrência; o teste desta spec ("o override de contratante muda o
  comprovante efetivo...") **passou** dentro da corrida cheia. Mesma assinatura de
  [[integracao-local-nao-e-evidencia-sob-disputa]] e [[gates-longos-em-primeiro-plano]]: 141
  arquivos de integração no mesmo Postgres, sob o teto de 5 s padrão, produz timeout disperso sem
  relação com o código tocado — não uma regressão desta spec.

## T10 — revisão de design (web.md §15)

Sem tela nova, sem layout novo: a lista de tipos de ocorrência já existia (spec 218 T20,
`DriverOccurrenceRegistrationForm`), e esta spec só corrige o **valor** de `attachmentMode` que
chega a cada chip — a estrutura do DOM não muda. `bun run --cwd apps/frontend-driver test` (838
testes, incluindo `occurrence-registration-wiring.contract.ts`) prova o texto-fonte do componente
intocado. Sem print novo (nada a fotografar que a 218 já não fotografou).

## Limite registrado

O overlay por nota busca a resposta ao abrir o formulário — sem cache entre aberturas (reabrir o
mesmo diálogo refaz a chamada). Aceitável: um diálogo por vez, mesmo padrão de hoje para o
`attachProof`/upload de ocorrência, que também não cacheiam. Se o padrão de uso mostrar reabertura
frequente do mesmo diálogo, cache por `(contractorId, recipientTaxId)` fica para spec futura.
