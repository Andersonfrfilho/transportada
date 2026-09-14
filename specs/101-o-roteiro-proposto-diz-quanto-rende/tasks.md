# Tasks 101 — O roteiro proposto diz quanto rende

> 🤖 Modelo: `sonnet` (T2 e T4 são 🧠 — validar o desenho com `opus` antes de implementar)

Uma task por vez. Cada uma fecha com evidência em `evidence.md` e commit isolado.

---

## T1 — `valuationOf` vira seam público

**Depende de:** nada.

Exportar `valuationOf` de `trips/application/read-trip-valuation.use-case.ts:290` como
`buildValuationFromContext`, com a assinatura que já tem (`{ companyId, context, repository }`).
Nenhuma mudança de comportamento — renomear e exportar.

⚠️ O comentário acima dela passa a dizer **por que** ela é pública: é a única conta de margem do
produto, e uma segunda implementação divergiria calada (é o defeito que a spec 100 corrigiu no preço
do combustível).

- **Verificação:** `bun run --cwd apps/api-transportada test` e `bun run typecheck` na raiz.
- **Aceite:** suíte da API verde sem nenhum teste alterado.

---

## T2 🧠 — A política pura do conjunto

**Depende de:** nada (pode correr junto de T1).

Criar `routing/domain/suggestion-valuation.policy.ts`, **sem I/O**:

- `sumVehicleRoad(stops)` — distância e duração de um veículo, somando as paradas dele.
  ⚠️ `distanceFromPreviousMeters` é `null` na primeira parada e na parada fora da otimização: `null`
  é ausência, não zero, e uma parada sem distância torna o total do veículo **desconhecido**, não
  menor do que é.
- `buildSuggestionValuationReport({ vehicles })` — tempo, distância, custo, receita e lucro do
  conjunto, mais `hasGaps` e a lista deduplicada de lacunas (D4).
- Tempo total é **soma**, não máximo (D4). O teste afirma isso por extenso, com dois veículos.

**Contrato antes:** `test/suggestion-valuation/policy.contract.ts` cobrindo: parada sem distância,
um veículo, dois veículos, lacuna de um contaminando o total, e conjunto vazio.

- **Verificação:** `bun run --cwd apps/api-transportada test`.
- **Aceite:** contrato verde; nenhum import de banco no arquivo de política.

---

## T3 — A leitura: notas e veículos da sugestão

**Depende de:** T2.

`routing/application/suggestion-valuation.port.ts` e
`routing/infrastructure/drizzle-suggestion-valuation.repository.ts`:

- `readSuggestionVehicles({ companyId, suggestionId })` → `route_suggestion_vehicles` ordenado por
  `position` (a ordem oferecida é a que a tela mostra).
- `readDocumentsByVehicle({ companyId, suggestionId })` → junção
  `route_suggestion_stop_documents → route_suggestion_stops`, com `vehicle_id` na projeção.
  **Uma consulta**, nunca uma por veículo.

⚠️ `company_id` no `where` das duas, e o teste de isolamento é obrigatório: sugestão de outra
empresa é ausência, nunca 403 (mesma regra da chave de acesso).

**Contrato antes:** `test/suggestion-valuation/tenant-safety.contract.ts`.

- **Verificação:** `bun run --cwd apps/api-transportada test`.
- **Aceite:** contrato de isolamento verde.

---

## T4 🧠 — O use case e a rota

**Depende de:** T1, T2, T3.

`routing/application/read-suggestion-valuation.use-case.ts`: para cada veículo da sugestão, monta o
contexto com `readPreviewContext` (notas daquele veículo, motorista pareado) e **injeta a distância
somada de T2**, com `toll: null`; chama `buildValuationFromContext`; agrega com a política.

`GET /route-suggestions/:id/valuation` em `multi-vehicle-suggestion.routes.ts`, `trip.financials`,
escopo `company`. Sugestão que não é multi-veículo, ou que não está `ready`, responde `409` com
código estável — não uma lista vazia, que seria indistinguível de "nenhum veículo".

- **Verificação:** `bun run --cwd apps/api-transportada test`, `bun run typecheck`.
- **Aceite:** **contrato que falha se `RouteGeometryPort` for chamada neste caminho** (D1 é o
  coração da spec e precisa de guarda executável, no molde de
  `paid-provider-never-called.contract.ts` do worker).

---

## T5 — Pedágio é lacuna declarada

**Depende de:** T4.

Acrescentar `tollNotAvailableInSuggestion: 'TOLL_NOT_AVAILABLE_IN_SUGGESTION'` a `VALUATION_GAPS`
(`trips/domain/trip-valuation.policy.ts`) e fazer a parcela de pedágio do caminho da sugestão sair
com ela, valor zero e `source: 'missing'`.

⚠️ O contrato do frontend `valuation-gap-labels.contract.ts` lê `VALUATION_GAPS` do fonte da API e
**vai reprovar** até T8 pôr o rótulo nas duas telas e nos dois idiomas. É o comportamento correto do
contrato; T5 e T8 fecham juntas ou T8 vem logo atrás.

- **Verificação:** `bun run --cwd apps/api-transportada test`.
- **Aceite:** teste afirmando que a parcela nunca sai `0` sem a lacuna.

---

## T6 — A conta por veículo na tela

**Depende de:** T4.

`shared/suggestionValuation.service.ts` + `.validation.ts` + `queries/useSuggestionValuation.query.ts`,
e o bloco por veículo em `MultiVehicleSuggestionDialog.component.tsx`, ao lado das paradas.

- `enabled` exige `trip.financials` **e** sugestão `ready`.
- Sem a permissão o bloco **não existe** — nem moldura, nem "—" (regra do painel de hoje).
- Carregando é esqueleto com a forma do conteúdo, nunca texto solto.
- ⚠️ O guard é `hasExactKeys`: campo novo na API com o frontend antigo derruba a validação e o painel
  some com 200 na rede — o defeito de `VEHICLE_DETAIL_KEYS`. **A API sobe primeiro.**

- **Verificação:** `bun run --cwd apps/frontend-transportada test`.
- **Aceite:** contrato de permissão (com e sem `trip.financials`) e de esqueleto.

---

## T7 — O relatório do conjunto

**Depende de:** T6.

`components/SuggestionValuationReport.component.tsx`: tempo, distância, gasto, lucro e as entregas
por veículo.

⚠️ **Proibido imprimir o lucro total sem a marca de incompleto** quando `hasGaps`. O contrato reprova
o componente se o número aparecer sozinho, e proíbe segunda condição escondendo a marca — mesmo
molde de `test/trip/occupancy.contract.ts`.

Decidir aqui se `buildValuationSteps` sobe de `modules/trip/shared/` para `modules/shared/`.

- **Verificação:** `bun run --cwd apps/frontend-transportada test`.
- **Aceite:** contrato da marca de incompleto verde.

---

## T8 — Rótulos

**Depende de:** T5, T7.

`TOLL_NOT_AVAILABLE_IN_SUGGESTION` e os rótulos do relatório nos quatro arquivos de locale (pt e en,
`trip` e `tripFinancials`), mais os de `routing`.

- **Verificação:** `bun run --cwd apps/frontend-transportada test`.
- **Aceite:** `valuation-gap-labels.contract.ts` e `locale-accents.contract.ts` verdes.

---

## T9 — Fechamento

**Depende de:** todas.

`make check`; atualizar `CLAUDE.md` (a rota nova, D1 e D2 por extenso — D2 é a que alguém vai
redescobrir), `evidence.md` com a saída dos gates, e o `package.json` de cada app com os arquivos de
teste novos.

- **Aceite:** `make check` verde e nenhum `[NEEDS CLARIFICATION]` aberto.
