# Feature 089 — O que o mapa ainda não conta

## Problema e resultado

A pergunta que abriu isto foi simples: **o cálculo de rota considera o sentido das ruas?** Considera.
Mas responder exigiu medir, e medir mostrou que a pergunta certa é outra: **de tudo que decide uma
viagem de caminhão, quanto já está no nosso disco e não é lido?**

A resposta é: muito. O extract que já baixamos carrega tarifa de pedágio por eixo de caminhão, a
posição de 527 radares e o limite de velocidade de 35 mil vias — e o roteirizador hoje usa três
desses sinais e ignora o resto.

Esta spec **não implementa nada**. Ela mede o que existe, separa grátis de pago, e ordena por
valor sobre custo, para a decisão ser tomada com número em vez de impressão.

## O que foi medido

Medido em 2026-09-06 com `osmium` sobre `deploy/osrm/data/ribeirao.osm.pbf`, em **487.735 vias** com
`highway`, e contra a base local (1035 endereços de NF-e reais).

| sinal                                           | quantidade                                 | o roteiro usa? |
| ----------------------------------------------- | ------------------------------------------ | -------------- |
| `oneway`                                        | 131.094                                    | ✅ sim         |
| restrição de conversão (`type=restriction`)     | 12.313                                     | ✅ sim         |
| `maxspeed`                                      | 35.520                                     | ✅ sim         |
| **praça de pedágio** (`barrier=toll_booth`)     | **166** — 163 com tarifa, **162 por eixo** | ❌ **não**     |
| vias com `toll=yes`                             | 836                                        | ❌ não         |
| **radar** (`highway=speed_camera`)              | **527**                                    | ❌ não         |
| `hgv` · `maxheight` · `maxweight` · `maxlength` | **554 — 0,11%**                            | ❌ não         |
| `maxaxleload`                                   | 0                                          | —              |
| `motor_vehicle:conditional` · `hgv:conditional` | **0**                                      | —              |
| trânsito ao vivo                                | não existe fonte pública no Brasil         | —              |

E o recorte da operação, que decide o que **não** vale implementar:

| medida                             | resultado             |
| ---------------------------------- | --------------------- |
| Endereços de NF-e na base          | 1035, **todos em SP** |
| Endereços em **São Paulo capital** | **0**                 |

## A descoberta que ordena o resto

**A tarifa do pedágio já está no disco, por eixo de caminhão, e ninguém a lê.** Uma praça vem assim:

```
barrier=toll_booth
charge=12.80BRL/motorcar;0.00BRL/motorcycle;12.80BRL/hgv/axle
operator=CCR AutoBAn
x=-47.238717  y=-22.7706642
```

`hgv/axle` é exatamente a unidade que uma transportadora paga. São **162 das 166 praças** com esse
campo — 98% de cobertura, com operador e coordenada, atualizado em julho de 2026.

Isso importa porque pedágio **não é informação de mapa, é custo de viagem**. O produto já calcula
R$/km do veículo a partir do combustível (`fleet/domain/vehicle-cost.policy.ts`) e já compara ganho
previsto contra custo previsto na tela da viagem. O pedágio é a parcela que falta nessa conta, e ela
não é pequena numa rota interestadual — hoje ela simplesmente não existe no número que o operador lê.

⚠️ E ela é **grátis e já baixada**. Não há integração a contratar, não há chave de API, não há
recorrência a pagar.

## Os cinco caminhos, do mais barato ao mais caro

### 1. Pedágio — grátis, dado pronto, e é dinheiro

O que fazer: ler as praças do extract, cruzar com a geometria que o OSRM devolve, somar a tarifa por
eixo do veículo da viagem, e mostrar ao lado do custo de combustível.

Custo: nenhuma fonte nova. O parser é do OPL/PBF que já sabemos ler.

⚠️ **A tarifa envelhece.** O `charge` do OSM é fotografia da data do extract, e reajuste de pedágio é
anual. Quem implementar precisa datar o valor na tela — "tarifa de julho/2026" — pela mesma razão da
ADR-0044 §1: número plausível sem aviso é o modo de falha. A ANTT (federais) e a ARTESP (São Paulo)
publicam tarifa oficial de graça, e são o caminho para atualizar sem depender do mapeamento.

### 2. Radar — grátis, dado pronto, valor menor

527 pontos com coordenada. Serve para avisar o motorista no PWA de campo e para explicar por que o
tempo real difere do previsto em trecho com fiscalização.

Não muda roteiro: radar não altera o caminho, altera a velocidade praticada.

### 3. Perfil de caminhão — grátis, e o teto é ruim

Trocar `car.lua` por perfil de caminhão passa a respeitar as 554 vias com `hgv`, `maxheight`,
`maxweight` e `maxlength`. Custo: refazer o extract com outro `-p`, algumas horas, **sem fonte nova**.

⚠️ **0,11% de cobertura.** Adotar isso e chamar de "rota de caminhão" promete o que o dado não
sustenta. Se entrar, entra com a tela dizendo que a restrição é melhor esforço.

O complemento honesto é **cadastro nosso**: as ruas que os motoristas já sabem que não dão caminhão,
na área de operação. Dezenas de linhas, não milhares — e cobertura real onde importa.

### 4. Trânsito — o encanamento existe, a fonte não

O OSRM aceita velocidade por segmento (`osrm-customize --segment-speed-file`), então não há
integração a inventar.

Grátis: **não existe.** O Uber Movement, que era a opção pública, foi descontinuado.

Pago: Google, Mapbox, TomTom, HERE.

**Nosso:** `trip_location_pings` já grava o rastro dos nossos caminhões — velocidade real, na região
exata onde rodamos, melhor que qualquer provedor genérico. ⚠️ Só que a **ADR-0050 §5 manda apagar**:
`purgeByTrip` roda no fechamento e no cancelamento. Hoje nós produzimos e destruímos exatamente o
dado que alimentaria isto. Aproveitá-lo exige ADR nova de privacidade — agregar e anonimizar **antes**
do purge (velocidade média por segmento e faixa de horário, sem viagem, sem motorista, sem cliente).

### 5. Rodízio — não implementar

`motor_vehicle:conditional` e `hgv:conditional` deram **zero** no extract: não há dado a ligar.

E, mais decisivo: **zero dos 1035 endereços da base está em São Paulo capital.** Rodízio é regra da
capital. Implementar isso hoje seria escrever código para um caso que a operação não tem.

Se a operação chegar à capital, o caminho é cadastro próprio de polígono mais janela de horário, com
a regra da CET — que é pública e grátis, mas é **texto, não dataset**.

## Ordem recomendada

1. **Pedágio** — grátis, pronto, e entra na conta de dinheiro que a tela já mostra.
2. **Radar** — grátis, pronto, valor menor.
3. **Cadastro próprio de restrição de caminhão** — cobertura real onde importa; o perfil de caminhão
   entra junto, como piso.
4. **Trânsito pelo nosso rastro** — depende de ADR de privacidade; é a única com decisão a tomar
   antes de código.
5. **Rodízio** — não fazer.

## Fora de escopo

Comprar dado de trânsito, mudar a ADR-0044 quanto ao provedor pago de geocodificação, e qualquer
alteração no solver de ordenação de paradas.
