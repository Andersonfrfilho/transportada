# Spec 148 — Plano

## Onde o código está

- Pacote: `~/Documents/personal/adatechnology-packages`, worktree `../adatechnology-packages-wt/cargo-placement`,
  pacote em `packages/backend/cargo-placement`. O app consome por `link:` e lê `dist/` (recompilar com
  `pnpm run build` depois de mudar o pacote; reiniciar o worker para ele carregar o `dist` novo).
- Branches do pacote:
  - `feat/cargo-placement` @ `0925c14`: D23 (`enclosedBody`), camadas niveladas (três ordens de base por
    entrega), `deliveryReachM` e `CARGO_LAYOUT_POLICY_VERSION` `'2'`. Base medida desta spec.
  - `wip/cargo-wall-building`: D25 (vizinha escora com 80% da borda, versão `'3'`) e uma primeira
    `wallBuilding` (montagem em parede), **não medidas por inteiro**. Medido só a D1 sozinha: Atego 162
    (127 s), 27 paradas 16 (piorou), Sprinter 4, Fiorino 4; fora do baú fechado a D1 fez a Daily real
    desenhar 1 caixa a menos, derrubando `exact-edges` e `complement`. Ponto de partida, não verdade.
- App: branch `work/cargo-missing-box` do worktree `transportada-wt/cargo-missing-box`, sem push.
  `enclosedBody` e `deliveryReachM: 2` já chegam ao empacotador pela API (`trips/domain/cargo-securing.policy.ts`,
  `cargo-delivery-reach.constant.ts`) e pelo worker (`cargo-layout/*`).

## Pontos do empacotador (arquivo `src/cargo-placement.policy.ts`, linhas de `0925c14`)

- `isStandingUp` (~2913): recusa pilha alta sem confinamento.
- `isConfined` (~2194/2283): quais lados precisam de escora; com `enclosed`, sentido cabeceira + ≥ 1 lateral.
- `sideHolds` (~2004) / `bracedToward` (~1918): a caminhada de escora; a porta nunca escora (~1856).
- `stableStackHeightM` (~2655) e `STABLE_STACK_SLENDERNESS` (~730).
- `isOutOfReach` (~2155) e `DELIVERY_REACH_M` (~747), hoje parametrizado por `deliveryReachM`.
- `placeDeliveryBlock` (~3217), `packBlockOnce` (~3391), as três ordens de base (~3016): onde entra a
  montagem em parede.
- `failedAt` (~3550): memória de formato (correta — a gêmea de uma caixa que falhou não é tentada de novo).

## Abordagem

1. Reproduzir a base (`0925c14`) com o harness (`harness/`): as 6 entradas devem dar a tabela da spec.
2. Desenhar a montagem em parede (D1) como ordem de colocação no baú fechado: fileiras a partir da cabeceira,
   cada uma atravessando a largura a partir de uma parede lateral, com cada pilha subindo até o teto (dentro
   da D23/D25) antes da próxima; a pilha anterior da fileira é a lateral da seguinte e a fileira anterior é
   a cabeceira. Por entrega, na ordem de descarga, com o alcance de 2 m.
3. Medir parede sozinha e parede + D25 contra a base, com `check.ts`, `tall.ts` e `classify.ts`.
4. Adotar como padrão do baú fechado só se medir melhor (D2); fora do baú fechado, zero regressão.
5. Recompilar, reiniciar o worker, refazer a proposta no navegador e contar no banco (G4).

## Riscos

- Tempo: a Atego com a D1 levou 127 s; o orçamento é 120 s por tentativa (escada 120/240/480 s). A montagem
  em parede precisa caber, ou a primeira tentativa é cortada por `time_budget`.
- Retrabalho: o alcance de 2 m já aumenta caixas que o conferente não pega de pé; medir e relatar.
- As entradas do harness são reais e anonimizadas (sem cliente nem endereço); o empacotador não lê esses
  campos, então os números não mudam.
