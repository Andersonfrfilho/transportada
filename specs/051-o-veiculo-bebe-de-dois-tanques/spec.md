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
2. **O R$/km usa o mais barato por quilômetro na semana.** Com dois tanques,
   `min(preço₁ ÷ consumo₁, preço₂ ÷ consumo₂)`; é o que o motorista faz na bomba. O detalhamento do
   custo nomeia qual venceu, senão o número aparece sem explicação.
3. **`eletrico` entra no catálogo com unidade `kwh`.** Mesma forma dos outros: preço efetivo é
   `ajuste da empresa ?? referência pública`.
4. **A referência do kWh vem da ANEEL** (`dadosabertos.aneel.gov.br`, CKAN, recurso
   `fcf2906c-7c32-4b9b-a637-054e7a5234f4`, datastore ativo, 324.609 linhas). A chave da tarifa é a
   **distribuidora**, não a UF — a empresa escolhe a concessionária em Configurações › Combustível.
5. **A tarifa homologada é sem impostos e sem bandeira.** `VlrTUSD + VlrTE` é o preço seco; a empresa
   declara um **fator de acréscimo** (padrão 1,00 — sem inventar imposto que não medimos), e o preço
   efetivo é `(TUSD + TE) × fator`. A origem do preço passa a nomear `aneel`, e a tela diz que a
   tarifa é sem impostos: número que se apresenta como final e não é seria pior que número ausente.
6. **O select do formulário oferece modos, o banco guarda produtos.** "Flex (gasolina/etanol)",
   "Híbrido (gasolina/elétrico)", "Híbrido (diesel/elétrico)" são presets que preenchem o par;
   escolher um deles abre o segundo campo de consumo. Guardar o modo seria guardar duas verdades.

## Fora de escopo

- Bandeira tarifária e ICMS por UF (o fator declarado cobre isso enquanto ninguém os medir).
- Consumo por trecho, telemetria e abastecimento real.
