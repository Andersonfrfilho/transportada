# Feature 106 — O motorista só vai onde ele cobre

> Registrada em 2026-09-09. Decisão do usuário: **região é proibição, não preferência.**

## Problema

`fleet_driver_regions` guarda que o Adalberto cobre a zona `1.002` e a Barrinha solta, e a política
de cobertura já sabe ler isso (`coversRegion`, com a zona acumulativa dentro da família — quem cobre
a 3 cobre a 1 e a 2). Toda a tabela de frete depende disso, e o custo do agregado sai dela.

**O roteirizador não sabe que isso existe.** Zero ocorrências de região em
`worker-transportada/src/routing/`, e `RouteVehicleInput` — `id`, `capacityKilograms`,
`costPerMeterMicros` — não tem onde guardar. O solver pode mandar o Adalberto para Ipuã, e manda.

## D1 — Proibição, e ela obriga a sobra a existir

Região é **restrição rígida**: parada fora da cobertura do motorista não entra na rota dele.

⚠️ **É isto que torna a sobra obrigatória.** Com preferência, o solver sempre acha onde pôr a parada
— só paga caro. Com proibição, uma parada que **ninguém** cobre não tem destino, e o solver precisa
devolvê-la em vez de forçá-la em alguém.

E aí encontramos uma promessa quebrada: a **ADR-0044 §5** diz que _"carga que excede todos os
veículos devolve o que cabe e lista o que sobrou, em vez de estourar o peso em silêncio"_.
`unassignedStopIndexes` existe no tipo, tem comentário explicando, e **nunca é preenchido**. Medido
em 2026-09-09: 8 paradas de 600 kg num veículo de 1.000 kg saem todas atribuídas, com violação de
3.800 kg e sobra vazia.

**Esta spec cumpre a §5.** Não como escopo extra — como pré-requisito: sem sobra, "proibição" seria
mentira, porque o solver atribuiria assim mesmo.

## D2 — Proibição no cromossomo, não só no fitness

As outras restrições deste solver são penalidades: a solução inviável vive e fica cara. Região
**não** pode ser assim — uma penalidade grande ainda deixa o solver escolher pagar quando a
alternativa é pior, e o resultado é um roteiro que a operação recusa inteiro.

A cobertura entra em **dois lugares**:

1. `splitAcrossVehicles` e os operadores genéticos só põem a parada num veículo que a cobre;
2. a avaliação continua conferindo, como rede — se um operador novo violar, a violação aparece com
   nome (`region_not_covered`) em vez de sair calada.

⚠️ Quem cobre a região é o **motorista**, não o veículo. O solver raciocina em veículos, então a
cobertura chega como atributo do veículo **já resolvida pelo par motorista↔veículo** da sugestão
(ADR-0055). Veículo sem motorista pareado **não tem restrição de região** — distribuir na véspera,
antes da escala, é uso normal, e proibir tudo ali travaria o caso mais comum.

## D3 — A sobra é resultado, não erro

A parada que ninguém cobre volta em `unassignedStopIndexes` com o motivo. Ela **não** vira falha da
sugestão: o operador recebe o roteiro do que coube e a lista do que não, e decide — chamar agregado,
esperar o dia seguinte, ou cobrir a região no cadastro.

⚠️ A tela precisa mostrar a sobra. Sugestão que devolve 40 paradas e cala sobre 12 é pior que
sugestão nenhuma, porque parece completa.

## Fora de escopo

- Volume como segunda dimensão (pergunta ainda aberta: `measured` restringe, `estimated` avisa?).
- Janela múltipla por dia.
- Agendamento como restrição de roteiro.
- Ondas / múltiplas viagens (MTVRP) — mas a sobra desta spec é a fundação delas.

## Aceite

1. Parada fora da cobertura do motorista não entra na rota dele, em nenhuma geração.
2. Parada que ninguém cobre volta em `unassignedStopIndexes`, com motivo.
3. Veículo sem motorista pareado não sofre restrição de região.
4. Cobertura por cidade solta vale junto com a por zona.
5. Zona acumulativa: quem cobre `1.002` cobre `1.001` e `1.000`.
6. Sem cadastro de região nenhum, o comportamento é o de hoje — nada restringe.
