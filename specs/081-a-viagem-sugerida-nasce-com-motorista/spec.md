# Feature 081 — A viagem sugerida nasce com motorista

## Problema e resultado

A sugestão multi-veículo (spec 058 P2) escolhe **veículo**, e só veículo. O aceite cria as viagens
chamando os casos de uso da 056 com `driverIds: []`, por decisão escrita em
`trip-composer.adapter.ts`: _"o solver decide o veículo, não quem dirige"_.

Essa decisão tem uma consequência que a 058 não pesou: **a viagem sem motorista não existe para o
motorista.** O caminho do PWA de campo é
`membership → fleet_drivers → trip_drivers → trip` (`find-current-driver-trip.use-case.ts`), e ele
parte de `trip_drivers`. Viagem criada pelo aceite não tem linha ali, então quem dirige entra no
aplicativo e não vê viagem nenhuma — não separa, não carrega, não reporta entrega. O operador tem
de reabrir cada viagem criada e escolher o motorista de novo, uma por uma, para que o trabalho
apareça do outro lado.

O agregado torna isso mais óbvio: ele **já tem veículo vinculado**
(`fleet_driver_vehicle_assignments`). A informação que o aceite precisa já está no cadastro, e
mesmo assim é digitada de novo depois.

O resultado desta feature é o diálogo passar a montar **pares** — um veículo e o motorista daquele
veículo —, o par atravessar a rota e o banco, e o aceite criar a viagem já com a tripulação. Quem
dirige abre o PWA e a viagem está lá.

## Fora do escopo

- Escolher motorista **pelo solver**. O par continua sendo decisão humana; o solver segue decidindo
  só a distribuição das paradas entre veículos.
- Tripulação de dois (`trip_drivers` aceita mais de um por viagem). Aqui é um motorista por veículo;
  o segundo continua entrando pela tela da viagem.
- Sugestão de viagem única (`POST /trips/:id/route-suggestions`) — ali a viagem já existe, e a
  tripulação dela também.
- Exigir motorista. Par sem motorista continua válido: distribuir carga antes de saber quem dirige é
  o uso normal de quem monta a escala na véspera.

## Histórias priorizadas

### P1 — O agregado chega pronto

**Given** um agregado com exatamente um veículo vinculado
**When** o operador o escolhe no diálogo de sugestão
**Then** o veículo dele aparece no par já preenchido, sem clique.

### P1 — O veículo traz o motorista dele

**Given** um veículo com exatamente um motorista vinculado
**When** o operador escolhe o veículo
**Then** o motorista aparece no par já preenchido.

### P1 — A viagem criada já é do motorista

**Given** um par com motorista, aceito no diálogo
**When** o motorista abre o PWA
**Then** a viagem criada aparece para ele, sem passo intermediário no painel.

### P2 — O vínculo ambíguo pede decisão

**Given** um veículo com dois motoristas vinculados, ou um motorista com dois veículos
**When** ele entra no par
**Then** o outro lado fica vazio e o operador escolhe — nada é preenchido por dedução.

## Requisitos funcionais

- **RF-1** `POST /route-suggestions/multi-vehicle` recebe `vehicles: [{vehicleId, driverId?}]` no
  lugar de `vehicleIds`. O par é único por `vehicleId`.
- **RF-2** O mesmo motorista **não** pode aparecer em dois pares do mesmo pedido: ele não dirige
  duas viagens ao mesmo tempo, e aceitar isso criaria duas viagens que o PWA mostraria juntas.
- **RF-3** Motorista inexistente, de outra empresa ou inativo é recusado como os veículos já são —
  `409`, com os ids no `details`.
- **RF-4** `route_suggestion_vehicles` ganha `driver_id` nulo, com FK composta
  `(company_id, driver_id)`. Nulo é o par sem motorista, que continua legítimo.
- **RF-5** O aceite cria a viagem com `driverIds: [driverId]` quando o par tem motorista, e `[]`
  quando não tem.
- **RF-6** O corpo do aceite nomeia o motorista de cada viagem criada (`driverId`), para a tela
  dizer quem ficou com o quê sem uma segunda consulta.
- **RF-7** `GET /fleet/driver-vehicles` (`fleet.read`, escopo `company`) devolve os vínculos da
  empresa como pares `{driverId, vehicleId}` — é o que o diálogo usa para preencher os dois lados.
- **RF-8** O diálogo oferece as duas entradas sobre a **mesma** lista de pares: escolher veículo
  preenche o motorista quando o vínculo é um só; escolher motorista preenche o veículo pela mesma
  regra. Vínculo ausente ou múltiplo deixa o outro lado vazio e editável.

## Requisitos não funcionais

- O vocabulário de erro sobe como código (`MULTI_VEHICLE_SUGGESTION_DRIVER_UNAVAILABLE`), traduzido
  na tela como os outros.
- A cópia do schema no worker acompanha a coluna nova (`worker-transportada/src/database/routing.schema.ts`).
- Isolamento multiempresa: a consulta de vínculos e a de motorista indisponível filtram por
  `company_id`, com contrato negativo.

## Casos extremos e falhas

- **Motorista vinculado a veículo que não traciona.** O veículo já é recusado hoje; o par cai junto,
  pelo motivo do veículo.
- **Motorista fica inativo entre o pedido e o aceite.** O aceite não reconfere: a viagem nasce com
  ele, como nasceria se o operador o tivesse escolhido na tela da viagem. Reconferir aqui recusaria
  um aceite por causa de uma linha que o próprio operador pode consertar depois.
- **Par sem motorista misturado com par com motorista.** Legítimo: metade da frota escalada, metade
  não.
- **Sugestão gravada antes desta feature.** `driver_id` nulo em toda linha antiga — o aceite delas
  continua criando viagem sem motorista, exatamente como antes.

## Critérios de aceite

- [ ] `bun run typecheck` e `bun run lint` limpos na raiz.
- [ ] Contratos novos verdes: par no schema da rota, motorista indisponível, aceite com e sem
      motorista, preenchimento dos dois lados no diálogo, isolamento multiempresa do vínculo.
- [ ] `make migration-test` verde com a migration nova e o `rollback.sql` ao lado.
- [ ] Evidência registrada em `evidence.md`.

## Dúvidas

Nenhuma aberta.
