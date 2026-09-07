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

⚠️ **A coluna diz "o roteiro usa", nunca "o mapa mostra"** — são perguntas diferentes, e confundi-las
faz alguém abrir spec para um dado que já está na tela ou dar por resolvido um dado que só existe
dentro da conta. Hoje, depois da 089b:

| sinal      | o roteiro usa no cálculo | o mapa desenha                       |
| ---------- | ------------------------ | ------------------------------------ |
| `oneway`   | ✅                       | ✅ seta `sentido-da-via`, do zoom 15 |
| `maxspeed` | ✅ (é a duração do OSRM) | ❌ — **é a 094**                     |
| pedágio    | ❌ (não entra no custo)  | ✅ trecho tracejado + cabine         |
| radar      | ❌ (e não deve entrar)   | ✅ camada do `overlay.pmtiles`       |

| Spec     | O que é                                    | Estado                                         |
| -------- | ------------------------------------------ | ---------------------------------------------- |
| **089a** | o que o mapa ainda não conta (diagnóstico) | ✅ concluída — é a medição acima               |
| **089b** | o mapa mostra sentido, pedágio e radar     | ✅ concluída — 13 tasks, `evidence.md` fechado |
| **090**  | o pedágio entra na conta                   | em execução — ver `.omc/ultragoal`             |
| **093**  | restrição de caminhão: perfil + cadastro   | não escrita                                    |
| **094**  | velocidade da via no mapa                  | não escrita                                    |
| **095**  | trânsito pelo nosso rastro                 | não escrita — **bloqueada por ADR**            |

⚠️ **A numeração deste plano envelheceu.** Ele foi escrito em 2026-09-06 reservando 091, 092 e 093, e
os dois primeiros foram tomados por features de outro assunto
(`091-o-documento-do-motorista-tem-onde-ficar`, `092-pular-nao-e-passar`). O próximo número livre é
**093**, e é dele para cima que as três pendentes saem. Reservar número em documento de plano não
reserva nada no diretório.

⚠️ **Radar e sentido de via já estão na tela**, e não pela ordem que este arquivo previa. Eles saíram
dentro de `089-o-mapa-mostra-sentido-pedagio-e-radar`, que se dividiu em duas fases próprias: a 1
desenhou `sentido-da-via`, `via-com-pedagio` e `cabine-de-pedagio` a partir do que o `area.pmtiles`
**já servia**, e a 2 construiu o `overlay.pmtiles` com a camada `radar` — 72 feições nas 44 telhas que
contêm os 70 radares medidos. Então **o cano do `.pbf` já existe**, e o argumento de ordem abaixo
("090 constrói o extrator, 091 reusa") caiu: o pedágio da 090 é dinheiro na conta da viagem, não
desenho, e hoje ele não desbloqueia mais ninguém.

## Ordem, e a razão dela

A ordem era por **quem constrói o cano**, e o cano já foi construído: a fase 2 da 089b fez o
`generate-custom` sobre o mesmo `.osm.pbf`, o `overlay.pmtiles`, o serviço que o entrega e a segunda
fonte no estilo. **Toda camada nova de mapa agora é um bloco a mais no `overlay.yml`** — a 094 herda
isso inteiro. O que sobrou de ordem é por decisão pendente, não por dependência técnica.

```
089b ✅ ── overlay.pmtiles + generate-custom + segunda fonte no estilo
              │
              └─▶ 094 velocidade  (só acrescenta bloco no overlay.yml)

090 pedágio  ── independente hoje: é conta, não desenho

093 caminhão ── independente, mas pede decisão de produto sobre "melhor esforço"

095 trânsito ── bloqueada: exige ADR de privacidade antes de qualquer código
```

**1. 090 — pedágio.** Primeiro porque o dado está pronto (98% das praças com tarifa por eixo), porque
não há decisão pendente, e porque é **dinheiro num número que a tela já mostra**: quem monta a viagem
compara ganho com custo, e o custo não tem pedágio. Medido: 126 km, três praças, R$ 32,80 por eixo —
R$ 98,40 num toco.

**2. 094 — velocidade da via.** A mais barata das que restam, e a que o diagnóstico não previu.
Medido: **35.520 vias com `maxspeed`** no `.pbf`, e o roteirizador **já as usa** — a duração que o
OSRM devolve sai dessas velocidades. O que falta é a tela: o `maxspeed` **não existe no esquema
OpenMapTiles**, e isso não é palpite — a lista de campos da camada `transportation` do `area.pmtiles`
publicado é `access, bicycle, brunnel, class, foot, horse, indoor, layer, level, mtb_scale, official,
oneway, ramp, service, subclass, surface, toll`, conferida na Fase 0 da 089b. Então ele segue o
**mesmo caminho do radar**: bloco no `overlay.yml`, camada no estilo, degradando sem o overlay.

⚠️ Como o radar, **velocidade não muda roteiro nenhum** — ela já está dentro do tempo previsto. Ela
explica o tempo: quem confere um roteiro de 126 km em duas horas e meia não tem como ver que metade
dele é via de 40 km/h.

⚠️ **Cobertura é 7,3% das vias com `highway`** (35.520 de 487.735), e a ausência **não afirma
velocidade nenhuma** — é a mesma armadilha do `oneway` da 089b, onde o atributo só assume `1` e a
ausência não diz "mão dupla". Rótulo de velocidade em via sem `maxspeed` é número inventado na tela
de quem decide despachar; a via sem o atributo fica sem rótulo, e nenhuma superfície calcula média,
percentual ou "velocidade do trajeto" a partir disso.

**3. 093 — restrição de caminhão.** Independente das duas anteriores, e é a que tem **decisão de
produto antes de código**: o perfil de caminhão custa só refazer o extract, mas cobre **0,11%** das
vias. Adotá-lo e chamar de "rota de caminhão" promete o que o dado não sustenta. A spec precisa
decidir, por escrito, que ele entra como **piso com aviso de melhor esforço**, e que a cobertura real
vem de cadastro nosso — as ruas que os motoristas já sabem que não dão caminhão. Cadastro pede tela,
que é o custo de verdade desta.

**4. 095 — trânsito.** Última, e **bloqueada**: `trip_location_pings` seria a melhor fonte possível —
nossa, na região certa, com o veículo certo —, mas a **ADR-0050 §5 manda apagar** o rastro no
fechamento da viagem (`purgeByTrip`). Hoje produzimos e destruímos o dado. Destravar exige ADR nova
decidindo agregar e anonimizar **antes** do purge: velocidade média por segmento e faixa de horário,
sem viagem, sem motorista, sem cliente. Enquanto a ADR não existir, não há task a executar.

**Não fazer — rodízio.** `motor_vehicle:conditional` e `hgv:conditional` deram **zero** no extract, e
**zero dos 1035 endereços da base está em São Paulo capital**. Rodízio é regra da capital: implementar
seria escrever código para um caso que a operação não tem. Fica registrado aqui para não ser
redescoberto como lacuna.

## Portões entre as fases

| de → para   | o que precisa estar verdadeiro antes                                                |
| ----------- | ----------------------------------------------------------------------------------- |
| 094 começar | nenhum — o `overlay.pmtiles` e o `generate-custom` da 089b já estão em staging      |
| 090 começar | nenhum — o `annotations=nodes` é da própria 090, e ela não desbloqueia mais ninguém |
| 093 começar | decisão escrita sobre "melhor esforço" na tela                                      |
| 095 começar | **ADR de privacidade aprovada** alterando o purge da ADR-0050                       |

## O que o conjunto entrega

Já entregue (089b): **o sentido da via**, **o trecho com pedágio e a cabine**, e **onde há radar**.

Ao fim das três que restam, quem monta a viagem vê também, antes de despachar: **quanto a rota custa
de pedágio** com as praças nomeadas e a data da tarifa, **a velocidade da via** onde o dado existe, e
**quais trechos o veículo não deveria pegar** — com a honestidade, em cada um, de dizer quando o
número é estimado e quando a cobertura é parcial.
