# Spec 146 — Escora parcial de 80% da borda, e o teto de estabilidade ganha nome próprio

> 🤖 Modelo: `opus` 🧠 (regra da escora parcial e a fronteira do teto de estabilidade) · `sonnet`
> (rótulo, API, frontend) · `haiku` (docs)

## Problema

Medido em três viagens reais do banco local — `5715dd82` (baú 6,2 × 2,4 × 1,9 m, 993 caixas),
`803f6008` (4,2 × 2,1 × 1,8 m, 668 caixas) e `5530f6f1` (7,4 × 2,47 × 2,3 m, 2474 caixas) — o
empacotador recusa caixa por `bedFull` em 30,4%, 37,1% e 26,6% do volume do baú, com o topo das
pilhas parando em 1,39 / 1,50 / 1,56 m. Não é a ordem de enchimento (variantes de camada e de limiar
de vizinho moviam o total ±1,5 pt) nem a escora de parede (a parede já escora dentro do vão de
tombamento).

A causa é `isConfined` (`apps/api-transportada/src/trips/domain/cargo-placement.policy.ts:2195-2238`):
um lado só conta como escorado quando **toda** célula de 5 cm daquela borda (`fromLine..toLine` /
`fromColumn..toColumn`) passa em `bracedToward` (`:1907`). Testando cada lado isoladamente, o
primeiro lado a falhar é a porta (`lineEnd`) em 77–87% das recusas — a porta nunca escora por decisão
de projeto (spec 133 R5, `openFace: 'lineEnd'` fixado em `placeDeliveryBlock`, `:3266`), e a carga é
carregada testeira→porta, então o vizinho do lado da porta ainda não existe no momento da colocação.
As pilhas livres — sem vizinho nenhum — param em `STABLE_STACK_SLENDERNESS = 3` (`:713`), via
`stableStackHeightM` (`:2660`).

Uma cópia de trabalho que deixa um lado contar como escorado a partir de uma fração das células da
borda (porta intocada, `catchGapM` intocado) mediu:

| viagem   | fração     | colocadas | fora | % do baú | topo máx (m) | pilhas a 5 cm do teto |
| -------- | ---------- | --------- | ---- | -------- | ------------ | --------------------- |
| 5715dd82 | 1,0 (hoje) | 861       | 132  | 30,4     | 1,39         | 0/523                 |
| 5715dd82 | 0,8        | 874       | 119  | 31,3     | 1,48         | 0/552                 |
| 5715dd82 | 0,6        | 906       | 87   | 32,6     | 1,63         | 0/582                 |
| 803f6008 | 1,0 (hoje) | 529       | 139  | 37,1     | 1,50         | 0/320                 |
| 803f6008 | 0,9        | 548       | 120  | 38,8     | 1,76         | 1/339                 |
| 803f6008 | 0,8        | 546       | 122  | 38,0     | 1,55         | 0/350                 |
| 803f6008 | 0,6        | 569       | 99   | 43,7     | 1,80         | 4/388                 |
| 5530f6f1 | 1,0 (hoje) | 1330      | 1144 | 26,6     | 1,56         | 0/811                 |
| 5530f6f1 | 0,8        | 1451      | 1023 | 28,9     | 1,68         | 0/927                 |
| 5530f6f1 | 0,7        | 1479      | 995  | 30,5     | 2,14         | 0/965                 |
| 5530f6f1 | 0,6        | 1538      | 936  | 31,1     | 1,94         | 0/1040                |

0,8 é a única fração que ganha volume nas três viagens (+0,9 / +0,9 / +2,3 pt) sem o topo subir mais
de 12 cm e sem nenhuma pilha a 5 cm do teto. 0,9 já leva `803f6008` a 1,76 m; 0,7 leva `5530f6f1` a
2,14 m num baú de 2,3 m — a mesma patologia da variante rejeitada "parede sempre escora". O teto da
alternativa "conferir confinamento só ao fim do carregamento" (passe de complemento): +15 / +42 / +112
caixas, +0,6 a +2,5 pt — rejeitada como alavanca por não distinguir o motivo da recusa (ver D5).

## Decisão

- **D1 — decidido.** `MIN_BRACED_EDGE_FRACTION = 0.8` (constante ao lado de
  `MIN_SUPPORTED_BASE_FRACTION`, `:29`, espelhando o precedente da D2 da spec 135): em `isConfined`,
  um lado conta como escorado quando ao menos 80% das células daquela borda passam em
  `bracedToward`. Vale só para `columnEnd`, `columnStart` e `lineStart`. `lineEnd` (porta) mantém o
  comportamento de hoje: nunca escora (spec 133 R5) — dito explicitamente como intocado. Se o vizinho
  do lado da porta, colocado dentro do mesmo bloco, hoje já contar em algum caminho, o executor
  confere o que o código faz ali antes de tocar e preserva esse comportamento.
- **D2 — decidido, protegido.** Continuam intocados: o vão de tombamento `catchGapM` (`3b/√10`),
  `STABLE_STACK_SLENDERNESS = 3` para pilha livre, o apoio de 80% da base, a célula de 5 cm, as
  regras de peso, `DEFAULT_ROW_COUNT`, "a vizinha só escora se sobe ao lado dela" (`053860f2`) e
  "escora só pelo lado" (`6b5e222f`). Qualquer mudança ali é fora de escopo e para para o usuário.
- **D3 — decidido.** Arredondamento: células exigidas = `Math.ceil(totalCells *
MIN_BRACED_EDGE_FRACTION)`; borda de 1 a 4 células continua exigindo todas
  (`ceil(0,8)=1`, `ceil(1,6)=2`, `ceil(2,4)=3`, `ceil(3,2)=4`); borda de 5 células exige 4. O
  executor documenta a regra exata no docstring da constante.
- **D4 — decidido.** Novo motivo de recusa `stabilityCeiling` em `UNPLACED_REASONS` (`:78`, hoje só
  `bedFull`). `placeDeliveryBlock`/`packSlice` (`:3245-3296`, `bedFull` empurrado em `:3291`) passam a
  distinguir "não sobrou piso" (`bedFull`) de "havia assento no piso, mas a pilha não pôde subir pelo
  teto de estabilidade" (`stabilityCeiling`). O executor examina como hoje se detecta o esgotamento da
  fronteira/limite de pilha e define a regra com precisão em `plan.md` antes de codificar; se os dois
  não derem para distinguir a custo baixo, marca `[NEEDS CLARIFICATION]` em vez de adivinhar. O motivo
  atravessa a resposta da API (serialização de caixas não colocadas em
  `apps/api-transportada/src/trips/infrastructure/drizzle-trip.repository.ts`, que hoje já cita
  `bedFull`), o schema Zod do frontend
  (`apps/frontend-transportada/src/modules/trip/shared/tripResponse.validation.ts`), os tipos
  (`apps/frontend-transportada/src/modules/trip/shared/trip.types.ts`) e os locales — pt
  `apps/frontend-transportada/src/modules/trip/locales/trip.locale.json:240-247` (chaves `bedFull` /
  `bedFull_other` como modelo) e en
  `apps/frontend-transportada/src/modules/trip/locales/trip.en.locale.json:189-196`. Todo consumidor
  de `bedFull` (grep confirma: `cargo-placement.policy.ts`, `drizzle-trip.repository.ts`, as suítes
  `test/cargo-placement/*.contract.ts`, os dois locales do frontend e
  `apps/frontend-transportada/test/trip/cargo-layers.contract.ts` — a legenda 3D /
  `TripCargoLayers.component.tsx` / diálogos de prévia) é listado e atualizado.
- **D5 — decidido.** Ordem em relação à spec 145: esta spec entra primeiro nesta branch, em
  `apps/api-transportada/src/trips/domain/`, para que a T1 da spec 145 extraia o empacotador já
  corrigido para `@adatechnology/cargo-placement`. `policyVersion` (D6 da spec 145) ainda não existe,
  então nada para incrementar aqui; quando a 145 entrar, as plantas guardadas recalculam no primeiro
  descompasso de hash.
- **D6 — decidido.** O docstring de `isConfined` (`:2195-2210`, hoje descreve só a regra de 100%) é
  reescrito com a tabela de recusa medida acima (fração 1,0 vs. 0,8).

## Fora do escopo

- Vão de tombamento (`catchGapM`), `STABLE_STACK_SLENDERNESS`, apoio de 80% da base, célula de 5 cm,
  regras de peso e `DEFAULT_ROW_COUNT` (D2) — mudar qualquer um exige spec própria.
- Fração diferente de 0,8 para `columnEnd`/`columnStart`/`lineStart`, ou qualquer fração para a porta
  (`lineEnd`) — medido e rejeitado (ver tabela).
- O passe de "confinamento só ao fim do carregamento" (top-up) — teto medido, rejeitado como
  alavanca.
- `policyVersion` e a extração para `@adatechnology/cargo-placement` — spec 145.
- Carga por eixo (`axleNotChecked`).

## Critério de aceite

- **G001** Contrato vermelho antes do código:
  `apps/api-transportada/test/cargo-placement/brace-fraction.contract.ts`, registrado em
  `test/cargo-volume.contract.test.ts` (a lista de imports é explícita — hoje `layers.contract.js` é
  o último, linha 35; o novo import entra logo depois). Casos: (a) pilha cujo vizinho lateral cobre
  exatamente 80% das células da borda é tratada como escorada e pode subir acima de 3× a própria
  base (até o limite da regra "vizinha escora até a própria altura"); (b) o mesmo a 79%/uma célula a
  menos não escora e para em 3×; (c) porta (`lineEnd`) com vizinho cobrindo 100% continua sem contar
  mais que hoje; (d) parede continua escorando só dentro de `catchGapM`; (e) arredondamento `ceil`
  numa borda de 5 células (exige 4) e numa de 4 células (exige 4).
- **G002** As suítes existentes de `test/cargo-placement/*.contract.ts` e
  `test/cargo-volume.contract.test.ts` seguem verdes; se algum contrato existente encodar a regra dos
  100%, é atualizado com a expectativa nova e a mudança é registrada em `evidence.md`.
- **G003** Evidência do laboratório: `apps/api-transportada/tmp/occupancy-experiment/run.ts` (já
  existe) rodado nas três viagens reproduz, com tolerância de ±5 caixas, colocadas 874 / 546 / 1451 e
  topo máximo 1,48 / 1,55 / 1,68 m, com zero pilhas a 5 cm do teto. Os números vão para
  `evidence.md`.
- **G004** Contrato do motivo: uma fixture com piso livre mas pilha que não pode subir relata
  `stabilityCeiling`; uma fixture sem piso livre relata `bedFull`; o teste de serialização da API e o
  de validação do frontend aceitam os dois.
- **G005** Frontend: texto de legenda/tooltip para o motivo novo nos dois locales;
  `bun run --cwd apps/frontend-transportada test` não mostra falha NOVA (as 15 falhas pré-existentes
  do commit de docs `37436e4a` são conhecidas — listadas como pré-existentes em `evidence.md`).
- **G006** Gate por task: `bun run typecheck` na raiz, `bun test ./test/cargo-volume.contract.test.ts`
  no app da API (e qualquer outro ponto de entrada afetado), commit isolado por task, sem push.
