# Feature 084 — A agenda de endereços que melhora com o uso

## Problema e resultado

**Metade dos endereços desta base não sabe onde fica a porta.** Medido em 2026-09-04, na instalação
local: 300 endereços geocodificados, **149 com precisão `city`** — o ponto é o centroide do
município —, 147 com `postal_code` e 4 com `rooftop`.

Os 149 não são acidente nem falha de código: **todos os 149 têm CEP terminado em `000`**, cidade de
CEP único, onde não existe informação de logradouro para extrair. O degrau 1 (BrasilAPI `/cep/v2`)
não tem como resolvê-los, e o gatilho no gateway já é o certo — `street` vazio na resposta, não o
sufixo do CEP (`14801-000` é a Avenida Presidente Vargas de Araraquara, e tem logradouro).

O que existe hoje é uma escada de dois degraus: CEP, e centroide de município quando o CEP não
responde. **Não existe busca por endereço escrito em lugar nenhum** — `GeocodeAddressRequest` já
carrega `street`, `number`, `district`, `city`, `state` e `cityCode`, e nenhuma implementação os usa.

O resultado desta feature é uma **agenda de endereços privada, que melhora com o uso**: o contratante
corrige o que sabe, o motorista confirma o que viu, e o provedor pago entra só no que ninguém sabe —
uma vez por endereço, reaproveitado para sempre.

### Por que o texto do emitente não resolve sozinho

O logradouro da NF-e é texto livre digitado por quem emitiu. Medido nesta base:

| o que a nota diz                                 | o que existe no OSM                 |
| ------------------------------------------------ | ----------------------------------- |
| `R AMERICA DE ARAUJO PERES`                      | `Rua Américo de Araújo Pires`       |
| `R DR. MATTA` / `RUA DR MATA` / `R DOUTOR MATTA` | a mesma rua de Cajuru, três grafias |
| `AV DR GUMERCINDO VELLUDO SLJ1`                  | "sala/loja 1" colado no logradouro  |
| `nº 1.520`                                       | número com ponto de milhar          |

⚠️ **Casar nome de rua por semelhança foi testado e reprovado.** Contra as telhas do nosso extract:
14% de acerto, **com falsos positivos que mandavam `RUA 02` para `Rua 12` e `RUA 7 DE SETEMBRO` para
`Rua 5`**. Rua numerada difere por um caractere e é outro lugar. Num roteiro isso é erro com
aparência de acerto — a pior classe, e o motivo de esta spec não propor correspondência automática
por nome.

## Fora do escopo

- **Redecidir o que a ADR-0057 já decidiu** — catálogo da ocorrência, trava de permissão, raio de
  5 km, o app não corrigir, e o painel de ocorrências. Esta spec **consome** aquelas decisões.
- **Pino no portal do contratante.** O contratante corrige **texto**, que é o que ele sabe — a rua e
  o CEP do cadastro dele.
  ⚠️ **A justificativa anterior estava factualmente errada.** Eu havia escrito que o portal "não tem
  biblioteca de mapa"; a **ADR-0050 §5** decidiu o contrário: _"o portal usa a mesma malha [do IBGE]
  com o ponto por cima"_, e _"nenhuma coordenada de cliente sai daqui"_. O pino fica fora por ser
  **o trabalho errado para ele**, não por falta de mapa.
- **Aniversário de cidade e feriado municipal.** Não há fonte confiável para os 5.570 municípios, e
  inventar a tabela seria pior que não ter. Calendário declarado por empresa é spec separada.
- **Trocar o mapa ou o roteirizador.** Telha e rota continuam nossas (ADR-0044 §6). Esta spec mexe
  **só** em transformar endereço em coordenada.
- **Limitador de taxa.** É pré-requisito da história P3 e não é entregue aqui — ver Requisitos não
  funcionais.

## Histórias priorizadas

### P1 — A base ganha uma medida de confiança

**Given** um endereço com CEP resolvido e texto completo
**When** o lote de comparação roda
**Then** ele é resolvido **duas vezes** — por CEP e por texto (estado, cidade, bairro, rua, número) —
e a distância entre as duas respostas é gravada, junto da origem e da precisão de cada uma.

⚠️ **Comparar semelhante com semelhante.** `city` × `rooftop` distam centenas de metros **sempre**, e
isso é diferença de precisão, não discordância — tratá-las como conflito faria os 149 inundarem o
relatório e o sinal virar ruído.

| combinação                          | leitura                                                              |
| ----------------------------------- | -------------------------------------------------------------------- |
| `city` × `rooftop`                  | **melhoria** — grava a melhor, não é conflito                        |
| `postal_code` × `rooftop` próximos  | **confirmação** — o caso que mais vale: um endereço em que se confia |
| `postal_code` × `rooftop` distantes | **conflito** — vai para o relatório, ordenado por distância          |

### P2 — O relatório diz o que provavelmente está errado

**Given** a base comparada
**When** o operador abre o relatório no painel
**Then** ele vê os endereços suspeitos **agrupados por contratante e ordenados por discordância**,
com a distância em metros como razão — não uma lista alfabética.

Sinais de suspeita, em ordem de força:

1. **Divergência de texto** (RF8) — o sistema comparou o que a nota diz com o que o provedor
   devolveu. É o sinal que vira pedido ao contratante, porque ele nomeia **o quê** está errado.
2. **Conflito entre as duas fontes** (P1) — quantitativo, disponível no dia um.
3. **Precisão `city`** — estrutural, 149 hoje.
4. **Ocorrência do motorista** — `trip_document_occurrences` com tipo de `company_occurrence_types`.
   ⚠️ Tabelas existem e estão **vazias** nesta base; o sinal acende conforme a operação roda.
5. **Devolução** — `returned_at` + `returnReason`. Zero hoje.

### ⚠️ O pedido é para o cadastro dele, não para a nossa base

O texto errado **não nasce aqui**: ele vem no XML, digitado no cadastro de quem emite a NF-e — e o
contratante do frete quase sempre **é** quem emite.

Então o pedido não é _"arrume este endereço para nós"_, é **"o seu cadastro está com este endereço
errado; corrija lá, e ele para de chegar errado"**. Corrigir só na nossa base trata o sintoma: a
próxima nota chega com o mesmo `R AMERICA DE ARAUJO PERES`, para sempre.

Isso muda o texto da tela e dá um número que mede se o pedido funcionou — ver RF10.

### P3 — O contratante corrige o que só ele sabe

**Given** um contratante com vínculo ativo e a permissão nova
**When** ele abre a lista de endereços suspeitos das entregas dele
**Then** ele pode corrigir **CEP e/ou o endereço escrito** (logradouro, número, bairro, complemento,
ponto de referência), e a correção entra como **sugestão** — a transportadora aceita.

- **Permissão própria**, `deliveries.address.suggest`. Não pega carona em `deliveries.track`: mexer
  no endereço para onde um caminhão vai não é acompanhar entrega.
  ⚠️ **Eu vinha citando `charges.decide` como precedente, e ela não tem ADR nenhuma** — existe só no
  código. O precedente registrado de "permissão própria para o que custa" é a **ADR-0049 §6**
  (`trip.financials`, _"é de `company-admin` e `finance`, e de mais ninguém"_).
  ⚠️ E ampliar o papel não é terreno livre: a **ADR-0050 §2** diz que o contratante tem _"uma
  permissão só"_, e a **ADR-0003** congela a matriz — _"ampliar uma role exige nova decisão"_. P3
  precisa de ADR por isso, não só pelo risco.
- **Nomeada por chave de acesso**, nunca por id interno — a regra do portal não abre exceção.
- **Sugestão, não escrita direta.** O portal é a única superfície externa do produto, e um pino
  errado vindo de fora manda o caminhão para o outro lado da cidade. O par já tem precedente:
  `delivery_address_overrides` guarda `requestedBy` (hoje texto livre, "quem pediu quase nunca é
  usuário do sistema") e `actorUserId` (quem executou). Com o portal, quem pede **passa a ser** uma
  conta.
- ⚠️ **A tela precisa dizer que CEP `-000` já está certo.** Cidade de CEP único tem um CEP só; o
  contratante que tentar "corrigir" vai concluir que o sistema está quebrado. Ali o que resolve é o
  texto.

### P4 — Quem entrega **relata**; ele não corrige

⚠️ **Esta história foi reescrita depois de a ADR-0057 ser lida.** A versão anterior dizia que o pino
do motorista "vira `rooftop` de graça" — e isso **contradiz decisão aceita**. A ADR-0057 §4 é
explícita: o app **não altera o endereço**. Ele abre um **ponto de atenção** na parada, e _"quem lê
de fora propõe, quem responde decide"_. Deixar o app corrigir poria o cadastro do cliente na mão de
quem está com o caminhão parado na rua errada, e o primeiro relato equivocado viraria endereço
oficial.

**Given** um motorista numa parada cujo endereço não é ali
**When** ele abre a ocorrência `wrong_address` (ADR-0057 §1, já no catálogo de parada)
**Then** o relato vira ponto de atenção com a **distância aferida**, e é o escritório que decide o
que fazer com ele.

O que esta spec **não** redecide, porque já está decidido:

| assunto                                               | onde        |
| ----------------------------------------------------- | ----------- |
| `wrong_address` no catálogo da parada, não no da nota | ADR-0057 §1 |
| permissão de localização bloqueia; falta de sinal não | ADR-0057 §2 |
| raio de 5 km, e "não aferida" como estado             | ADR-0057 §2 |
| longe **avisa e registra**, não impede                | ADR-0057 §3 |
| o app **não corrige** o endereço                      | ADR-0057 §4 |
| painel próprio de ocorrências                         | ADR-0057 §6 |

**O que esta spec acrescenta**, e que a ADR-0057 não cobre: a ocorrência `wrong_address` é o quarto
sinal do relatório de endereço (P2) — hoje ela abre pendência na parada, e aqui ela também alimenta
a lista de endereços suspeitos, ao lado da divergência de texto e da precisão de município.

### P5 — A correção vale para a próxima nota

**Given** um endereço corrigido e aceito
**When** chega nota nova do mesmo cliente para o mesmo lugar, com o texto grafado de outro jeito
**Then** o endereço bom é usado, e **nenhum provedor é consultado**.

Precedência, no mesmo formato de `resolvePhysicalDestination` (desvio → `<entrega>` → `<enderDest>`):

1. Correção do contratante, aceita
2. Endereço confirmado que já temos para aquele **cliente + endereço**
3. CEP (degrau 1, grátis)
4. Texto no provedor pago (degrau 2)
5. Centroide do município — último recurso, marcado como aproximado

⚠️ **O vínculo é `(cliente, endereço)`, nunca só o cliente.** A parada agrupa por endereço
normalizado e **não** por CNPJ, de propósito: _"a mesma rede em cinco lojas é cinco paradas"_. Ligar
coordenada a CNPJ colapsaria as cinco lojas numa, e o caminhão entregaria tudo na primeira — defeito
pior que o atual, porque teria cara de melhoria.

⚠️ **Candidato ambíguo não se aplica sozinho.** `cliente + número + cidade` discrimina bem (as lojas
da rede estão em números diferentes) mas colide. Na dúvida, vai para o relatório em vez de virar
coordenada.

### P6 — O operador decide, e o aviso tem destinatário certo

⚠️ **Reescrita depois da ADR-0057.** A §5 dela já decidiu o aviso ao contratante, e trazia duas
coisas que a versão anterior desta história não tinha.

**Given** um endereço marcado — por divergência de texto (P1), por ocorrência do campo (P4) ou por
precisão de município
**When** o operador abre a linha no relatório
**Then** ele tem as duas ações, e a segunda leva a sugestão concreta junto.

#### O que a ADR-0057 §5 já decidiu, e esta spec obedece

⚠️ **Quem recebe o aviso é o contratante que EMITIU a nota** — o embarcador, em `contractors` — e
**não** o `delivery_client` que recebe a carga. O endereço errado está no cadastro de quem emite;
avisar quem recebe seria contar à loja que o endereço dela está errado na base de outra empresa.

⚠️ **O aviso é ação do operador, nunca automática.** E o motivo não é cautela genérica: _"endereço
divergente às vezes é o correto — armazém que recebe pelo fundo, loja com dois acessos"_. Aviso
disparado por relato de campo erraria com frequência suficiente para o cliente parar de lê-los.

⚠️ **A correção da entrega de hoje é `delivery_address_overrides`**, que já existe desde a spec 056 —
append-only, por **nota**, com o `enderDest` original preservado ao lado. E a consequência que a ADR
manda deixar visível: uma parada com cinco notas pede cinco desvios, e aplicar em quatro **parte a
parada em duas** no próximo `buildStopAddressKey`. O painel aplica em lote e **mostra quantas foram**.

#### O que esta spec acrescenta

O aviso deixa de ser um pedido em branco. Ele carrega o que o sistema já apurou: o texto como veio, o
que o provedor devolveu, e a razão (`APPROXIMATE` sem rua, divergência de texto, CEP divergente).

⚠️ Isso **não** afrouxa a regra de a ação ser do operador — ao contrário: ele decide com a evidência
na mão, em vez de decidir no escuro. E continua valendo que divergência **sinaliza, nunca corrige**.

## A corrente das fontes, e por que ela não é uma fila

Quatro fontes, cada uma mais autorizada que a anterior — mas elas **não chegam na mesma cadência**, e
tratar as quatro como etapas de uma fila é o erro que trava o produto:

| #   | fonte                     | quando chega                       | o que ela conserta                    |
| --- | ------------------------- | ---------------------------------- | ------------------------------------- |
| 1   | CEP                       | já está aqui                       | a rua, quando o CEP tem logradouro    |
| 2   | Comparação com o provedor | **lote**, em dias                  | a medida de confiança da base inteira |
| 3   | Contratante               | dias a semanas, sob pedido         | **o texto** — nomenclatura e CEP      |
| 4   | Quem entrega              | **gotejamento**, ao longo de meses | **o ponto**, com quem esteve na porta |

⚠️ **O degrau 4 é o mais autorizado e o mais lento.** O motorista só confirma endereço onde ele
efetivamente entrega. Se o relatório esperar a confirmação para agir, ele nunca sai do lugar — os
degraus 1 e 2 têm de bastar para o relatório nascer útil no dia um.

⚠️ **O motorista confirma o ponto, não o texto.** Depois que ele confirma, a coordenada fica certa e
a próxima nota **continua chegando com o mesmo texto errado**. Por isso o pedido ao contratante (P6)
não sai da corrente quando o motorista responde: um conserta onde é, o outro conserta o que faz a
nota casar.

## O sistema acha a divergência; o humano decide

O provedor devolve **texto canônico**, não só coordenada. Medido na busca real: entrada
`AVENIDA PRESIDENTE CASTELO BRANCO, 960, BARRINHA, SP` → retorno `Av. Pres. Castelo Branco, 960 —
Barrinha/SP, 14860-000`, com bairro. E para Luis Antonio, `R AMERICA DE ARAUJO PERES` contra
`Rua Américo de Araújo Pires`.

Logo **a comparação de texto é do sistema**, não do contratante: temos o que a nota diz e temos o que
o provedor devolveu. Ele deixa de ser quem _descobre_ o erro e passa a ser quem _confirma_ a
correção — o que muda o pedido de "confira este endereço" para "é isto?".

### ⚠️ Isto não contradiz a rejeição do casamento por semelhança, e a distinção é a que importa

O que a spec rejeita, medido em 14% com falsos positivos (`RUA 02` → `Rua 12`), é **procurar** uma
rua entre milhares por semelhança — um problema de um-para-muitos, onde a distância de edição inventa
acerto.

O que se faz aqui é **comparar** o nosso texto com o texto que o provedor devolveu **para aquela
mesma consulta** — um-para-um, e o resultado não elege nada: ele apenas diz _"estes dois diferem"_.

**Divergência sinaliza; ela nunca corrige.** O texto do provedor entra como **sugestão** exibida ao
contratante ou ao operador, jamais como sobrescrita automática — porque o provedor também erra, e um
"corrigir" para outra rua é indistinguível de um acerto depois de gravado.

### ⚠️ O provedor avisa quando não achou, e esse é o sinal mais barato

**Medido em 2026-09-04 com a chave real**, três endereços dos 149:

| enviado                                            | retorno                                                   | `location_type`   |
| -------------------------------------------------- | --------------------------------------------------------- | ----------------- |
| `AVENIDA PRESIDENTE CASTELO BRANCO, 960, BARRINHA` | `Av. Pres. Castelo Branco, 960, Barrinha - SP, 14860-000` | **`ROOFTOP`**     |
| `AVENIDA COSTA E SILVA, 1520, BARRINHA`            | `Av. Costa e Silva, 1520 - Jardim Lisboa, Barrinha - SP`  | **`ROOFTOP`**     |
| `R AMERICA DE ARAUJO PERES, 533, LUIS ANTONIO`     | `Luís Antônio, SP, 14210-000` — **rua ausente**           | **`APPROXIMATE`** |

⚠️ **O grafismo errado derruba o provedor pago também.** `AMERICA` por `Américo` e `PERES` por
`Pires` fazem o Google cair no município, exatamente como o Nominatim. O teste manual que sugeriu o
contrário buscava pelo **nome do estabelecimento** (`FERNANDES SUPERMERCADO`), que ele conhece — não
pelo endereço da nota.

A diferença que importa: ele **avisa**. Devolve `APPROXIMATE` e **omite a rua** do endereço
formatado, em vez de inventar uma parecida. Então:

| retorno                        | leitura                        | destino                             |
| ------------------------------ | ------------------------------ | ----------------------------------- |
| `ROOFTOP` com rua no formatado | achou a porta                  | compara texto e coordenada          |
| `APPROXIMATE` com rua ausente  | **o texto da nota não existe** | vai direto ao pedido do contratante |

Isso torna a detecção do caso mais grave **gratuita**: não é preciso comparar strings para saber que
`R AMERICA DE ARAUJO PERES` está errado — o provedor já disse que não achou. A comparação de texto
fica para o caso sutil: achou a rua, mas com nome diferente do que a nota diz.

### O CEP não melhora a busca — ele serve para conferir o que volta

**Medido com a chave real**, quatro formas de perguntar o mesmo endereço de Luis Antonio (com a
grafia errada da nota): texto simples, texto com CEP, CEP em `components`, e a forma estruturada
completa. **As quatro devolveram `APPROXIMATE` sem rua.**

Faz sentido e é bom que seja assim: `14210-000` é o CEP **único do município inteiro** — ele não
estreita nada, porque não há rua para apontar. Nas cidades de CEP único, que são exatamente os nossos
149, **o CEP não tem informação a acrescentar à consulta**.

O valor dele está na volta. Medido em Ribeirão: enviamos `14078-369` e o provedor devolveu
**`14078-390`**. Divergência de CEP é sinal — e não dá para saber, sozinho, se o errado é o da nota
ou se o provedor interpolou de um trecho vizinho. Vai ao humano, nunca vira correção automática.

⚠️ **São quatro níveis de precisão, não dois.** A mesma consulta revelou `RANGE_INTERPOLATED`: o
provedor conhece a rua e **não conhece aquele número** — interpolou entre dois vizinhos. É palpite
sobre a via certa, e **não pode ser gravado como `rooftop`**:

| retorno                        | significa                      | destino                          |
| ------------------------------ | ------------------------------ | -------------------------------- |
| `ROOFTOP`                      | a porta, conhecida             | confia                           |
| `RANGE_INTERPOLATED`           | rua certa, **número estimado** | usa e **marca**; não é `rooftop` |
| `APPROXIMATE` sem rua          | **o texto não existe**         | pedido ao contratante            |
| município diferente do da nota | o provedor errou               | descarta (RF2)                   |

### O que conta como divergência

| diferença                                | é divergência?              | por quê                                                                                                |
| ---------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `AVENIDA` × `Av.`, `Dr.` × `DR`          | ❌                          | tipo de via e pontuação — `buildClientStreetKey` já colapsa                                            |
| acento (`SAO JOAO` × `São João`)         | ❌                          | mesma canonicalização                                                                                  |
| `PRESIDENTE` × `PRES`                    | ⚠️ **sim, e vai ao humano** | abreviação do provedor, não erro da nota — mas nenhuma regra distingue isso de erro real sem adivinhar |
| `AMERICA` × `Américo`, `PERES` × `Pires` | ✅                          | palavra diferente: é o defeito que impede a nota de casar                                              |
| CEP diferente do que o provedor devolve  | ✅                          | e este é o mais valioso: CEP certo devolve o endereço ao degrau 1, que é grátis                        |
| bairro ausente na nota                   | ➖                          | acréscimo, não conflito — preenche sem perguntar                                                       |

⚠️ **A linha do `PRESIDENTE` × `PRES` é assumidamente conservadora.** Ela gera ruído — o operador vai
ver divergência onde só houve abreviação do provedor. Preferimos o ruído: a alternativa é uma tabela
de abreviações que decide sozinha, e ela erra exatamente onde os nomes são parecidos, que é onde o
erro custa caro.

## Requisitos funcionais

- **RF1** — A busca por texto envia **estado, cidade, bairro, logradouro e número**. Sem cidade e UF
  o provedor devolve uma "Rua 7 de Setembro" de outro município que **parece certa**.
- **RF2** — **Conferência de município é obrigatória, não filtro.** O resultado que voltar em
  `cityCode` diferente do da nota é **descartado**, não comparado. Provedor que erra de cidade com
  boa vontade grava `rooftop` — precisão alta, cidade errada, e ninguém mais desconfia dele. Esta
  checagem importa mais que a comparação em si.
- **RF3** — Toda coordenada guarda **origem, precisão, data e ator**. Origem e precisão já existem
  (`source`, `precision`, `geocoded_at`, `external_place_id`); o **ator** é o que a tabela de
  correções acrescenta. Precisão **muda comportamento**: o solver exclui parada `city` da otimização.
- **RF4** — Correção é **append-only**, no padrão de `delivery_address_overrides` e `audit_logs`:
  posição anterior, nova, origem e ator. Sem histórico o relatório não tem matéria-prima e a taxa de
  erro do provedor é incalculável.
- **RF5** — A tabela de correção permanente **não é** `delivery_address_overrides`. Aquele é desvio
  de _uma entrega_ e não vale para a próxima nota; este é cadastro. Confundir faria um desvio pontual
  virar endereço fixo do cliente.
- **RF6** — Quando as duas fontes discordam, **nenhuma vence sozinha**: grava a mais específica,
  marca como suspeito, manda ao humano. Resolver por regra automática é como `RUA 02` virou
  `Rua 12`.
- **RF7** — O relatório publica quatro números: distribuição por origem; deslocamento das correções
  em metros; **quantos resultados do provedor pago foram corrigidos depois por um humano**; e
  concentração por cidade e CEP. O terceiro é o que decide se vale continuar pagando.
- **RF8** — A comparação de texto é do sistema, e **sinaliza sem corrigir**. O texto canônico do
  provedor é sugestão exibida; sobrescrita automática é proibida, porque provedor errado gravado é
  indistinguível de provedor certo.
- **RF9** — Divergência de **CEP** é a de maior valor e sai destacada: CEP corrigido devolve o
  endereço ao degrau 1, que é grátis e nosso — deixa de custar consulta para sempre.
- **RF10** — O relatório mede **se o pedido pegou**: nota nova do mesmo cliente para o mesmo lugar,
  depois do pedido, ainda divergente = o cadastro do contratante não foi corrigido. É a diferença
  entre "pedimos" e "resolveu", e sem ela o relatório vira lista de pedidos sem desfecho.
- **RF11** — `location_type` do provedor é sinal de primeira classe: `APPROXIMATE` com rua ausente
  significa **texto inexistente** e vai ao contratante sem passar por comparação de string.
- **RF12** — A consulta envia **estado, cidade, bairro, logradouro, número e CEP** — o CEP não para
  melhorar a busca (medido: não melhora), mas para que o CEP **de volta** possa ser comparado.
- **RF13** — `RANGE_INTERPOLATED` **nunca** é gravado como `rooftop`: é número estimado sobre a rua
  certa. Achatar os dois apagaria a diferença entre a porta e o palpite sobre ela.

## Requisitos não funcionais

- **RNF1** — ⚠️ **Esta API não tem limitador de taxa**, e o achado **não é "das rotas de senha"**
  como escrevi antes: a **ADR-0040 §5** o abriu para a rota de CEP e a **ADR-0041** para a rota
  pública da landing — no mínimo três consumidores registrados.
  ⚠️ **E três ADRs aceitas decidiram subir sem ele**, cada uma com mitigação compensatória nomeada
  (base local primeiro; `202` invariável; enfileirar em vez de limitar — 0040 §5, 0041, 0053). Fazer
  do limitador um **pré-requisito duro** de P3 é **mudança de postura sobre decisão tomada três
  vezes**, não consequência óbvia do achado. Ou P3 traz ADR justificando a inversão — ela é a
  primeira escrita externa que **move caminhão**, o que é argumento real —, ou traz mitigação
  compensatória no mesmo formato das outras três.
- **RNF2** — O provedor pago é chamado **em lote, fora do caminho quente da importação**, sob
  condição detectável antes de gastar. Custo medido: ~US$ 5 por mil consultas, cacheadas por
  endereço — os 149 saem por menos de um dólar, uma vez.
- **RNF3** — ⚠️ **Confirmar os termos atuais do Maps Platform sobre armazenar resultado de
  geocodificação antes do lote.** O entendimento é que o **Place ID** pode ser guardado
  indefinidamente e a coordenada não; `external_place_id` existir na tabela sugere que quem a
  desenhou já sabia. Isto não é opinião técnica e precisa de confirmação de quem responde pelo
  contrato.
- **RNF4** — Endereço de entrega é dado pessoal (`security.md` §1). Nada de coordenada em log, e o
  relatório ao contratante mostra **só os endereços do vínculo dele**.

## Casos extremos e falhas

- **Provedor fora do ar** — o lote pausa e retoma; endereço sem resposta continua no degrau que
  tinha. Nunca cai em coordenada inventada.
- **Cliente com duas lojas no mesmo número e ruas diferentes, na mesma cidade** — ambiguidade
  detectada, não aplica, vai ao relatório (P5).
- **Contratante corrige para um endereço em outro município** — recusado pela RF2, com mensagem
  dizendo qual município a nota declara.
- **Correção aceita e depois o cliente muda de endereço** — `geocoded_at` e o histórico permitem
  distinguir confirmação recente de palpite velho; a ocorrência do motorista (P4) reabre o caso.
- **Base sem nenhuma ocorrência de campo** — é o estado de hoje. P2 nasce dos sinais 1 e 2, que já
  têm dado.

## Critérios de aceite

- [ ] Os 300 endereços têm distância entre as duas fontes gravada, e a base publica a proporção
      confirmada por duas fontes independentes
- [ ] Resultado em município diferente do da nota é descartado, com teste negativo
- [ ] Nenhuma correspondência automática por semelhança de nome de rua em lugar nenhum do código
- [ ] Relatório agrupa por contratante e ordena por discordância, não alfabeticamente
- [ ] `deliveries.address.suggest` existe, é separada de `deliveries.track`, e o contrato de
      autorização lista por extenso as rotas que ela alcança
- [ ] Rota do portal nomeada por chave de acesso; chave de outro contratante responde igual a chave
      inexistente
- [ ] Limitador de taxa em pé antes de P3 subir
- [ ] Correção grava origem, precisão, data e ator, append-only
- [ ] Nota nova de cliente com endereço já corrigido **não** dispara consulta a provedor — teste que
      falha se disparar
- [ ] Vínculo por `(cliente, endereço)`: contrato que reprova colapso de duas lojas do mesmo cliente
- [ ] **"Errado sem pino" é aceito e marca o endereço** — contrato que falha se a confirmação exigir
      coordenada para registrar a recusa
- [ ] O relatório oferece **as duas** ações no mesmo endereço (apontar no mapa e pedir ao
      contratante), e permite as duas juntas
- [ ] O pedido ao contratante carrega o texto e o CEP como vieram, mais a razão da suspeita — nunca
      formulário em branco
- [ ] O pedido diz que a correção é **no cadastro dele**, não na nossa base
- [ ] O relatório distingue "pedido enviado" de "parou de divergir" — nota nova ainda divergente
      depois do pedido continua aparecendo

## Decisões já aceitas que esta spec consome — e não redecide

⚠️ **Esta seção nasceu de uma varredura das 60 ADRs feita tarde demais.** Antes dela eu propus, nesta
mesma spec, coisas já decididas — e algumas em sentido contrário. Fica escrita para a próxima pessoa
não repetir: **ler `docs/adr/` antes de desenhar não é formalidade.**

| ADR                             | O que ela já decidiu                                                                                                                                           | O que esta spec faz                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **0044 adendo**                 | Escalada automática ao provedor pago foi **avaliada e recusada** — _"gasta sem ninguém decidir"_. Há teste guardando: `paid-provider-never-called.contract.ts` | ⛔ **O lote nos 300 (D1) contradiz.** Exige ADR de reversão ou redução ao que a 0044 permite      |
| **0044 §3**                     | Armazenar coordenada do Google permanentemente **já foi assumido**, com três mitigações                                                                        | ✅ consome; o D3 que escrevi era bloqueio inexistente                                             |
| **0044 §5**                     | Parada `city` não entra na otimização automática                                                                                                               | ✅ consome                                                                                        |
| **0021 §2**                     | Isolamento multiempresa é obrigatório — _"vazamento entre CNPJs do mesmo dono"_                                                                                | ⚠️ **A base é `geocoded_addresses`, que não tem `company_id`.** Decisão a tomar antes da migração |
| **0050 §5**                     | O portal **tem** mapa (malha IBGE + ponto), e coordenada de cliente não sai dele                                                                               | ✅ corrigido; o pino fica fora por outro motivo                                                   |
| **0050 §2** / **0003**          | `contractor` tem _"uma permissão só"_; a matriz é congelada                                                                                                    | ⚠️ P3 amplia — exige ADR                                                                          |
| **0057**                        | Ocorrência `wrong_address`, o app não corrige, aviso é do operador, destinatário é quem emitiu                                                                 | ✅ consome (P4, P6)                                                                               |
| **0048 §3**                     | `municipal_holidays` `(company_id, city_ibge_code, holiday_on)`, à mão                                                                                         | ⚠️ eu chamei de "spec futura"; **já existe**                                                      |
| **0031**                        | Módulo de notificação com template editável e `recipientResolver`                                                                                              | ⚠️ o aviso de P6 deve usá-lo, não nascer do zero                                                  |
| **0032 / 0020**                 | Provedor pago = porta + gateway por env + capacidade booleana + **permissão de gasto**                                                                         | ⚠️ o desenho do degrau 2 deve seguir                                                              |
| **0040 §5 / 0041 / 0053**       | Subir sem limitador é postura aceita, com mitigação nomeada                                                                                                    | ⚠️ ver RNF1                                                                                       |
| **0040 §2**                     | A sugestão de CEP **nunca** projeta `number` nem `complement`                                                                                                  | ⚠️ P3 recebe os dois — é escrita, não projeção, mas precisa da linha explícita                    |
| **0012**                        | Ator sintético por empresa + `triggered_by` (`user`/`automation`)                                                                                              | ⚠️ é a resposta para "quem é o ator do lote", que a RF3 deixaria nula                             |
| **0024**                        | Divergir de `data-tables.md` exige ADR; não há `sortBy` no servidor                                                                                            | ⚠️ P2 ordena por métrica e P6 age em lote — as duas divergem                                      |
| **0033 §5 · 0038 §6 · 0048 §5** | Automático nasce **proposto**; referência nunca sobrescreve escolha manual                                                                                     | ✅ é o princípio de RF8, e ele já tinha nome                                                      |

## Dúvidas

- ✅ **D1 decidido: o lote roda nos 300.** A medida de confiança é da base inteira, não só do pedaço
  quebrado. ⚠️ Isso **contradiz a postura das ADR-0037 e ADR-0040** — o endereço não sai inteiro do
  navegador, e o CEP vem de casa. Todo endereço de cliente passa a ir ao provedor, e isso exige
  **ADR própria** registrando a decisão e o porquê, antes da T04. Não é impeditivo; é decisão que
  precisa estar escrita, e não herdada por silêncio.
- [NEEDS CLARIFICATION: a aceitação da sugestão do contratante é manual ou automática?
  ⚠️ **A ADR-0057 §4 já dá o princípio** — *"quem lê de fora propõe, quem responde decide"* —, e ela
  vale para o app do motorista. Falta decidir se ele se estende ao **portal**: o contratante é dono
  do cadastro de origem, o que é argumento para aceitar direto; mas continua sendo escrita externa
  que move caminhão, o que é argumento para conferir. Sem a ADR-0057 esta pergunta era aberta; com
  ela, é uma extensão a confirmar.]
- ✅ **D3 nunca foi pergunta, e eu inventei o bloqueio.** A **ADR-0044 §3** já decidiu, por escrito:
  _"Os Termos do Google Maps Platform não permitem o armazenamento permanente descrito acima. **A
  decisão do produto é armazenar permanentemente mesmo assim.** Está aqui para que a próxima pessoa
  saiba que foi escolha consciente, não descuido."_ Com as três mitigações nomeadas lá — `place_id`
  `not null`, `GeocodingPort` e volume observável.
  ~~[NEEDS CLARIFICATION: os termos permitem guardar a coordenada, ou só o Place ID?
  ⚠️ **Há uma saída que talvez dispense a resposta:** a **distância entre as duas fontes é conta
  nossa**, derivada no momento da comparação. Guardando o Place ID e o número, a base ganha a medida
  de confiança sem herdar coordenada de terceiro. A pergunta passa a valer só para o caso em que o
  Google é a **melhor** fonte e queremos usá-lo como coordenada de entrega.]
- ✅ **D4 já estava decidido, e eu não tinha lido: ADR-0057 §4.** O app **não corrige** o endereço —
  ele abre ponto de atenção, e quem decide é o escritório. A pergunta "aceito direto ou sugestão?"
  não existia: a resposta é sugestão, por decisão aceita em 2026-09-03.
