# ADR-0061 — O lote de medição compra precisão uma vez, e o que ele mede fica

- **Data:** 2026-09-04
- **Estado:** aceita
- **Contexto:** complementa o **adendo de 2026-09-01 da ADR-0044**, que criou a escada de
  geocodificação e recusou a escalada automática. Habilita o P1 da **spec 084** e o relatório que a
  **ADR-0057** pressupõe. Não revoga nada.

## Contexto

O adendo da ADR-0044 desenhou a escada e disse a consequência por extenso: _"o provedor pago passa a
quase nunca ser chamado"_. Isso foi a escolha certa para o **roteiro**, que é onde ela foi tomada —
uma sugestão de rota não pode abrir a carteira sozinha no meio de um cálculo.

Mas a escada tem um vão. O degrau 2 só é alcançado _"quando um humano marca a parada como errada"_, e
um humano só marca depois de alguém tropeçar. Medido na base em 2026-09-04, sobre 300 endereços:

| precisão                        | quantos | o que já sabemos                                             |
| ------------------------------- | ------- | ------------------------------------------------------------ |
| `city` (centroide do município) | 149     | que estão ruins — de graça, sem consultar nada               |
| CEP                             | 147     | **nada.** Parecem bons, e não há como saber se estão errados |
| `rooftop`                       | 4       | que estão bons                                               |

Os 149 já se denunciam pela própria precisão e já entram no relatório sem custo nenhum. **O vão são
os 147**: eles só se revelam quando um motorista chega e não é ali — um endereço por vez, uma viagem
por vez, indefinidamente. Não existe sinal grátis que os separe.

## Decisão

Fica admitido um **terceiro gatilho** para o degrau 2, ao lado da marca humana por parada:

> **Lote de medição** — uma execução única, disparada por decisão explícita de uma pessoa, com
> **escopo e custo declarados antes de começar**, sobre endereços que já existem na base.

Ele não é um degrau novo da escada: é o mesmo degrau 2, com um gatilho a mais. O resultado é gravado
como qualquer outro — `geocoded_addresses` é permanente desde a **ADR-0044 §3**, e o comentário do
schema diz o que isso significa: _"endereço já visto nunca é geocodificado de novo"_.

**Então o lote é pagar uma vez por endereço, e nunca mais por ele.** Os 300 de hoje custam ~US$ 1,50
e ficam medidos. O que continua custando é endereço **novo** — cliente novo, loja nova, número novo —,
e esse é o gasto marginal que a escada já governa.

⚠️ **A comparação é subproduto, não motivo.** O lote existe para gravar coordenada boa. Que ele
também produza a divergência de texto que o relatório publica é ganho de carona, e não justificaria a
chamada sozinho.

## O que esta ADR não muda

**A escalada automática continua recusada, e o teste que a guarda continua valendo.** O adendo nomeou
com precisão o que rejeitou: escalada _"por colisão"_ — gatilho em runtime, dentro do cálculo de
roteiro, que _"gasta sem ninguém decidir"_. Um lote com escopo e custo sabidos de antemão não é isso,
e é essa a distinção inteira desta ADR.

Fica dito por extenso para não virar brecha:

- `apps/worker-transportada/test/routing/paid-provider-never-called.contract.ts` **permanece**, sem
  alteração. O caminho de sugestão de roteiro segue proibido de chamar provedor pago.
- Lote **não** é sinônimo de volume. O que o autoriza é a decisão explícita com escopo declarado; um
  gatilho que dispara sozinho continua recusado ainda que processe um endereço por vez.
- A escada segue com três degraus. Nada aqui cria degrau 4 nem promove o provedor pago a padrão.

⚠️ **A distinção entre "lote decidido" e "gatilho automático" é a única coisa que separa esta ADR de
uma revogação disfarçada do adendo.** Quem for acrescentar um gatilho novo e chamá-lo de lote precisa
responder antes: _uma pessoa decidiu esta execução, sabendo quantos endereços e quanto custa?_ Se a
resposta for não, é a escalada que a 0044 recusou.

## Consequências

- Os 147 de precisão de CEP passam a ser medidos hoje, em vez de um por um ao longo de meses.
- Os 149 de precisão `city` ganham a separação que nenhum sinal grátis dá: _"o texto da nota não
  existe"_ contra _"o texto está certo, o provedor é que não tem o dado"_. É essa distinção que
  transforma o relatório em pedido acionável ao contratante, em vez de uma lista de suspeitas.
- A coordenada boa entra em `geocoded_addresses` e o roteiro melhora sem mais nenhuma chamada.
- O custo é conhecido e fechado: 300 consultas. Execuções futuras cobrem só o que entrou depois.
- ⚠️ O gasto passa a existir sem que ninguém tenha marcado parada errada. É exatamente o que o adendo
  quis evitar em runtime, e é aceito aqui **porque a decisão é de uma pessoa, antes, com o número na
  frente** — não do sistema, depois, dentro de um cálculo.

## Alternativas recusadas

**Ficar dentro do adendo e montar o relatório só com sinal grátis.** É honesto e não custa nada, e
cobre bem os 149. Recusada porque não toca nos 147: eles continuariam sendo descobertos por tropeço,
que é a informação que o produto está tentando parar de comprar com viagem perdida.

**Reverter o adendo e liberar o provedor pago por colisão.** Recusada de novo, pelo mesmo argumento
que o adendo já registrou — e agora com o reforço de que o vão que motivava a reversão se fecha com
um lote decidido, sem abrir a torneira em runtime.

**Rodar o lote só nos 147.** Tentadora, e foi o meu primeiro recorte. Recusada porque os 149 também
guardam coordenada permanente ao serem consultados: deixá-los de fora economiza metade do custo de
uma execução que já é barata, e cobra o outro metade em consultas avulsas depois — pelo mesmo
endereço, mais tarde, mais caro em atenção humana.
