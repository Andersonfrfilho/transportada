# Feature 097 — A viagem começa no barracão

> Registrada em 2026-09-08, a partir de defeito relatado pelo usuário olhando a tela.

## Problema e resultado

O mapa da montagem desenha a rota **da primeira entrega em diante**. O caminhão sai do barracão, e
essa perna não existe em lugar nenhum da conta: nem na distância, nem no tempo, nem no combustível,
nem no pedágio.

Medido em 2026-09-08 com o barracão real desta base (`-21.1767, -47.8208`, precisão de porta) e as
três notas de uma viagem de verdade — Orlândia, Orlândia, Ipuã:

| rota                        | distância |   tempo | praças | pedágio (toco) |
| --------------------------- | --------: | ------: | -----: | -------------: |
| **como a tela mostra hoje** |   48,4 km |  40 min |  **0** |    **R$ 0,00** |
| com o barracão na origem    |  105,5 km |  86 min |  **1** |   **R$ 30,00** |
| ida e volta ao barracão     |  209,0 km | 167 min |      2 |       R$ 60,00 |

⚠️ **A viagem parece não ter pedágio e tem.** A distância mais que dobra, e todo o erro é **para
baixo** — a direção que faz aceitar carga que não paga.

## O que já existe, e é o que torna isto barato

**O roteirizador já sabe do barracão.** `company_route_optimization_settings.origin_address_key`
guarda o endereço, `geocoded_addresses` tem a coordenada, e o solver do worker usa `depotIndex: 0`
com `endPolicy` cujo padrão é `depot` — ou seja, **"Propor ordem" e "Melhor rota" já partem do
barracão e voltam para ele**.

⚠️ **Quem não sabe é o mapa da montagem.** `TripAssemblyMap` monta os pontos só com as paradas das
notas, e é essa lista que vai ao `/route-geometry` — de onde saem tempo, distância, combustível e
pedágio. O produto tem **duas verdades sobre a mesma viagem**, e a que o operador lê é a errada.

## Decisões

### D1 — O traçado da montagem usa a mesma política do solver

A rota desenhada parte do barracão e termina conforme `endPolicy` (`depot` por padrão), que é o que o
solver já faz. Uma segunda regra aqui recriaria a divergência que este defeito é.

⚠️ **E isso já decide a volta, sem decisão nova.** Medido nesta base em 2026-09-08: as duas empresas
têm `end_policy = 'depot'`, que é também o padrão do esquema. A política configurada **já diz** que a
rota termina no barracão — então o roteiro real é _barracão → paradas → barracão_, e o custo previsto
é o de **ida e volta**: na viagem medida, 209 km e **R$ 60,00** de pedágio num toco, contra os R$ 0,00
que a tela mostra hoje.

Quem quiser terminar na última parada muda `end_policy` para `last_stop` — a configuração existe, e a
montagem passa a respeitá-la junto com o solver. O que não pode é a montagem ter uma política própria.

### D2 — Sem coordenada do barracão, a perna não existe e a tela diz isso

Barracão sem endereço cadastrado ou sem geocodificação **não vira ponto inventado**. A rota volta a
começar na primeira entrega, e a tela avisa que a perna inicial está de fora — com atalho para
cadastrar. Um custo silenciosamente incompleto é o que esta feature existe para acabar.

### D3 — A parada do barracão não é entrega

Ela entra no traçado e na conta, e **não** entra na lista numerada de paradas, não conta em ocupação
de carga, não gera `trip_stops` e não vira nota. É origem, não destino.

### D4 — O barracão tem marca própria no mapa, nunca o pino de parada

O ponto de partida **não pode usar o pino numerado das entregas**. Ele não é parada, não tem número
na sequência e não recebe carga — e um pino igual aos outros faz o operador contar quatro entregas
onde há três, ou procurar a nota da "parada 1" que é o próprio galpão.

A marca é distinta em **forma**, não só em cor: cor sozinha não sobrevive a daltonismo nem a mapa
impresso, e aqui a diferença é categórica — origem contra destino —, não de grau.

⚠️ Com `end_policy = 'depot'` o barracão aparece **duas vezes no traçado**, começo e fim, e é **o
mesmo lugar**. Ele é desenhado uma vez só: dois marcadores idênticos sobrepostos sugerem dois pontos
distintos, e a rota já mostra a volta pela linha.

### D5 — O roteiro é do escritório; o motorista pode mudar na rua

O guia de campo (ADR-0059) leva o motorista até a próxima parada do roteiro despachado, e mudar de
caminho na rua não replaneja a viagem. O custo previsto é o do roteiro planejado — e continua sendo,
mesmo que o motorista pegue outro caminho.

### D6 — O retorno do agregado é a casa dele, e isso esbarra na ADR-0039

Levantado pelo usuário em 2026-09-08: **o retorno pode ser ao barracão ou à casa do agregado.** Faz
sentido operacional — o agregado não devolve o caminhão ao galpão, ele vai para casa —, e muda o
custo: a última perna passa a depender de **quem dirige**, não só da política da empresa.

O modelo hoje não comporta isso. `end_policy` é da **empresa** (`depot` | `last_stop` | `address`),
e a casa do agregado é do **motorista**. Seria uma política nova, resolvida por viagem, com a
coordenada vindo de `fleet_drivers`.

⚠️ **E é aí que trava: `fleet_drivers` guarda o endereço residencial, e a ADR-0039 decidiu
criptografá-lo — decidido _porque_ ninguém o lê.** O `CLAUDE.md` é explícito: _"quem for escrever
leitor para um desses campos passa a ter de abrir envelope: confira a ADR antes"_. Esta feature seria
o primeiro leitor, e ela transformaria uma migração barata em uma cara.

Três consequências, e nenhuma é técnica:

1. **Custo de segurança.** Implementar o retorno-para-casa antes da ADR-0039 significa deixar o
   endereço em claro por mais tempo; implementar depois significa abrir envelope no caminho do
   roteirizador, que é código quente.
2. **O endereço de casa vira número de negócio.** A distância da última entrega até a casa do
   agregado passa a entrar no custo previsto da viagem — e a diferença entre dois agregados vira
   diferença de margem. Quem mora longe fica mais caro, e isso é decisão de produto, não de código.
3. **Ele apareceria na tela do escritório.** O marcador do fim da rota seria a casa de uma pessoa,
   num mapa que o operador vê. Hoje o produto **nunca** desenha residência de motorista.

### D6.1 — As decisões saíram, e o bloqueio mudou de lugar (2026-09-08)

O usuário decidiu, por escrito, os três pontos que estavam abertos:

1. **O retorno padrão é a casa do motorista**, com o endereço da empresa como reserva quando ele não
   tiver endereço cadastrado.
2. **A rua dele é impressa** na linha do retorno, junto da distância — a pergunta foi feita com as
   duas alternativas (distância sem a rua, ou com ela) e a resposta foi _"distância com a rua dele"_.
   Isso aceita, deliberadamente, o item 3 acima: a casa de uma pessoa passa a aparecer na tela de
   quem monta a viagem, incluindo o papel `separator`.
3. **A tensão com a ADR-0039 fica aceita**: esta feature é o primeiro leitor do endereço residencial,
   e a migração de criptografia deixa de ser barata. Quem executar a 0039 passa a ter de abrir
   envelope no caminho do roteirizador.

⚠️ **Com as decisões tomadas, o que trava deixou de ser produto e passou a ser dado — e está
medido.** A casa do motorista **não tem como virar coordenada hoje**:

- `fleet_drivers` guarda rua, número, cidade, UF e CEP — os **6 de 6** motoristas desta base têm os
  cinco preenchidos. O que falta não é cadastro.
- A parada resolve coordenada por `geocoded_addresses.address_key`, e a chave é
  `(city_code, postal_code, number)`. ⚠️ **`fleet_drivers` não guarda o código IBGE do município** —
  guarda o nome —, e `municipality_centroids` é chaveada por **código**, não por nome. Não há
  tradução nome→código dentro da API; quem a faz é a BrasilAPI, no navegador.
- Quem escreve `geocoded_addresses` é o worker, durante a roteirização. A tela da montagem **lê**
  essa tabela de forma síncrona: sem alguém geocodificar a casa antes, o retorno não tem para onde ir.
- Escalar para provedor pago em runtime para resolver isso é o que a ADR-0044 recusa, e o contrato
  `paid-provider-never-called.contract.ts` guarda.

**O que a implementação exige, nesta ordem:**

1. `end_policy` ganha o valor `driver`, com migration aditiva — e o _default_ da coluna muda, sem
   reescrever linha existente (instalação em produção não muda de comportamento ao aplicar).
2. `fleet_drivers` ganha o código IBGE do município, ou a API ganha a tradução nome+UF→código. Sem um
   dos dois, não há chave de endereço.
3. A casa do motorista entra na população de `geocoded_addresses` — o molde é
   `geocoding-backfill`, no worker.
4. `readDepot` passa a receber o motorista da viagem: a política de fim deixa de ser resolvida só
   pelo `companyId`.
5. A tela imprime a rua no retorno, e o marcador do fim vira a casa — **com a mesma marca de posição
   aproximada** enquanto a precisão for de município.

**Fica registrado e não implementado.** As decisões de produto estão fechadas; o que falta é
encanamento de dado com migration e uma rodada no worker, e isso é spec própria — não é acréscimo a
esta.

## Fora de escopo

- **Barracão por veículo ou por viagem.** A origem é da empresa; frota que sai de mais de um ponto é
  cadastro novo, com spec própria.
- **Recalcular viagem já despachada.** O roteiro congela em `dispatched` (ADR-0043).

## Contratos obrigatórios

- Com barracão geocodificado, a rota da montagem tem **uma perna a mais** que a lista de paradas, e o
  pedágio inclui as praças dessa perna.
- Sem coordenada de barracão, a rota é a de hoje **e a tela declara a ausência** — contrato reprova a
  queda silenciosa.
- O barracão não aparece na lista numerada de paradas nem na ocupação da carga.
- A política de fim é lida da mesma configuração que o solver usa — contrato reprova constante
  literal `'depot'` no caminho da montagem.
