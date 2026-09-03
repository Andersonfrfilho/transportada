# ADR-0055 — A sugestão multi-veículo escolhe quem dirige

- **Data:** 2026-09-03
- **Estado:** aceita
- **Contexto:** adendo à ADR-0044 §5 (spec 058 P2), revertendo a decisão registrada em
  `routing/infrastructure/trip-composer.adapter.ts`.

## Contexto

A ADR-0044 §5 fixou que o aceite da sugestão multi-veículo cria a viagem **sem motorista**, com o
argumento de que _"escolher a tripulação é decisão de escala, e inventá-la aqui poria alguém na
estrada por dedução"_.

O argumento estava certo sobre **deduzir** e errado sobre **carregar**. Ele foi escrito antes de a
ADR-0050 §5 e o PWA de campo existirem, e não pesou o caminho de leitura do motorista:
`membership → fleet_drivers → trip_drivers → trip`, em `find-current-driver-trip.use-case.ts`. Esse
caminho parte de `trip_drivers`. Viagem sem linha ali **não existe para quem dirige**: o motorista
abre o aplicativo e não vê viagem nenhuma, e nada do trabalho de campo — separar, carregar, reportar
entrega — chega até ele.

Na prática o operador reabre cada viagem criada e escolhe o motorista de novo. Com o agregado isso é
redigitar o que o cadastro já sabe: `fleet_driver_vehicle_assignments` amarra motorista e veículo, e
o agregado costuma ter exatamente um.

## Decisão

O par **veículo ↔ motorista** é escolhido pelo humano no diálogo, atravessa a rota e o banco, e o
aceite cria a viagem com ele.

1. `POST /route-suggestions/multi-vehicle` recebe `vehicles: [{vehicleId, driverId?}]`.
2. `route_suggestion_vehicles.driver_id` é nulo e opcional. Nulo é o par sem motorista, que continua
   sendo o comportamento anterior.
3. O aceite chama `create({driverIds: [driverId]})` quando o par tem motorista, e `[]` quando não.
4. O preenchimento no diálogo é **sugestão de vínculo único, nunca dedução**: um veículo com dois
   motoristas, ou um motorista com dois veículos, deixa o outro lado vazio para o humano decidir.

## Consequências

- A frase "viagem nasce sem motorista" sai do `trip-composer.adapter.ts`. Quem procurar por ela
  encontra este ADR no lugar.
- O motorista continua **opcional**: distribuir carga na véspera, antes de saber quem dirige, segue
  possível, e o aceite dessas sugestões se comporta como antes.
- O mesmo motorista em dois pares do mesmo pedido é recusado (`409`). Duas viagens simultâneas para
  a mesma pessoa apareceriam juntas no PWA dela, sem nada dizendo qual é a de hoje.
- O aceite **não reconfere** o motorista. Entre o pedido e o aceite ele pode ter sido suspenso; a
  viagem nasce com ele do mesmo jeito, como nasceria se o operador o tivesse escolhido pela tela da
  viagem. Recusar o aceite inteiro por causa disso desfaria a distribuição de dezenas de notas por
  uma linha de cadastro que se conserta em outro lugar.
- O solver **não** ganhou nada: ele continua sem saber que motorista existe. Quem decide é o humano,
  antes de pedir.
