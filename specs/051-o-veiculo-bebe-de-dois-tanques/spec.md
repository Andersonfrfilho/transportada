# 051 — O veículo bebe de dois tanques

## Problema

O cadastro de veículo pergunta **um** combustível e **um** consumo médio. A frota real não é assim:
o flex roda com gasolina _e_ etanol, o híbrido com combustível _e_ energia, e o elétrico não tem
combustível nenhum — ele tem kWh, que a ANP não publica. Hoje o operador escolhe o produto que
menos mente e digita um consumo só; o R$/km derivado sai do produto errado metade das semanas.

## Decisões

1. **Flex e híbrido são um par de produtos, não um produto novo.** `fleet_vehicles` ganha
   `secondary_fuel_type` e `secondary_average_consumption`. O catálogo continua sendo o dos produtos
   com preço publicado — inventar um produto `flex` obrigaria a inventar um preço de flex.
2. **O R$/km com dois tanques é a média das duas parcelas.**
   `((preço₁ ÷ consumo₁) + (preço₂ ÷ consumo₂)) ÷ 2`, e o detalhamento nomeia as duas, senão o
   número aparece sem explicação. Isso é uma participação de 50/50 por construção — não há campo de
   percentual, e não há de propósito: `min()` seria o que o motorista faz na bomba do flex, mas
   mentiria no híbrido, onde a divisão é física e ninguém escolhe. A média serve aos dois casos sem
   pedir um número que o operador não mede. ⚠️ Ela **superestima** a fonte pouco usada — no híbrido
   que roda 20% em energia, os 20% entram valendo 50%. Quando alguém medir a participação real, o
   campo entra aqui: `deriveCostPerKilometer` já recebe as duas parcelas separadas, e passar de
   `÷ 2` para peso declarado é mudança de uma linha no domínio.
3. **`eletrico` entra no catálogo com unidade `kwh`.** Mesma forma dos outros: preço efetivo é
   `ajuste da empresa ?? referência pública`.
4. **A referência do kWh vem da ANEEL** (`dadosabertos.aneel.gov.br`, CKAN, recurso
   `fcf2906c-7c32-4b9b-a637-054e7a5234f4`, datastore ativo, 324.609 linhas). A chave da tarifa é a
   **distribuidora**, não a UF — a empresa escolhe a concessionária em Configurações › Combustível.
5. **A tarifa homologada é sem impostos e sem bandeira.** `VlrTUSD + VlrTE` é o preço seco; a empresa
   declara um **fator de acréscimo** (padrão 1,00 — sem inventar imposto que não medimos), e o preço
   efetivo é `(TUSD + TE) × fator`. A origem do preço passa a nomear `aneel`, e a tela diz que a
   tarifa é sem impostos: número que se apresenta como final e não é seria pior que número ausente.
6. **O formulário pergunta dois produtos, e o modo é lido do par.** Combustível principal (com o
   consumo dele) e combustível secundário opcional (com o consumo dele) — dois campos do mesmo
   catálogo, sem select de modo. "Flex", "Híbrido" e "Elétrico" são **rótulo derivado**, calculado do
   par pela mesma via em que `tipoRodado` e classe de frete saem de `vehicle_type`: gasolina+etanol é
   Flex, qualquer combustível + `eletrico` é Híbrido, `eletrico` sozinho é Elétrico, e o resto é o
   nome do próprio produto. Guardar o modo seria guardar duas verdades; oferecer o modo no select
   seria pedir ao operador que escolhesse entre "Flex" e "Gasolina + Etanol", que são a mesma coisa.

## Fora de escopo

- Bandeira tarifária e ICMS por UF (o fator declarado cobre isso enquanto ninguém os medir).
- Consumo por trecho, telemetria e abastecimento real.
