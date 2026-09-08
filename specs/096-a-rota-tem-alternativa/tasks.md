# Tasks — 096 A rota tem alternativa

> 🤖 Modelo: `sonnet` (T1 e T5 são 🧠 — validar com `opus` antes)

Uma task por vez. Teste de contrato **antes** da implementação. Task só fecha com evidência em
`evidence.md`.

## Fase 1 — A rota passa a ter opções

> 🤖 Modelo: `sonnet`

### T1 🧠 — `alternatives=true` e o custo total de cada opção

`POST /route-geometry` passa a devolver **as rotas alternativas**, cada uma com trechos, nós, praças
e custo — reusando `resolveTollRouteCost`, que continua sendo o único lugar que soma.

- **Depende de:** 090 T5.
- **Aceite:** Ribeirão Preto → Campinas devolve 2 rotas (221,5 km / 5 praças / R$ 108,60 e
  239,6 km / 4 praças / R$ 93,20 num toco); Ribeirão Preto → Pirassununga devolve 1.
- 🧠 porque muda o contrato de uma porta já usada pela montagem e pela viagem aberta, e porque o
  payload cresce por rota.

### T2 — A comparação que soma combustível

`domain/route-option.policy.ts`, pura: recebe as opções com distância e pedágio, mais o consumo e o
preço, e devolve qual é a **mais rápida** e qual é a **mais barata por custo total**.

- **Depende de:** T1.
- **Aceite:** com o caso medido de Campinas, a rota de menos pedágio **não** recebe o rótulo de mais
  barata — 18,1 km a mais custam ~R$ 32 de diesel contra R$ 15,40 de pedágio economizado. O contrato
  reprova a atribuição feita só pelo pedágio.
- **Aceite:** sem consumo ou sem preço, nenhuma opção recebe rótulo de mais barata, e a razão sai
  junto.

### T3 — O seletor na montagem

Na `TripAssemblyMap`, abaixo do tempo do roteiro: as opções com distância, tempo, praças e custo
total, e a escolhida redesenhando o traço.

- **Depende de:** T2.
- **Aceite:** rota única **não** renderiza seletor. Rótulo de estimado herdado da 090 quando o eixo
  for estimado.

## Fase 2 — O mapa mostra o número

> 🤖 Modelo: `sonnet`

### T4 — A praça com o valor ao lado do ícone

Camada de rótulo sobre as praças **do trajeto**, vindas da resposta da rota.

- **Depende de:** T1.
- **Aceite:** praça sem tarifa imprime `—`, e o contrato reprova `R$ 0,00` nesse caso. O rótulo não
  compete com o pino da parada: entra abaixo dele na ordem do estilo, como a 089b fez.

### T5 🧠 — O radar com a velocidade permitida

`overlay.yml` ganha `maxspeed`, `maxspeed:hgv` e `direction`; o overlay é reassado e o estilo imprime
o número ao lado do ícone que já existe.

- **Depende de:** nada (independente da Fase 1).
- **Aceite:** 527 radares, **438 com número** e 89 sem; o radar sem `maxspeed` renderiza sem número.
  `maxspeed:hgv` vence quando existir (12 casos).
- **Verificação:** contagem de feições nas telhas que contêm os radares medidos, no molde da T205 da
  089b — o jar do planetiler extraído uma vez, 51 s locais, sem build remoto.
- 🧠 porque mexe no artefato de build do mapa, que é o que serve o basemap em produção.

## Fase 3 — Fechamento

> 🤖 Modelo: `haiku`

### T6 — Documentação viva

Parágrafo no `CLAUDE.md`, `evidence.md` com a saída de cada task, e o `OBJETIVO-MAPA.md` atualizado.

- **Depende de:** T1..T5.

## Portões

- A Fase 1 não fecha sem a comparação de custo total: entregar o seletor sem ela é publicar o rótulo
  que a D1 chama de mentira.
- A Fase 2 é independente da 1 e pode correr em paralelo.
