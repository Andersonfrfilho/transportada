# Spec 146 — Plano

> 🤖 Modelo: `opus` 🧠 na fase 1 · `sonnet` na fase 2 · `haiku` na fase 3

Base: `work/cargo-missing-box` sobre `origin/staging`. Esta spec entra **antes** da spec 145 (D5):
o empacotador ainda mora em `apps/api-transportada/src/trips/domain/`, e a extração para
`@adatechnology/cargo-placement` (145 T1) parte do código já com a escora parcial. Contrato antes do
código em toda fase.

## Fase 1 — Escora parcial e o teto de estabilidade com nome (🧠 `opus`)

Onde: `apps/api-transportada/src/trips/domain/cargo-placement.policy.ts`.

- Nova constante `MIN_BRACED_EDGE_FRACTION = 0.8`, declarada perto de
  `MIN_SUPPORTED_BASE_FRACTION` (`:29`), com docstring que registra a tabela de recusa medida (D6) e
  a regra de arredondamento (D3).
- `isConfined` (`:2195-2238`) para de exigir todas as células de `bracedToward` (`:1907`) em
  `columnEnd`, `columnStart` e `lineStart`; passa a contar quantas células passam e comparar contra
  `Math.ceil(totalCells * MIN_BRACED_EDGE_FRACTION)`. `lineEnd` (a porta, `braceSides.lineEnd` em
  `:1852`) mantém a varredura de hoje — nenhuma célula da porta conta a mais. ⚠️ A varredura de hoje
  sai no primeiro lado solto (comentário em `:1852-1857`, "sai no primeiro lado solto"); com a
  fração, os quatro lados de `columnEnd`/`columnStart`/`lineStart` precisam terminar de contar antes
  de decidir — o executor confere se isso muda o orçamento de tempo do Atego (D4 da spec 135) e
  registra em `evidence.md`; se piorar, memoriza a contagem por célula do jeito que `spanMemo` já
  memoriza os limites de coluna/linha (não inventar estrutura nova).
- Contrato `apps/api-transportada/test/cargo-placement/brace-fraction.contract.ts` (G001),
  importado em `test/cargo-volume.contract.test.ts` logo após `layers.contract.js` (hoje a última
  linha do bloco `cargo-placement/*`, `:35`) — ⚠️ a lista de imports é explícita.
- `stableStackHeightM` (`:2660`) e `STABLE_STACK_SLENDERNESS` (`:713`) não mudam (D2) — a escora
  parcial só afeta quem **tem** vizinho lateral; a pilha sem vizinho nenhum continua parando em
  3× a base.
- Rodar `apps/api-transportada/tmp/occupancy-experiment/run.ts` (já existe) nas três viagens medidas
  (`5715dd82`, `803f6008`, `5530f6f1`) com a fração 0,8 e registrar colocadas/topo máximo/pilhas a
  5 cm do teto em `evidence.md` (G003).
- **Validar com `architect` (opus) antes de codificar**: a regra de arredondamento da D3 (borda de
  1–4 células continua exigindo 100%) e o que fazer quando `totalCells === 0` (pegada sem célula na
  borda — checar se isso é alcançável hoje).

## Fase 2 — Rótulo do teto de estabilidade, da API à tela (`sonnet`)

- `UNPLACED_REASONS` (`:78`) ganha `'stabilityCeiling'`. `placeDeliveryBlock`/`packSlice`
  (`:3245-3296`, `bedFull` empurrado em `:3291`) distinguem: sobrou assento no piso mas a pilha não
  subiu por `stableStackHeightM`/`STABLE_STACK_SLENDERNESS` → `stabilityCeiling`; não sobrou piso →
  `bedFull` como hoje. Contrato vermelho antes (mesma suíte `brace-fraction.contract.ts` ou uma nova
  `stability-ceiling.contract.ts`, decisão do executor conforme o tamanho) cobre os dois motivos
  isoladamente (G004). Se a distinção não for barata de fazer no ponto onde o "assento existia" já
  foi descartado, marcar `[NEEDS CLARIFICATION]` em vez de aproximar.
- Serialização da API: `apps/api-transportada/src/trips/infrastructure/drizzle-trip.repository.ts`
  (já cita `bedFull` — grep confirma) passa a repassar `stabilityCeiling` sem tradução.
- Frontend, `apps/frontend-transportada/src/modules/trip/`:
  `shared/tripResponse.validation.ts` (schema Zod do motivo, hoje sem literal por string — confere o
  enum/union usado e estende), `shared/trip.types.ts` (o tipo do motivo), `components/TripCargoPanel`
  ou `components/TripCargoLayers.component.tsx` (legenda — confere qual dos dois desenha o motivo
  hoje), `locales/trip.locale.json:240-247` (ao lado das chaves `bedFull`) e
  `locales/trip.en.locale.json:189-196`. Teste de referência:
  `apps/frontend-transportada/test/trip/cargo-layers.contract.ts` (já cobre `bedFull` — estende para
  `stabilityCeiling`).
- `bun run --cwd apps/frontend-transportada test`: as 15 falhas pré-existentes do commit
  `37436e4a` (docs) não contam contra esta task; qualquer falha nova é registrada e investigada.

## Fase 3 — Documentação (`haiku`)

- `docs/domain/cargo-placement-defects.md`: acrescentar uma entrada **ao final** (o arquivo termina
  em `## Lição de método, que custou duas correções`, linha 404 de 411) — não editar seções
  anteriores.
- `docs/ai-context/api-transportada.md`: uma linha na seção de cargo placement (ponteiros hoje entre
  as linhas 618–906) apontando para a spec 146.
- `apps/api-transportada/CLAUDE.md`: a seção "## Carga: cubagem, capacidade e cargo placement — ver
  a referência" (`:122`) ganha uma linha citando a spec 146 ao lado da 144, se essa seção falar de
  cargo placement (grep `cargo` confirma que fala).
- `evidence.md` fechado com a saída dos contratos vermelho→verde, `typecheck`, testes por app, e a
  comparação de G003.

## Riscos

- **Custo de tempo da varredura completa por célula.** Hoje `isConfined` sai no primeiro lado solto;
  contar célula a célula os três lados que passam a admitir fração pode mexer no orçamento de 50 ms
  do Atego (D4 da spec 135). Medir antes de fechar a fase 1.
- **Distinguir `bedFull` de `stabilityCeiling` a custo baixo.** Se o ponto onde hoje se decide
  `bedFull` já perdeu a informação de "havia assento", a fase 2 pode exigir carregar um sinal extra
  pela função — não inventar heurística; parar e perguntar se o custo for alto.
- **`totalCells === 0` na borda.** Caso de canto da D3 não coberto pela tabela do usuário — o
  `architect` confere se é alcançável antes da fase 1 fechar.
