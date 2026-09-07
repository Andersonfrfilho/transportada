# Objetivo — o mapa passa a contar o que já sabe

> Criado em 2026-09-06. Este arquivo é o plano de execução do conjunto; cada spec continua com o
> próprio `tasks.md`. Aqui fica **a ordem e o porquê dela**.

## Regra de conclusão

Vale para toda spec deste plano, sem exceção:

- **Nada é dado por concluído sem verificação executada.** "Compila" não é "funciona".
- Onde o dado vem do extract OSM, a verificação **conta linhas contra o `.pbf` real**, não contra
  fixture. Fixture não prova que o extrator lê o que está no disco.
- Número que a tela mostra e que pode estar estimado **carrega a marca junto**, e o contrato reprova
  o componente que imprimir o valor sem ela. É a ADR-0044 §1, e nesta família ela decide se alguém
  aceita ou recusa carga.
- A spec só recebe `evidence.md` depois de a verificação existir, e o que ficou de fora entra escrito
  nele.
- Modelo por fase conforme `model-economy.md`; fase 🧠 pede `opus` e a sessão para antes de começar.

## Estado inicial (medido, não estimado)

Medido em 2026-09-06 com `osmium` sobre `deploy/osrm/data/ribeirao.osm.pbf` — **487.735 vias** com
`highway` — e contra a base local (1035 endereços de NF-e, 12 veículos).

| sinal                                      | quantidade                             | o roteiro usa? | fonte  |
| ------------------------------------------ | -------------------------------------- | -------------- | ------ |
| `oneway`                                   | 131.094                                | ✅ sim         | grátis |
| restrição de conversão                     | 12.313                                 | ✅ sim         | grátis |
| `maxspeed`                                 | 35.520                                 | ✅ sim         | grátis |
| **praça de pedágio**                       | 166 — 163 com tarifa, **162 por eixo** | ❌ não         | grátis |
| **radar** (`highway=speed_camera`)         | **527**                                | ❌ não         | grátis |
| restrição de caminhão (4 chaves)           | **554 — 0,11%**                        | ❌ não         | grátis |
| `maxaxleload`                              | 0                                      | —              | —      |
| rodízio (`*:conditional`)                  | **0**                                  | —              | —      |
| trânsito ao vivo                           | sem fonte pública                      | —              | pago   |
| endereços da base em **São Paulo capital** | **0 de 1035**                          | —              | —      |
| veículos com `axle_count` preenchido       | **4 de 12**                            | —              | —      |

| Spec    | O que é                                    | Estado                              |
| ------- | ------------------------------------------ | ----------------------------------- |
| **089** | o que o mapa ainda não conta (diagnóstico) | ✅ concluída — é a medição acima    |
| **090** | o pedágio entra na conta                   | `spec.md` + `tasks.md`, 10 tasks    |
| **091** | radar no trajeto                           | não escrita                         |
| **092** | restrição de caminhão: perfil + cadastro   | não escrita                         |
| **093** | trânsito pelo nosso rastro                 | não escrita — **bloqueada por ADR** |

## Ordem, e a razão dela

A ordem **não** é por valor isolado: é por **quem constrói o cano**. Radar e pedágio saem da mesma
fonte e do mesmo casamento por nó; fazer radar primeiro construiria o extrator e a anotação de nós
duas vezes, e a segunda pessoa herdaria a decisão da primeira sem tê-la tomado.

```
090 pedágio  ──constrói o extrator do .pbf e o annotations=nodes──▶  091 radar
                                                                     (reusa os dois)

092 caminhão ── independente, mas pede decisão de produto sobre "melhor esforço"

093 trânsito ── bloqueada: exige ADR de privacidade antes de qualquer código
```

**1. 090 — pedágio.** Primeiro porque o dado está pronto (98% das praças com tarifa por eixo), porque
não há decisão pendente, e porque é **dinheiro num número que a tela já mostra**: quem monta a viagem
compara ganho com custo, e o custo não tem pedágio. Medido: 126 km, três praças, R$ 32,80 por eixo —
R$ 98,40 num toco.

**2. 091 — radar.** Segundo porque fica barato depois da 090: mesma origem (`.pbf`), mesmo extrator,
mesmo casamento por id de nó. São 527 pontos. Valor menor — radar não muda roteiro, explica por que o
tempo real difere do previsto — e por isso não justifica pagar o cano sozinho.

**3. 092 — restrição de caminhão.** Independente das duas anteriores, e é a que tem **decisão de
produto antes de código**: o perfil de caminhão custa só refazer o extract, mas cobre **0,11%** das
vias. Adotá-lo e chamar de "rota de caminhão" promete o que o dado não sustenta. A spec precisa
decidir, por escrito, que ele entra como **piso com aviso de melhor esforço**, e que a cobertura real
vem de cadastro nosso — as ruas que os motoristas já sabem que não dão caminhão. Cadastro pede tela,
que é o custo de verdade desta.

**4. 093 — trânsito.** Última, e **bloqueada**: `trip_location_pings` seria a melhor fonte possível —
nossa, na região certa, com o veículo certo —, mas a **ADR-0050 §5 manda apagar** o rastro no
fechamento da viagem (`purgeByTrip`). Hoje produzimos e destruímos o dado. Destravar exige ADR nova
decidindo agregar e anonimizar **antes** do purge: velocidade média por segmento e faixa de horário,
sem viagem, sem motorista, sem cliente. Enquanto a ADR não existir, não há task a executar.

**Não fazer — rodízio.** `motor_vehicle:conditional` e `hgv:conditional` deram **zero** no extract, e
**zero dos 1035 endereços da base está em São Paulo capital**. Rodízio é regra da capital: implementar
seria escrever código para um caso que a operação não tem. Fica registrado aqui para não ser
redescoberto como lacuna.

## Portões entre as fases

| de → para   | o que precisa estar verdadeiro antes                                         |
| ----------- | ---------------------------------------------------------------------------- |
| 090 → 091   | extrator do `.pbf` com contagem conferida, e `annotations=nodes` em produção |
| 091 → 092   | nenhum — 092 é independente                                                  |
| 092 começar | decisão escrita sobre "melhor esforço" na tela                               |
| 093 começar | **ADR de privacidade aprovada** alterando o purge da ADR-0050                |

## O que o conjunto entrega

Ao fim das três executáveis, quem monta a viagem vê, antes de despachar: **quanto a rota custa de
pedágio** com as praças nomeadas e a data da tarifa, **onde há radar** no trajeto, e **quais trechos
o veículo não deveria pegar** — com a honestidade, em cada um, de dizer quando o número é estimado e
quando a cobertura é parcial.
