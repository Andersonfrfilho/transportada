# Evidência — 088 Onde encostar a carga

Medido em 2026-09-06, na base local com a frota e as 353 NF-e reais.

## Cobertura, antes e depois

| medida                                               | antes       | depois                                    | como                                                     |
| ---------------------------------------------------- | ----------- | ----------------------------------------- | -------------------------------------------------------- |
| Veículos com as três medidas do baú                  | **0 de 12** | 0 de 12 na base; **3 de 4** no seed local | a ficha nunca ofereceu os campos — agora oferece         |
| Veículos com `capacity_m3` digitado                  | 4           | 4                                         | inalterado; o m³ digitado continua para quem só sabe ele |
| Notas com **todas** as linhas casadas a caixa medida | 15 de 345   | 15 de 345                                 | é o denominador da camada (R4), e ele é da fila da 085   |
| Notas com alguma linha medida                        | 87 de 345   | 87 de 345                                 | parcial não conta camada, por decisão (D5)               |
| Caixas medidas pelo conferente                       | 6 de 663    | 6 de 663                                  | esta spec não mede caixa; ela consome o que a 085 mede   |
| Referências de mercado com dimensão                  | 7           | 7                                         | continuam alimentando **ocupação**, nunca a planta (D2)  |

O zero da primeira linha é o achado que ordenou a feature, e ele **não se conserta com código**: as
colunas existem desde a 075 e `resolveVehicleCapacity` já as prefere; o que faltava era a tela
perguntar. O seed local passou a trazer três veículos medidos e um — o `three_quarter`, que também
não tem referência — **deliberadamente sem medida**, porque é o caso que a tela precisa saber recusar.

## O CHECK, contra Postgres de verdade

`make migration-test` → 91 pass, 0 fail (migration + rollback em base descartável).

Aplicado também à base local, e conferido ali:

```
fleet_vehicles_cargo_height_check
fleet_vehicles_cargo_length_check
fleet_vehicles_cargo_width_check

NOTICE: ok recusado: ... viola "fleet_vehicles_cargo_length_check"   (40 m)
NOTICE: ok recusado: ... viola "fleet_vehicles_cargo_width_check"    (4 cm)
```

Um CHECK **por dimensão**, e não os três juntos: a recusa nomeia qual medida está fora. Zero
continua passando — é ausência, e é o estado da frota.

## Testes

| suíte                                  | resultado                           |
| -------------------------------------- | ----------------------------------- |
| `api-transportada` `bun run test`      | 4392 tests, 0 fail                  |
| `frontend-transportada` `bun run test` | 2814 pass, 0 fail                   |
| `worker-transportada` `bun run test`   | 907 pass, 0 fail                    |
| `make migration-test`                  | 91 pass, 0 fail                     |
| `bun run lint` / `bun run format`      | limpos                              |
| `bun run typecheck`                    | sem erro novo (ver ressalva abaixo) |

Contratos escritos nesta feature, todos antes da implementação:

- `api/test/fleet-schema/vehicles.contract.ts` — os três CHECKs, e o antigo comum ausente
- `api/test/database-migration/fleet-constraints.assertion.ts` — 40 m e 4 cm recusados no Postgres
- `api/test/fleet-infrastructure/vehicle-mapper.contract.ts` — as três medidas e o m³ com origem
- `api/test/cargo-volume/cargo-depth.contract.ts` — critérios 3, 4 e 6, e a ausência preservando a 085
- `api/test/cargo-volume/cargo-plan.contract.ts` — critério 5, e a referência recusada pela planta
- `frontend/test/fleet/vehicle-cargo-dimensions.contract.ts` — a ficha, e o baú **não** herdado
- `frontend/test/trip/cargo-depth.contract.ts` — o metro atravessando o guard, negativo incluído
- `frontend/test/trip/cargo-plan.contract.ts` — critérios 1, 2, 4, 6 e 7, e as três frases da tela
- `frontend/test/design-system/scale-plan.contract.ts` — a razão do `viewBox` é a razão do baú

## A planta em 375, 768 e 1280 — conferida, e verde

`frontend/test/responsive.smoke.spec.ts`, três execuções (mobile 375×812, tablet 768×1024, desktop
1280×900) com o modo `measured-bed` do `trip-smoke.helper`:

```
✓ a planta do baú mantém a escala e não estoura a página em mobile
✓ a planta do baú mantém a escala e não estoura a página em tablet
✓ a planta do baú mantém a escala e não estoura a página em desktop

48 passed (38.6s)   ← o smoke inteiro, não só os três
```

Cada execução afirma: a planta visível pelo `role="img"`, o `viewBox` **proporcional à ficha**
(`0 0 796 303`, que é a razão 7,400 × 2,470 mais a margem — não a razão da janela), o metro de cada
parada por extenso, a camada só na parada com todas as caixas medidas, a contagem das que faltam com
o atalho `/?tab=boxes`, a frase que recusa a leitura como plano de estiva, e
`assertNoHorizontalOverflow` — a planta rola no próprio contêiner, e a página nunca ganha barra.

### O que estava no caminho, e como saiu

O `bun run build` do frontend falhava **antes desta spec**, no limite de precache do PWA: um chunk
`index` de 2.099,31 kB contra o teto de 2 MiB do workbox, margem de ~0,3 kB. Sem build não há
`preview`, e sem `preview` o Playwright não sobe — então `make check` e o smoke inteiro estavam
parados, não só os três casos desta feature.

A correção não foi uma decisão nova: o `react.md` já pedia `React.lazy` + `Suspense` por rota, e o
`web.md` §13 pede tree shaking. As 22 telas de workspace viraram `import()` próprio, com o
`PageTransitionSkeleton` que já existia servindo de `fallback` — o mesmo esqueleto das duas esperas,
como `docs/frontend/loading.md` manda. As três telas de entrada (primeiro acesso, recuperação de
senha, identificação) ficam de fora: renderizam **antes** da casca, e adiá-las trocaria o custo por
um piscar na primeira coisa que o usuário vê.

|                 | antes                     | depois                      |
| --------------- | ------------------------- | --------------------------- |
| `index-*.js`    | 2.099,31 kB (gzip 583,52) | **837,63 kB** (gzip 254,08) |
| `bun run build` | falha                     | ✓ 3,83 s                    |
| `bun run smoke` | não sobe                  | **48 passed**               |

## ⚠️ A G001 já estava publicada — esta entrega é o que faltava

Entre a implementação e a publicação, **outra sessão implementou e subiu a G001 inteira**: as três
medidas na ficha, o `vehicleCargoDimensions.service` com o m³ derivado, o `Capacidade (m³)`
somente-leitura e o `resolveSubmittedCapacity`, que ainda fecha o buraco do `capacity_m3` obsoleto.
A escala deles é de **duas casas** — centímetro, que é o que a fita lê num baú — e não de três.

Esta entrega foi **refeita sobre a G001 deles**, e por isso é menor do que a spec sugere:

| parte                                                               | de onde vem                       |
| ------------------------------------------------------------------- | --------------------------------- |
| campos na ficha, m³ derivado, campo somente-leitura                 | **já publicado** por outra sessão |
| CHECK por dimensão, com migration e rollback                        | esta entrega                      |
| limites no Zod, na mesma faixa dos CHECKs                           | esta entrega                      |
| profundidade da faixa, distância da porta, espaço livre e excedente | esta entrega                      |
| camadas a partir da caixa medida, e a contagem do que falta medir   | esta entrega                      |
| a planta em escala e a ligação ao painel                            | esta entrega                      |
| divisão por rota, que destrava o build do PWA                       | esta entrega                      |

Duas coisas minhas foram **descartadas** por já existirem lá em versão publicada: a paleta de
paradas unificada (`stopColorOf`) e o `resolvedCapacity` na API, que ficaria sem consumidor porque
a ficha deriva o m³ no próprio cliente.

O gate de revisão desta feature — três passes independentes, sete achados corrigidos, veredito
LIMPO — está no histórico da sessão; as correções que sobreviveram ao recorte acima estão no código.

## Ressalvas honestas

- **`typecheck` da API tem erros pré-existentes** em `cte-batches` e `nfse-*` (`recipientCityCode`
  obrigatório), vindos de trabalho não commitado que já estava na árvore. Nenhum é desta feature, e
  nenhum foi introduzido por ela.
- **O limite de precache do PWA** acima é anterior a esta spec e bloqueia `make check` por inteiro.
  Corrigi-lo é decidir se um chunk de 2,1 MB deve ser pré-cacheado — decisão de produto, com spec
  própria, e não um efeito colateral desta.
- `occupancy.capacityUnknown` ficou só em pt-BR: a seção `occupancy` inteira **não existe** em
  `trip.en.locale.json`, e é anterior a esta spec. Acrescentar uma chave sozinha ali criaria uma
  seção onde só ela é traduzida, que é pior que a seção inteira caindo no fallback.
- A base local recebeu, **para esta medição**, o baú de três veículos do seed (`RTA2F45`,
  `RTB3G56`, `RTC4H67`). É base descartável de desenvolvimento.
