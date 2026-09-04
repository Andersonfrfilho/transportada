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

- **Pino no portal do contratante.** O pino entra no app de quem entrega e no painel (P4, P6) — no
  portal, não: o `frontend-client` não tem design system nem biblioteca de mapa, e o contratante
  corrige **texto**, que é o que ele sabe.
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

- **Permissão própria**, `deliveries.address.suggest`. Não pega carona em `deliveries.track`, pelo
  mesmo motivo que `charges.decide` é separada: mexer no endereço para onde um caminhão vai não é
  acompanhar entrega.
- **Nomeada por chave de acesso**, nunca por id interno — a regra do portal não abre exceção.
- **Sugestão, não escrita direta.** O portal é a única superfície externa do produto, e um pino
  errado vindo de fora manda o caminhão para o outro lado da cidade. O par já tem precedente:
  `delivery_address_overrides` guarda `requestedBy` (hoje texto livre, "quem pediu quase nunca é
  usuário do sistema") e `actorUserId` (quem executou). Com o portal, quem pede **passa a ser** uma
  conta.
- ⚠️ **A tela precisa dizer que CEP `-000` já está certo.** Cidade de CEP único tem um CEP só; o
  contratante que tentar "corrigir" vai concluir que o sistema está quebrado. Ali o que resolve é o
  texto.

### P4 — Quem entrega diz se o ponto está certo

**Given** uma entrega concluída num endereço de precisão baixa
**When** o motorista confirma a entrega no app
**Then** ele responde **uma** pergunta — o ponto estava certo? — e, se não estava, **pode** apontar
no mapa onde era. O pino é **opcional**.

⚠️ **O pino ser opcional é o que faz o resto funcionar.** Motorista no fim do turno, com o celular
na chuva, não vai arrastar pino — e se a resposta "estava errado" **exigir** o pino, ele responde
"estava certo" para seguir adiante, e a base fica pior do que se ninguém perguntasse nada. Um "estava
errado" sem coordenada já vale: ele marca o endereço no relatório, que é o que aciona o contratante.

São três respostas, e as três são úteis:

| resposta             | o que produz                                                              |
| -------------------- | ------------------------------------------------------------------------- |
| **certo**            | confirma a coordenada — e é o que faz a base parar de perguntar sobre ela |
| **errado, com pino** | coordenada `rooftop` de graça, da única fonte que esteve na porta         |
| **errado, sem pino** | marca para o relatório; quem conserta é o contratante ou o operador       |

- **Perguntar pouco**: uma pergunta, sim/não, no momento da confirmação. Formulário no fim de cada
  parada para de ser respondido na terceira.
- **Só onde a resposta vale**: em `city` ela paga; em `rooftop` já confirmado é ruído.
- ⚠️ **"Não era aqui" ≠ endereço errado.** Pode ser portaria fechada, cliente mudou, outro portão.
  Entra como **ocorrência**, nunca como sobrescrita direta da coordenada.

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

### P6 — O operador conserta e cobra, da mesma tela

**Given** o relatório de confirmação de endereço no painel
**When** o operador abre um endereço marcado
**Then** ele tem, na mesma tela, as duas ações — **apontar no mapa** e **pedir correção ao
contratante** —, e a segunda leva o motivo junto.

⚠️ **As duas existem porque resolvem coisas diferentes, e confundi-las desperdiça as duas.**

**Apontar no mapa** conserta _onde_. Serve quando o lugar é conhecido e só a coordenada está errada
— o operador que conhece a região, ou o pino que o motorista mandou. Efeito imediato no roteiro,
sem depender de ninguém responder.

**Pedir ao contratante** conserta _como se chama_. É o caminho quando o defeito é de **nomenclatura
ou CEP** — `R AMERICA DE ARAUJO PERES` onde a rua é `Rua Américo de Araújo Pires`, ou um CEP que não
é daquele logradouro. Isso o motorista não sabe e o pino não resolve: a próxima nota chega com o
mesmo texto errado, e sem o texto certo ela não casa com nada.

⚠️ **Um pino sem correção de texto conserta uma nota; uma correção de texto conserta todas as
seguintes.** Por isso o pedido ao contratante não é o plano B do pino — os dois se somam, e o
relatório deve deixar pedir os dois no mesmo endereço.

O pedido carrega **o que está suspeito**, não um formulário em branco: o texto como veio, o CEP como
veio, e a razão (divergência entre fontes, ocorrência do motorista, precisão de município). Pedir
"confira este endereço" sem dizer o que está errado devolve o mesmo endereço de volta.

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

- **RNF1** — ⚠️ **Esta API não tem limitador de taxa nenhum**, achado já registrado em
  `docs/SECURITY.md` para as rotas de senha. P3 abre a **primeira escrita externa que afeta
  operação** — hoje o contratante só lê entrega e decide repasse, e nenhuma das duas move caminhão.
  O limitador deixa de ser dívida e vira **pré-requisito de P3**.
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

## Dúvidas

- ✅ **D1 decidido: o lote roda nos 300.** A medida de confiança é da base inteira, não só do pedaço
  quebrado. ⚠️ Isso **contradiz a ADR-0047** — todo endereço de cliente vai ao provedor — e exige
  **ADR própria** registrando a decisão e o porquê, antes da T04. Não é impeditivo; é decisão que
  precisa estar escrita, e não herdada por silêncio.
- [NEEDS CLARIFICATION: a aceitação da sugestão do contratante é manual (um operador confere) ou
  automática quando a conferência de município passa? Manual é mais seguro e não escala; automática
  escala e transforma o portal em escrita direta na operação.]
- [NEEDS CLARIFICATION: RNF3 — os termos do Maps Platform permitem guardar a coordenada
  permanentemente, ou só o Place ID? Bloqueia o lote.
  ⚠️ **Há uma saída que talvez dispense a resposta:** a **distância entre as duas fontes é conta
  nossa**, derivada no momento da comparação. Guardando o Place ID e o número, a base ganha a medida
  de confiança sem herdar coordenada de terceiro. A pergunta passa a valer só para o caso em que o
  Google é a **melhor** fonte e queremos usá-lo como coordenada de entrega.]
- [NEEDS CLARIFICATION: o pino do motorista (P4) vira coordenada **aceita** direto, ou entra como
  sugestão que o operador confirma no relatório (P6)? Ele é a fonte que esteve na porta — mas também
  é um toque numa tela pequena, no fim do turno, e um pino errado é indistinguível de um certo.]
