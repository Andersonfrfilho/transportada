# Feature 099 — A carga encosta na porta

> Registrada em 2026-09-08, a partir de defeito relatado pelo usuário olhando a planta da carga em
> `/trips`. ⚠️ **Registrada depois da implementação**, ao contrário do processo: o defeito foi
> corrigido no mesmo turno em que foi relatado, e esta spec documenta o que já está na árvore.

## Problema e resultado

O usuário abriu a montagem de uma viagem de três paradas e viu a carga **espalhada pelo baú
inteiro**, numa fileira rasteira de uma camada — quando toda ela cabia junto da porta e sairia sem
ninguém remexer em nada.

Medido com a carga da tela (30 caixas, três paradas, baú de 7,4 m):

|                            |     antes |     depois |
| -------------------------- | --------: | ---------: |
| comprimento ocupado        |    7,40 m | **0,90 m** |
| camadas                    |         1 |          2 |
| distância da carga à porta | até 6,5 m |          0 |

**A causa não era o empacotador, era o denominador.** A fatia de cada parada era proporcional ao
**baú inteiro** (`bed.lengthM * share`), então as fatias somavam sempre os 7,4 m por menor que fosse
a carga. E a varredura em fileiras só quebra para a fileira ao lado quando o `x` estoura o fim da
fatia: com fatia de 2,5 m e caixa de 30 cm, ela nunca quebrava. A fileira única atravessando o baú
era consequência aritmética disso, não um erro de arrumação.

## Decisões

### D1 — A proporção vira teto, e a fatia mede o que a carga pede

Cada parada mantém a garantia de espaço que tinha (a soma dos tetos é o baú inteiro), mas usa o
comprimento que a carga dela pede: piso volumétrico — volume ÷ seção transversal — crescendo em
passos de 1,35× até a fatia parar de transbordar, limitado ao teto.

⚠️ **Crescer é mais barato que errar para menos.** Fatia curta demais transforma carga que cabe em
`splitCargo`, que é justamente o aviso que manda o operador desconfiar do desenho.

⚠️ O piso volumétrico sozinho **não basta**: nenhuma arrumação real atinge 100% da seção. É por isso
que existe o crescimento, e não um fator de eficiência chutado.

### D2 — O vão sobra na testeira, e a carga encosta na porta

O bloco é deslocado inteiro para terminar na porta. O que sobra vira vão entre a testeira e a carga,
nunca vão **entre** paradas — a ordem de entrega continua sendo a da fatia.

Encostar na porta é o que a descarga pede: quem abre na primeira entrega alcança a carga sem subir no
baú.

### D3 — Acima de metade do teto de massa, a física vence a descarga

`payloadRatio > 0,5` move o bloco para o meio do baú, com o vão repartido nas duas pontas. Massa
pendurada na traseira alivia o eixo dianteiro e sobrecarrega o traseiro — e isso se afirma **sem**
saber onde os eixos estão.

⚠️ **Degrau, não rampa.** "Acima da metade a carga vai para o meio" se explica e se confere; uma
posição que desliza a cada caixa acrescentada não se confere contra nada. A ordem entre paradas não
muda em nenhum dos dois lados do degrau.

⚠️ **Teto desconhecido não equilibra.** `payloadRatio` nulo é ausência de denominador, e mover carga
por palpite seria a invenção que a ausência do teto deveria impedir. Mesma regra do `null` da
ocupação e do peso: nunca zero, nunca 100%.

### D4 — Isto não é conferência de eixo, e o vocabulário não pode sugerir que é

`axleNotChecked` **continua** no vocabulário de `PlacementReason`. O motivo novo é `weightBalanced`,
e ele diz outra coisa: que o arranjo foi equilibrado ao longo do comprimento, não que alguém conferiu
carga por eixo. Trocar um pelo outro faria a tela prometer uma conferência que não houve.

⚠️ O motivo é carimbado no arranjo inteiro, depois da varredura — ele é da viagem, não da caixa.
Quem o vê na caixa entende por que ela não está colada na porta como nas outras viagens.

A conferência de verdade é a spec 098, e ela depende de geometria que a frota ainda não cadastrou.

### D5 — Por onde o veículo abre decide se existe porta a que encostar

Encostar na porta serve para **alcançar** a carga. Num sider, que abre o comprimento inteiro, não há
"a porta": toda a carga já está à mão, e o que sobra para decidir posição é o peso.

`LOADING_ACCESS_KINDS` já dizia isso na própria definição de `open` — _"a ordem quase não importa; o
que passa a valer é o peso"_ —, e o empacotador não lia o campo. Hoje lê:

| acesso          | posição                                     |
| --------------- | ------------------------------------------- |
| `rear`          | encosta na porta; equilibra acima do degrau |
| `rear_and_side` | idem — a lateral ajuda, a ordem ainda vale  |
| `open`          | **equilibra sempre**, sem olhar o peso      |

⚠️ **Ausente é `rear`, o mais restritivo**, a mesma omissão segura que `resolveCargoLayout` já fazia:
supor lateral diria que dá para alcançar o meio de um baú que só abre atrás.

⚠️ **A fatia por parada continua valendo em todos os três.** A 095 a fez proibição, não preferência,
e afrouxá-la para `open` é decisão de outra spec — aqui muda só a âncora do bloco.

### D6 — Gravidade: a caixa pousa no que está embaixo dela, e isso é absoluto

O `z` de cada caixa vinha de `layerBottomM`, o topo da **camada inteira** — o máximo de todas as
caixas daquele índice. Uma caixa baixa sobre outra baixa era erguida até o topo da caixa **alta**
vizinha e ficava no ar. Medido: **2 de 12** caixas flutuando 0,6 m num baú de alturas misturadas, num
desenho que promete escala.

Hoje a fatia mantém um **relevo** — a altura do topo em cada célula do piso —, e o `z` é o **maior**
da pegada da caixa. Regra absoluta, sem parâmetro: não existe "quase apoiada".

### D7 — Sem balanço: a caixa só senta onde o apoio é plano sob a pegada inteira

O balanço danifica o que está dentro da caixa — a parte em falso flexiona a base e o produto apoiado
nela sofre. A regra é **nível**, não fração de base apoiada.

⚠️ **A alternativa era um percentual, e todo percentual aqui é inventado.** Meia base, dois terços —
ninguém mediu a distribuição de massa dentro da caixa, e é ela que decide se a caixa tomba. Exigir o
piso plano sob a pegada inteira dispensa o parâmetro e resolve **as duas coisas de uma vez**: não
sobra balanço, e a caixa encosta na quina de quem já está lá em vez de deixar vão.

⚠️ **Recusar uma posição tem de significar tentar a próxima.** A primeira versão conferia o apoio uma
vez e, recusando, mandava a caixa para `splitCargo` — e como o cursor não avançava, **toda** caixa
seguinte recusava no mesmo ponto: as fatias cresciam até o teto e a carga voltava a se espalhar pelo
baú. Treze contratos caíram de uma vez. Hoje a procura é laço: salta para a quina que quebrou o
nível, quebra para a fileira ao lado, sobe de camada.

⚠️ **E o laço precisa saber desistir.** Sem saída, o cursor subia de camada indefinidamente — o
limite de pilha é infinito para caixa empilhável — e cada caixa pagava 64 tentativas antes de virar
sobra: medido, 58 buscas por caixa e 10,8 milhões de leituras de perfil. Uma camada varrida inteira
sem lugar encerra a busca.

### D8 — O relevo arredonda as duas pontas, e sem isso a regra piora o defeito

`0.6 / 0.05` dá `11.999999999999998` em binário. Com `floor` na base e `ceil` no topo, duas caixas
encostadas dividem a célula da fronteira: cada uma pousa sobre a anterior e a fileira sobe em
**escada** até o teto do baú — medido, quatro caixas numa fileira de piso, 0,8 → 1,6 → 1,8 → 2,0 m.

As duas pontas **arredondam**. A fronteira comum cai na mesma célula para as duas caixas qualquer que
seja o tamanho, e o desenho não ganha vão de meia célula entre caixas encostadas.

⚠️ **Medida fora da grade é o caso que quase escapou.** Todo caso de teste media em múltiplos de
5 cm, e o arranjo saía certo por alinhamento. Com 330 mm a fronteira cai no meio de uma célula — é
assim que a escada nasce, e é por isso que existe contrato com essa medida.

## Fora de escopo

- **Empacotamento ótimo.** Continua sendo heurística de fileiras: 3D bin packing é NP-difícil e a
  diferença não paga o tempo de resposta de uma tela de montagem.
- **Peso por eixo.** Spec 098.
- **Empacotamento ótimo.** Continua heurística: nível e fileira, não busca em árvore.

## Contratos obrigatórios

- Carga leve termina **na porta** — contrato afirma o `x` final, não "perto da porta".
- Carga pesada centraliza **com folga nas duas pontas**: afirmar só "não encosta na porta" passaria
  com a carga colada na testeira, que é o mesmo defeito virado ao contrário.
- Sem teto de massa a carga segue encostada na porta.
- A ordem entre paradas sobrevive ao equilíbrio — a fatia vale nos dois lados do degrau.
- Toda caixa de um arranjo equilibrado carrega `weightBalanced`.
- **Nenhuma caixa no ar**: toda caixa está no piso ou tem, debaixo dela, uma caixa cujo topo é
  exatamente o seu `z`. Afirmado como propriedade sobre o arranjo inteiro, nunca como coordenada
  conhecida — coordenada mente na primeira mudança de heurística.
- A mesma propriedade vale para **medida fora da grade do relevo** (330 mm), que é onde o
  alinhamento por acaso deixa de salvar.
- O empacotador continua dentro do teto de 50 ms da spec 094 com 3600 caixas.
