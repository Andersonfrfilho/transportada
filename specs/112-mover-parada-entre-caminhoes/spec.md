# Spec 112 — Mover parada para outro caminhão da proposta

## Pedido

Na proposta multi-veículo, cada parada ganha um select para **jogar a parada para outro caminhão** da
mesma proposta, oferecendo só os caminhões **com espaço disponível**.

## O que isto reverte

A spec 110 escreveu que mover destino entre caminhões "não existe": o solver redistribui e desfaria o
movimento. A spec 111 gravou isso como regra no aceite (`ROUTE_SUGGESTION_STOP_NOT_IN_VEHICLE`, 400).
O argumento deixou de valer: desde a 111 **o aceite não roda o solver** — ele cria as viagens na ordem
e na distribuição que recebe. "Recalcular a proposta" continua rodando o solver, e por isso descarta
movimentos e ordens escolhidos à mão; é o mesmo contrato do botão hoje.

## O que já existe, medido no código

- `readGroups` (`drizzle-multi-vehicle-suggestion.repository.ts`) **já lê** a nota de cada parada —
  junta `route_suggestion_stop_documents` linha a linha — e depois achata numa lista por caminhão.
  Mover não precisa de migration nem de consulta nova: o grupo passa a devolver
  `documentIdsByAddressKey` em vez de jogar o mapeamento fora.
- O front já tem, para todo caminhão proposto, o peso de cada nota (`cargoGrossWeight` do maço) e o
  teto da ficha (`capacityKilograms`).

## Decisões propostas

- **D1 — "Espaço" é peso, e a tela diz isso.** Peso é conhecido para todo caminhão; cubagem só é
  calculada para o caminhão aberto na tela (a prévia de carga roda por viagem expandida). O select
  oferece o caminhão cuja sobra de peso (teto da ficha − peso atual) comporta o peso da parada, e o
  rótulo diz a sobra. Caminhão sem teto na ficha **não** entra — sobra desconhecida não é sobra.
- **D2 — Mover é rascunho, como a ordem.** Entra no fim da lista do caminhão de destino, sai da de
  origem, e as duas viagens ficam com a faixa "não salvo"; "Salvar ordem" mede as duas. O aceite fica
  travado enquanto houver rascunho.
- **D3 — O aceite leva o movimento pelo mesmo campo.** Uma chave de outro caminhão na
  `stopOrderByVehicle` de um veículo deixa de ser 400 e passa a ser movimento: a parada e **as notas
  dela** saem do grupo de origem e entram no de destino. A mesma chave em dois caminhões continua
  sendo 400 — qual deles fica com ela seria palpite.
- **D4 — Os dois caminhões nascem sem horário previsto**: a ordem de ambos mudou.

## Em aberto

- **Parada que ficou de fora da proposta** (a sobra — medido em 2026-09-09: 148 por capacidade) não
  está em grupo nenhum: `readGroups` só lê parada com veículo. Jogá-la num caminhão com espaço é o
  caso de maior valor e exige ler a sobra no aceite. Fica para depois de D1–D4 funcionarem.
- **Validar o peso no servidor.** Hoje o aviso de estouro de peso não bloqueia (ADR-0044 §4: violação
  é penalidade, quem despacha é o operador). O movimento segue a mesma regra.
