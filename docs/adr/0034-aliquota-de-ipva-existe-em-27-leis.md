# ADR 0034 — A alíquota de IPVA existe, mas em 27 leis: o campo continua digitado

- Status: aceito
- Data: 2026-08-14
- Decisores: mantenedor do projeto e revisão Opus

## Contexto

O cadastro de veículo tem `annualVehicleTaxAmount` — "IPVA anual (R$)" — digitado pelo operador, e ele
entra no custo fixo mensal junto com a prestação e o seguro. A pergunta que abriu esta ADR foi se dá
para derivá-lo, já que a FIPE o produto já consulta para marca e modelo.

A conta em si é trivial: **valor venal × alíquota da UF**. O valor venal a maioria dos estados tira da
própria FIPE, e a FIPE já está no produto. O que falta é a alíquota.

### A tabela existe?

Existe — e é justamente esse o problema: não existe _uma_, existem **27**. O IPVA é imposto estadual,
não há API federal, não há tabela consolidada da CONFAZ, e os portais de consulta de cada SEFAZ são
protegidos por captcha (o mesmo achado que fechou a [ADR-0032](0032-consulta-por-placa-sem-fonte-publica.md)).
O que há é a lei de cada estado, pública e de graça, em texto.

Verificado contra a legislação, no recorte que interessa a uma transportadora:

| UF  | Carga                                                                                                                                          | Demais                                                                              | Instrumento                                                   | Vigência                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| SP  | **1,5%** caminhão                                                                                                                              | 4% geral; 2% ônibus, micro-ônibus, caminhonete cabine simples, motocicleta, máquina | Lei 13.296/2008, art. 9º, redação da Lei 17.473 de 16/12/2021 | efeitos desde **01/01/2022**, sem prazo final                            |
| MG  | **1%** caminhão, caminhão-trator e ônibus; **3%** caminhonete de carga, picape e furgão                                                        | 4%                                                                                  | Lei 14.937/2003, art. 10                                      | em vigor, sem prazo final                                                |
| PR  | **1%** caminhão, ônibus, utilitário de carga e movidos a GNV                                                                                   | 1,9% a partir do exercício 2026                                                     | Lei 14.260/2003, alterada em 2025                             | a redução geral vale do exercício **2026**; o 1% da carga não foi tocado |
| SC  | **1%** transporte de carga ou coletivo                                                                                                         | 2%                                                                                  | Lei 7.543/1988, art. 5º                                       | em vigor, sem prazo final                                                |
| RS  | **não verificado** — a Lei 8.115/1985 está publicada como compilação de remissões e o artigo de alíquotas não saiu no texto que consegui abrir | —                                                                                   | Lei 8.115/1985                                                | —                                                                        |

As 22 UFs restantes não foram verificadas contra fonte primária. O que circula sobre elas em imprensa
e em sites de consulta de placa **não entra aqui**: alíquota é regra legal, e este produto não inventa
regra legal.

### A validade — que são duas, e confundi-las é o defeito

1. **A alíquota não tem prazo de validade.** Ela vale até outra lei estadual mudá-la. A de São Paulo
   está de pé desde 01/01/2022. Não existe "tabela de alíquotas do IPVA 2026" que expire em 31/12 —
   existe lei em vigor.
2. **Anual é o valor venal.** Cada SEFAZ publica a tabela de valores-base por exercício, em geral no
   segundo semestre do ano anterior. Essa, sim, tem exercício estampado.

A consequência prática é o motivo de esta ADR existir. Uma tabela de alíquotas chumbada no código
**não vence com barulho, ela fica errada em silêncio**. Quando um estado altera a lei — o que acontece
em novembro e dezembro, para respeitar as anterioridades anual e nonagesimal —, a nossa tabela continua
devolvendo o número velho e a tela continua mostrando um valor errado com toda a confiança do mundo. É
o inverso de um certificado vencido: nada falha, o número só está errado.

E a classificação é o vocabulário de cada estado, não o nosso: São Paulo diz "veículos de carga, tipo
caminhão"; Minas separa caminhonete de carga, picape e furgão numa faixa própria de 3%; o Paraná dá
faixa ao GNV. Mapear o tipo de veículo do nosso cadastro para a classe legal de cada UF são 27
mapeamentos diferentes, e errar um deles muda dinheiro.

## Decisão

### 1. O IPVA continua digitado

`annualVehicleTaxAmount` segue como campo do cadastro, conferido no documento do veículo. Um valor
digitado que o operador leu do boleto é mais confiável do que um derivado de tabela que ninguém garante
estar atualizada.

### 2. A tabela de alíquotas não entra no código como constante

Se uma spec futura automatizar isto, a alíquota entra como **dado configurável por empresa**, com a UF,
o percentual, o instrumento legal e a data da última conferência visíveis na tela. Quem opera tem de
enxergar a fonte e saber quando ela foi verificada pela última vez — é o único jeito de uma regra legal
chumbada em software não virar erro silencioso.

### 3. O que foi verificado fica registrado com data

A tabela acima é o levantamento de 14/08/2026. Ela não é fonte da verdade: é a prova de que o
levantamento foi feito, e o ponto de partida de quem retomar o assunto.

## Consequências

- O campo de IPVA continua sendo trabalho manual, uma vez por ano por veículo. É o custo de não errar.
- O custo por quilômetro da spec 038 não depende disto: ele deriva do preço do combustível, e o IPVA
  entra pelo custo fixo mensal que já existe.
- Se a decisão for automatizar, o trabalho não é técnico — é levantar 27 leis e mantê-las. Isso é uma
  spec própria, com fonte citada por UF e um processo de revisão anual, não um `constant.ts`.
- RS ficou verificado pela metade. Quem precisar dele abre a Lei 8.115/1985 no sistema LEGIS da
  Assembleia, não em resumo de terceiro.
