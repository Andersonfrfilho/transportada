# Spec 148 — Montagem em parede: nenhuma caixa de fora, nenhuma pilha alta isolada

> 🤖 Modelo: `opus` 🧠 (desenho do empacotador em parede, a heurística de ordem e a prova de segurança) ·
> `sonnet` (fiação no app, contratos de regressão, tela) · `haiku` (documentação)

## Problema

O empacotador do baú (`@adatechnology/cargo-placement`, repositório `~/Documents/personal/adatechnology-packages`)
deixa caixas de fora do mapa 3D com o motivo `bedFull` ("não coube: o baú encheu") enquanto sobra espaço no
baú. É o defeito que o usuário tenta resolver há dias (specs 135, 136, 139, 142, 143, 144, 146 e a sequência
D21–D26 da spec 145).

Medido em 2026-09-13 na spec 145, com as entradas reais das viagens (baú fechado `enclosedBody: true`,
`securesCargo: false`, alcance `deliveryReachM: 2`, pacote no commit `0925c14`):

| Viagem                                               | Caixas    | De fora |
| ---------------------------------------------------- | --------- | ------- |
| Atego 2426, 84 paradas (`768f475f`)                  | 1465      | 162     |
| Iveco Daily, 27 paradas (`6b676625`)                 | 444       | 11      |
| Sprinter 416 (`d665c086`)                            | 248       | 6       |
| Fiorino (`43f0218a`)                                 | 94        | 4       |
| Accelo 1016 (`c5be7eaa`) e Iveco antiga (`ce9bd380`) | 500 e 372 | 0       |

Não é falta de volume: na Atego sobram ~14,5 m² de piso com ≥ 80 cm livres por cima. O empacotador arruma
cada entrega espalhando pelo piso (as entregas do fundo cobrem os 7,4 m de comprimento a ~0,7 m de altura),
e as primeiras entregas não acham assento que respeite as regras abaixo. Mudar só a ordem das caixas dentro
da entrega (camadas niveladas, três ordens de base — commit `0925c14`) e a escora de 80% da borda sozinha
(D25, na branch `wip/cargo-wall-building`) não resolveram: a Atego ficou em 162, e a de 27 paradas piorou
para 16 com a D1.

## Regras que não se negociam (decididas pelo usuário na spec 145)

- **D23/D25 — nenhuma pilha alta isolada.** Pilha alta (acima de `STABLE_STACK_SLENDERNESS` × a menor base)
  precisa estar encostada no SENTIDO da cabeceira (parede do fundo ou pilha vizinha nessa direção) e em pelo
  menos uma lateral (parede ou pilha vizinha). O lado da porta não é exigido. Vale para o mapa recomendado,
  para o complemento e para qualquer caminho alternativo de colocação.
- **D25 — a vizinha escora com 80% da borda** (a D1 da spec 146), medida em comprimento de borda coberta.
- **Apoio mínimo de 80%** da base (`MIN_SUPPORTED_BASE_FRACTION`), célula de 5 cm, `STABLE_STACK_SLENDERNESS`:
  inalterados.
- **D24 — alcance da porta de 2 m** (`deliveryReachM`), aceitando que o conferente mexa em carga de outra
  entrega para descarregar.
- **D21/D23 — baú fechado** (`tpCar` `02`) manda `enclosedBody: true`; `securesCargo` é só a amarração pelos
  motoristas (spec 100), e com carga amarrada a esbeltez fica livre.
- A ordem de descarga por entrega continua valendo: a entrega que desce primeiro fica mais perto da porta.

## Decisão desta spec

- **D1 — Montar em parede, a partir do canto (a D26 da spec 145, descrita pelo usuário).** A primeira pilha
  vai no canto, encostada na cabeceira (parede do fundo ou a fileira anterior) e numa parede lateral. A
  seguinte encosta na cabeceira e na pilha que acabou de ser montada, que passa a ser a lateral dela, e a
  fileira atravessa a largura do baú. Quando a fileira fecha, ela vira a cabeceira da próxima, que recomeça
  encostada numa parede lateral. Por construção, toda pilha alta nasce encostada no sentido da cabeceira e
  numa lateral. Pilhas de uma entrega sobem até o teto (dentro da regra de encosto) antes de avançar em
  direção à porta, em vez de espalhar pelo piso.
- **D2 — A montagem em parede é a arrumação padrão do baú fechado** se, e só se, medir menos caixas de fora
  que a arrumação atual nas 6 entradas acima, sem violação. Fora do baú fechado nada muda, e nenhum baú pode
  desenhar menos caixas do que antes (os contratos `exact-edges` e `complement` do pacote protegem isso).
- **D3 — Meta:** nenhuma caixa que cabe fica de fora. Zero caixa `bedFull` nas 6 entradas medidas quando a carga cabe fisicamente, com os
  verificadores em zero violação e o cálculo da Atego dentro de 120 s (`CARGO_LAYOUT_TIME_BUDGET_MS`). Se a
  meta não fechar sem mexer numa regra protegida, a spec para no melhor resultado seguro e o que sobra vai ao
  usuário com a regra que barra cada caixa e o número.

- **D4 — Reorganizar depois de encher (proposta do usuário, 2026-09-13).** Depois da montagem em parede,
  uma fase de melhoria: subir caixas para cima das colunas que ainda têm altura livre, compactar os vãos
  entre pilhas e reabrir regiões do baú para rearrumá-las junto com as caixas que ficaram de fora (busca
  local do tipo destruir e reconstruir). Uma troca só é aceita se deixar menos caixas de fora e continuar
  valendo tudo: apoio de 80%, nenhuma pilha alta isolada (D23/D25), ordem de descarga e alcance de 2 m. A
  fase respeita o prazo (`deadline`) e fica com a melhor arrumação encontrada quando ele vence. É preciso
  medir o retrabalho: quantas caixas o conferente passa a mexer para descarregar.

- **D5 — Por cima, até acabar o espaço, e marcado (proposta do usuário, 2026-09-13).** Depois da montagem em
  parede (D1) e da reorganização (D4), uma última passada coloca as caixas que ainda sobraram em qualquer
  lugar onde caibam, inclusive por cima da carga de uma entrega que desce antes, até não ter mais espaço. Só
  essa passada fura a ordem de descarga; a física continua valendo: apoio de 80% e nenhuma pilha alta isolada
  (D23/D25). Cada caixa colocada assim é marcada e aparece:
  - no mapa 3D, com uma marca própria, diferente do tracejado de cobre do complemento;
  - numa lista: qual caixa, de qual nota, por cima de qual entrega, e em que parada ela precisa ser tirada do
    caminho para descarregar a de baixo.

  - como carga dividida da entrega e da nota a que pertence (reaproveitando a marca de "Divididas" /
    `splitNotes` que a ordem de carregamento já tem): quantas caixas daquela nota estão fora do lugar normal e
    onde estão, para o conferente não dar a entrega por encerrada deixando parte da carga no caminhão.

  Medir por parada quantas caixas o conferente passa a mexer. Medido na spec 145: 56 das 162 caixas de fora da
  Atego só achariam lugar por cima de entrega anterior.

## Fora do escopo

- Mudar apoio de 80%, célula de 5 cm ou `STABLE_STACK_SLENDERNESS` sem decisão explícita do usuário.
- Peso por caixa e limite por eixo (spec própria).
- Publicar o pacote além do `link:` local (decisão do usuário).

## Gates

- **G1** — Nas 6 entradas de `harness/inputs/`, `check.ts` (apoio ≥ 80%, dentro do baú, sem colisão) e `tall.ts`
  (pilha alta com encosto no sentido da cabeceira + ≥ 1 lateral, 80% da borda) com zero violações.
- **G2** — Caixas de fora ≤ as da tabela do Problema em todas as 6, e zero onde a carga cabe.
- **G3** — Suíte do pacote (`bun test ./test/cargo-placement.contract.test.ts`) sem falha nova em relação ao
  `0925c14` (lá já falhavam os dois orçamentos de 50 ms); `exact-edges` e `complement` verdes.
- **G4** — No app, a proposta de roteiro refeita no navegador mostra as caixas de fora contadas no banco e
  nenhuma pilha alta isolada no mapa 3D, conferido com o usuário.
