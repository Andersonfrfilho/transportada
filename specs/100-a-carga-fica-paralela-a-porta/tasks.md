# Feature 100 — Tarefas

> ⚠️ Contrato de aceite **antes** da implementação, em toda task. A ordem abaixo não é sugestão: a
> T4 e a T5 fecham juntas ou a tela passa a mentir (spec D5).

## Fase 1 — Decidir o arranjo

> 🤖 Modelo: `opus` 🧠 — é a decisão que as outras herdam.

### T1 — `resolveStopArrangement`, política pura

Nova função em `src/trips/domain/cargo-placement.policy.ts`, exportada, decidindo `'lanes' | 'depth'`
a partir do baú, das caixas e do `payloadRatio`.

- Dependências: nenhuma.
- Contrato: `test/cargo-placement/arrangement.contract.ts` — os aceites 1, 2, 3, 4 e 5 da spec.
- Verificação: `bun run --cwd apps/api-transportada test`.
- Aceite: as cinco afirmações passam, e a função não conhece coordenada nenhuma.

## Fase 2 — O desenho

> 🤖 Modelo: `sonnet`.

### T2 — Empacotar no baú girado

`resolveCargoPlacement` passa a girar o baú quando o arranjo é `lanes`, e a destrocar `x ↔ y` e a
profundidade/largura do encaixe ao devolver.

- Dependências: T1.
- Contrato: estender `test/cargo-placement/slices.contract.ts` — caixa nenhuma fora do baú depois da
  destroca, e o `y` de cada parada dentro da faixa dela.
- Verificação: `bun run --cwd apps/api-transportada test`.

### T3 — O vão e a carga dividida no eixo certo

O vão da 099 D2 e `findSplitSpot` passam a valer no eixo que a rotação escolheu.

- Dependências: T2.
- Contrato: estender `test/cargo-placement/slices.contract.ts` — com faixas o vão sobra na lateral
  oposta à primeira entrega, nunca entre faixas.
- ⚠️ Risco: é aqui que a rotação deixa de ser troca de rótulo. Sem este contrato o contorno vermelho
  aparece em lugar plausível e errado.

## Fase 3 — A tabela e a tela

> 🤖 Modelo: `sonnet`. **T4 e T5 fecham no mesmo commit.**

### T4 — `resolveCargoLayout` publica o arranjo

`stopArrangement` na `ResolvedCargoLayout`, `distanceFromDoorM` zero em faixa, `orderIsBinding` falso
em faixa.

- Dependências: T1.
- Contrato: `test/cargo-volume/cargo-layout.contract.ts` — aceites 6 e 8.

### T5 — A tela desenha e nomeia o arranjo

Cabeçalho da ordem de carregamento, coluna "Faixa do baú" e a planta em escala.

- Dependências: T4.
- Contrato: `apps/frontend-transportada/test/trip/cargo-arrangement.contract.ts` — aceite 9, e o
  aviso da D4 quando o peso trocou o arranjo.
- Verificação: `bun run --cwd apps/frontend-transportada test`.

## Fase 4 — Fechamento

### T6 — Evidência

`evidence.md` com a viagem real da crítica (`RTF7L01`, três paradas) medida antes e depois: quantas
paradas acessíveis pela porta em cada arranjo.

- Dependências: T1 a T5.
- ⚠️ Sem número medido esta feature não fecha — é a mesma exigência da 099.
