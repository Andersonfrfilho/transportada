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

1. **Conflito entre as duas fontes** (P1) — quantitativo, disponível no dia um.
2. **Precisão `city`** — estrutural, 149 hoje.
3. **Ocorrência do motorista** — `trip_document_occurrences` com tipo de `company_occurrence_types`.
   ⚠️ Tabelas existem e estão **vazias** nesta base; o sinal acende conforme a operação roda.
4. **Devolução** — `returned_at` + `returnReason`. Zero hoje.

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

## Dúvidas

- [NEEDS CLARIFICATION: o lote de comparação (P1) roda nos 300 endereços ou só nos 149 de precisão
  `city`? Rodar nos 300 dá medida de confiança da base inteira por ~US$ 1,50 uma vez, e **manda todo
  endereço de cliente ao provedor** — o que contradiz a postura da ADR-0047 e exige ADR própria.
  Rodar só nos 149 preserva a postura e não mede os outros 147.]
- [NEEDS CLARIFICATION: a aceitação da sugestão do contratante é manual (um operador confere) ou
  automática quando a conferência de município passa? Manual é mais seguro e não escala; automática
  escala e transforma o portal em escrita direta na operação.]
- [NEEDS CLARIFICATION: RNF3 — os termos do Maps Platform permitem guardar a coordenada
  permanentemente, ou só o Place ID? Bloqueia o lote.]
- [NEEDS CLARIFICATION: o pino do motorista (P4) vira coordenada **aceita** direto, ou entra como
  sugestão que o operador confirma no relatório (P6)? Ele é a fonte que esteve na porta — mas também
  é um toque numa tela pequena, no fim do turno, e um pino errado é indistinguível de um certo.]
