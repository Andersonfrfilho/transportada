# 060 — o cliente tem hora e tem preço

> **Alimenta a 058** (janela e custo por parada) e **a 057** (o motorista precisa saber que aquela
> parada tem hora marcada). Pode ser desenvolvida em paralelo com as duas; o solver trata a ausência
> de cadastro como o caso normal.

## Problema e resultado

Nem todo destinatário recebe do mesmo jeito. Alguns só aceitam entrega em janela combinada e exigem
agendamento prévio — chegar fora da hora é voltar com a carga. Outros cobram para receber: taxa de
descarga, taxa de agendamento, taxa de plataforma do centro de distribuição. Hoje essas duas coisas
vivem na cabeça de quem monta o roteiro e num grupo de WhatsApp, e as consequências são caras dos
dois lados: o motorista faz uma viagem perdida, e a taxa que o cliente cobrou vira prejuízo porque
ninguém repassou ao contratante.

O XML da NF-e não carrega nada disso. Não há campo de horário de recebimento, não há campo de taxa —
e não existe, hoje, cadastro de cliente no sistema: o destinatário é derivado de `nfe_participants` a
cada documento, sem identidade própria (`domain-model.md`).

O resultado desta feature é o cadastro que falta: **o cliente que tem hora e o cliente que tem
preço**. A janela alimenta a roteirização, o agendamento vira pendência visível antes do caminhão
sair, e cada taxa paga vira um lançamento rastreável que sai em relatório periódico para o
contratante aprovar e reembolsar.

## Fora do escopo

- Cadastro completo de cliente (contatos, contrato, tabela de preço de frete). Isto cadastra **o que
  afeta a entrega**, não o CRM.
- Faturamento. A taxa vira lançamento e relatório; emitir cobrança é do módulo de billing e não
  entra aqui.
- Cálculo de preço de frete ao contratante. `freight_rules` continua dona disso.
- Agendamento automático por integração com portal do cliente (Neogrid, ESL e afins). Ver Dúvidas.

## Decisões

### D1 — O cliente é o CNPJ/CPF do destinatário, e ele se liga sozinho

`delivery_clients` tem `(company_id, tax_id)` como chave. Quando uma NF-e é importada, o `tax_id` do
participante destinatário resolve o cadastro — sem ninguém vincular nada à mão.

Uma loja com CNPJ próprio é um cliente. Duas lojas da mesma rede são dois cadastros, porque na
prática elas têm horários diferentes e taxas diferentes, e forçar a rede inteira num registro só
troca digitação por erro.

**O cadastro nasce sozinho, da nota.** Quando uma NF-e é importada (upload ou distribuição SEFAZ), o
destinatário vira uma linha em `delivery_clients` se ainda não existir — sem ninguém digitar. Ao fim
de um mês de operação, a base de "para quem nós entregamos" existe por completo, com endereços vistos
e histórico de entregas, e serve para busca, para o painel por cliente e para a conversa comercial.

**Mas nascer não é ter regra.** A linha nasce com identidade (documento, nome, endereços vistos) e
**sem** janela, sem taxa e sem `requires_scheduling`. Essas três são preenchidas à mão, só para os
clientes que de fato as têm — que é a minoria. É a distinção que faz a coisa funcionar: um registro
automático que já viesse com regra em branco tratada como regra real faria toda parada ganhar janela
vazia e taxa zero explícitas, e o solver teria de distinguir "sem janela" de "janela não preenchida".
Aqui não precisa: ausência de janela é ausência, tenha o cliente cadastro ou não.

O cadastro automático também **nunca sobrescreve** o que um humano preencheu. Nota nova do mesmo CNPJ
com nome diferente atualiza o nome visto e registra a variação; não toca janela, taxa nem
agendamento.

Herança por raiz de CNPJ continua fora: o cadastro é plano. Ela é fácil de adicionar depois (a raiz
vira um segundo registro consultado quando o específico não tem regra) e difícil de remover.

### D1b — O contratante é o embarcador, e ele já está na nota

O lote de repasse é endereçado a **quem contratou o frete**: o embarcador que descarrega a carga no
barracão para a transportadora separar, montar as rotas e entregar. No caso real que motivou esta
spec, é o Spani.

Ele já está em toda NF-e — é o **emitente/remetente** de `nfe_participants`. Então `contractors`
nasce com a mesma forma de `delivery_clients`: `(company_id, tax_id)` único, resolvido sozinho pelo
emitente da nota, e **cadastro é exceção** pelo mesmo motivo. A diferença é o que cada um guarda:
o cliente de entrega guarda hora e taxa; o contratante guarda o **período de fechamento** (quinzena,
mês), para quem o relatório vai, e a política de repasse.

Isto muda o desenho do lote: `extra_charge_batches` agrupa por `contractor_id`, e o
`contractor_id` de um lançamento vem do **emitente da nota que gerou a entrega** — não de uma
escolha na tela. Escolher o contratante à mão num lote de 38 lançamentos é escolher errado uma vez
e descobrir no fechamento.

**Um detalhe da operação que o modelo precisa respeitar:** o embarcador descarrega _várias_ cargas
de uma vez, e a transportadora reagrupa em rotas próprias. Ou seja, uma viagem mistura notas de
contratantes diferentes — normal, e é por isso que o contratante é **do lançamento**, nunca da
viagem. Um lote nunca é "as taxas da viagem X"; é "as taxas do contratante Y no período Z", e elas
vêm de viagens diferentes.

### D2b — O feriado é do município, não do cliente

A janela responde "que horas", e o feriado responde "hoje não". São perguntas diferentes, e a
segunda é **da cidade**: quando Sertãozinho fecha, fecham os quarenta clientes de lá. Repetir a
mesma data em quarenta cadastros é o caminho mais curto para trinta e nove ficarem desatualizados.

`municipal_holidays` guarda `(company_id, city_ibge_code, holiday_on)` e o nome. A parada sabe o
município pelo endereço do destinatário — a mesma chave que decide CT-e ou NFS-e na 065.

A precedência é do mais específico para o mais geral, e ela importa: **exceção do cliente vence
feriado do município**. O CD que trabalha no feriado da cidade cadastra a exceção que abre, e ela
manda. Sem isso, o cliente que abre no feriado seria invisível para o roteiro justamente no dia em
que ele é o único aberto.

### D2 — A janela é semanal, com exceções por data

`delivery_client_windows`: dia da semana, hora de início, hora de fim. Vários intervalos por dia
(recebe 8h–11h e 14h–16h, com o almoço fechado — e o almoço fechado é a razão de a janela ser uma
lista e não duas colunas).

`delivery_client_exceptions`: data específica que fecha (feriado próprio, balanço, inventário) ou que
abre em horário diferente. Sem isso, o roteiro de 24 de dezembro é montado como o de uma terça
qualquer.

O fuso é o da empresa, declarado. Uma janela sem fuso explícito é uma janela que muda de sentido no
horário de verão.

### D3 — Agendamento é uma pendência da viagem, e ela bloqueia

`requires_scheduling` no cliente. Quando uma nota de cliente assim entra numa viagem, nasce
`trip_stop_schedules`: `status` (`pending|requested|confirmed|refused`), `scheduled_at`, protocolo, e
quem confirmou.

A regra que dá valor a isso: **a viagem não vai a `dispatched` com agendamento `pending` ou
`refused`** (056 D2). Sai por `409 TRIP_HAS_UNSCHEDULED_STOPS`, com a lista das paradas. E aceita o
mesmo `force` + motivo do despacho com pendência — porque "vou tentar assim mesmo" é uma decisão real
da operação, e o que não pode é ela acontecer sem alguém assinar.

O protocolo do agendamento viaja até o motorista na 057: ele chega na portaria e precisa dizer o
número. Um agendamento que o sistema conhece e o motorista não é um agendamento que não existe.

### D4 — A taxa é um custo lançado quando ela acontece, não uma estimativa

Duas coisas diferentes, e confundi-las é o erro clássico:

1. **`delivery_fee_amount` no cliente** — o valor esperado. Serve ao solver (058) e à previsão de
   custo da viagem. É expectativa, não fato.
2. **`delivery_charges`** — o lançamento. Nasce quando a entrega acontece, com valor **real**,
   `charge_type`, comprovante opcional, e a nota/parada de origem.

**Quem lança é funcionário da transportadora, sob `trip.manage` — nunca o motorista pelo PWA.** O
motorista é quem _vê_ a taxa acontecer, mas o lançamento é dinheiro que vai ser cobrado de outra
empresa, e ele precisa de conferência antes de virar linha de relatório. A 057 não ganha tela de
lançamento; ela ganha, no máximo, um campo de observação da entrega que o escritório lê ao lançar.

O corolário é que a taxa pode ser lançada **depois** da entrega — o comprovante em papel volta com o
motorista no fim do dia. Então o lançamento aceita data retroativa dentro do período aberto, e o
fechamento do lote é o que corta.

O real diverge do esperado o tempo todo, e é justamente a divergência que interessa a quem paga.
Guardar só o esperado é não ter o que repassar; guardar só o real é não conseguir prever a viagem.

Valor monetário em `numeric`, nunca `real` nem `double` (`database.md`).

### D4b — A taxa que se repete vira regra, e a regra propõe sozinha

Taxa de descarga do mesmo cliente é a mesma toda semana. Redigitar isso trinta vezes por mês é onde
o lançamento começa a ser esquecido — e taxa esquecida é prejuízo silencioso, o pior tipo.

Então, ao lançar, o funcionário pode marcar **recorrente**. Isso não guarda um lançamento repetido:
guarda uma **regra** em `delivery_client_charge_rules` — cliente + `charge_type` + valor esperado.
Dali em diante, toda entrega concluída naquele cliente faz o sistema **identificar a taxa sozinho** e
propor o lançamento já preenchido.

**Proposto, não lançado.** Nasce em `suggested`, e um toque de confirmação o leva a `recorded`. A
diferença é a razão inteira de a regra existir com segurança: o valor muda (o CD reajustou a taxa de
descarga), a entrega às vezes não gera a cobrança (o motorista descarregou na doca livre), e o
lançamento é dinheiro cobrado de outra empresa. Uma regra que escreve direto em `recorded` produz,
seis meses depois, um relatório com taxas que ninguém pagou — e a conversa que vem disso custa mais
que a digitação que ela economizou.

Na prática o trabalho vira uma fila: "12 taxas sugeridas hoje", conferir e confirmar em lote, com o
valor editável na hora. Sugestão não confirmada até o fechamento do período **não entra no lote** e
fica visível como pendência, nunca some.

A regra é desligável a qualquer momento, e o histórico de quem ligou e desligou fica na trilha.

### D4c — O motorista não lança, mas ele avisa

A D4 tira o lançamento das mãos do motorista, e isso deixaria um buraco: quem está lá quando a coisa
acontece é ele. A ponte é a **ocorrência**.

Quando algo sai do previsto — cobraram taxa não combinada, o cliente exigiu agendamento que ninguém
tinha, a doca estava interditada e ele esperou duas horas, a mercadoria chegou avariada, o endereço
não existe — o motorista registra uma ocorrência na 057: tipo (lista fechada), descrição curta, foto
opcional. Leva segundos e não pede decisão nenhuma dele.

A ocorrência **não é uma cobrança**; ela é o aviso de que talvez exista uma. Ocorrência do tipo
cobrança cai na mesma fila de sugestões da D4b, com a foto do recibo anexada, e o escritório
confirma o valor. As demais viram pendência operacional: espera longa alimenta o tempo medido da
D6, endereço inexistente vira correção de pino (058 D4), agendamento surpresa vira cadastro de
cliente (D3).

O ganho é maior que a taxa. Hoje o motivo de a entrega ter dado errado volta por WhatsApp e morre
ali; com ocorrência tipada e presa à parada, ela vira número — e "esse cliente nos custa duas horas
de espera por semana" deixa de ser impressão.

Ocorrência **não** substitui a não-entrega: uma nota pode ter ocorrência e ser entregue normalmente
(esperou duas horas, mas entregou). São eixos independentes, e juntá-los perderia o caso mais comum.

### D5 — O repasse tem um ciclo, e ele é de aprovação

O lançamento não vira dinheiro sozinho. Ele anda:

`suggested` → `recorded` → `submitted` → `approved` | `rejected` → `reimbursed`

- **`suggested`**: proposta por uma regra recorrente (D4b) ou por uma ocorrência do motorista (D4c).
  Ainda não é um fato. Só existe neste estado o que nasceu automático — lançamento manual entra
  direto em `recorded`.
- **`recorded`**: a taxa aconteceu, foi conferida por gente e está registrada.
- **`submitted`**: entrou num lote de repasse enviado ao contratante, com relatório.
- **`approved` / `rejected`**: o contratante decidiu, e a rejeição carrega motivo.
- **`reimbursed`**: o valor voltou.

`extra_charge_batches` agrupa por `contractor_id` (D1b) e por período (quinzena, mês — configurável
no contratante), gera o relatório e guarda a decisão. Cada transição com ator, hora e trilha (`security.md` §10) — é dinheiro
entre duas empresas, e a pergunta "quem aprovou isso?" vai ser feita.

**A página de custos que consome isto ainda não existe**, e esta spec não a constrói. O que ela
constrói é o dado no formato certo para ela: lançamento com estado, lote com período, relatório
exportável. Uma tela mínima de conferência e exportação entra como P2; o portal de aprovação do
contratante é spec futura.

**Respondido: o contratante aprova numa página pública da nossa landing.** Ele não ganha conta, nem
papel, nem tela do produto — ganha um **link**. `extra_charge_batches` guarda um token opaco, e
`/repasse/{token}` na landing mostra o relatório do lote e os dois botões, por lançamento.

É o meio-termo que o caso real pede: aprovar dentro do produto sem construir portal. As
consequências, que o desenho tem de respeitar:

- **O token é a credencial**, então ele é opaco, longo, de uso não enumerável, e a rota vive fora do
  roteador autenticado — ao lado de `/public/nfse-callbacks/{token}`, que já é assim.
- **Quem decidiu é quem tem o link**, e é isso que a trilha registra: `decided_by_token` mais IP e
  hora, nunca um `userId` inventado. A pergunta "quem aprovou isso?" se responde com "quem estava
  com o link do lote", e essa é a resposta honesta.
- **A página não expõe mais nada.** Ela serve um lote, dele mesmo: nem lista de lotes, nem busca por
  documento, nem nome de outro contratante. Token vazado alcança um período de um contratante.
- **Revogável**: fechar o lote de novo gira o token, e o antigo deixa de abrir.

### D6 — O tempo real de atendimento é medido, e ele volta para a rota

A 057 grava `arrived_at` e `completed_at` de cada parada. Agregado por cliente, isso responde quanto
tempo aquele cliente realmente consome — e a 058 D6 usa a **mediana** como tempo de serviço no
solver, assim que houver amostra suficiente.

O ganho não é só o ETA. É a conversa que fica possível: um cliente que combina 20 minutos e consome
90 sistematicamente é um cliente cuja tabela precisa mudar, e hoje ninguém consegue provar isso.

**A medição não é uma tabela nova.** Ela é consulta sobre os eventos que a 057 já grava, materializada
se e quando doer. Uma coluna `average_service_time` no cadastro seria mais rápida de ler e estaria
errada uma semana depois.

O mesmo vale para a divergência de janela: quantas vezes a entrega naquele cliente saiu fora da
janela combinada é métrica derivada, não campo.

## Histórias priorizadas

**P1 — cadastrar o cliente que tem hora**
_Dado_ um destinatário que só recebe seg–sex das 8h às 11h,
_quando_ o operador cadastra pelo CNPJ,
_então_ toda parada futura daquele CNPJ carrega a janela, e a sugestão de roteiro (058) a respeita.

**P1 — o roteiro respeita a hora**
_Dado_ uma viagem com uma parada de janela 8h–11h,
_quando_ a sugestão é gerada,
_então_ a parada é sequenciada dentro da janela, ou a violação aparece explícita com quanto tempo
falta.

**P1 — a viagem não sai sem agendamento**
_Dado_ uma viagem com uma parada de cliente `requires_scheduling` sem agendamento,
_quando_ o portão tenta despachar,
_então_ recusa listando a parada, e só aceita com `force` mais motivo.

**P1 — o motorista sabe da hora e do protocolo**
_Dado_ uma parada agendada,
_quando_ o motorista abre a viagem no PWA (057),
_então_ vê a hora marcada e o número do protocolo em destaque, antes do endereço.

**P2 — lançar a taxa que o cliente cobrou**
_Dado_ uma entrega num cliente que cobra R$ 45 de descarga,
_quando_ a taxa é lançada (pelo motorista no PWA ou pelo escritório),
_então_ nasce um `delivery_charge` em `recorded`, com comprovante opcional.

**P2 — fechar o período e mandar para o contratante**
_Dado_ 38 lançamentos do mês de um contratante,
_quando_ o operador fecha o lote,
_então_ gera o relatório com data, cliente, nota, tipo e valor, os lançamentos vão a `submitted`, e
o total confere com a soma.

**P2 — registrar a decisão do contratante**
_Dado_ um lote submetido,
_quando_ a resposta chega,
_então_ cada lançamento é aprovado ou rejeitado com motivo, e o rejeitado fica visível como perda —
não some do relatório.

**P3 — quanto esse cliente realmente custa**
Painel por cliente: tempo mediano de atendimento medido, taxas do período, entregas fora da janela e
viagens perdidas por agendamento.

## Requisitos funcionais

1. `delivery_clients`: `(company_id, tax_id)` único, nome de exibição, `requires_scheduling`,
   `delivery_fee_amount` (numeric, nulo), `default_service_time_minutes` (nulo), `notes`, `status`.
   1b. `contractors` (D1b): `(company_id, tax_id)` único, nome, período de fechamento, destinatário do
   relatório, `status`. `delivery_charges.contractor_id` derivado do emitente da nota.
2. `delivery_client_windows` e `delivery_client_exceptions` (D2), com fuso declarado.
   2b. `municipal_holidays` (D2b): `(company_id, city_ibge_code, holiday_on)` único, com nome.
   Exceção do cliente vence feriado do município.
3. `trip_stop_schedules` (D3), ligada à parada da 056.
4. `delivery_charges` (D4) e `extra_charge_batches` (D5), com a máquina de estados de D5 num módulo
   puro e testável — o mesmo padrão da máquina da 056.
   4b. `delivery_client_charge_rules` (D4b): cliente + `charge_type` + valor esperado + `active`, com
   trilha de ativação. Gatilho na conclusão da entrega gera `delivery_charges` em `suggested`,
   marcando a origem (`recurring` | `occurrence` | `manual`).
   4c. Consumo das ocorrências da 057 (D4c): ocorrência do tipo cobrança vira sugestão com o anexo
   junto; as demais viram pendência operacional listada na viagem.
5. Criação automática de `delivery_clients` (e `contractors`) na importação de NF-e, só com
   identidade — nunca com regra (D1, D1b). Idempotente por `(company_id, tax_id)`, e a criação
   **não** pode fazer a importação falhar: erro ali é registrado e a nota entra assim mesmo.
6. Rotas sob `fleet.manage` (cadastro) e `trip.manage` (agendamento e lançamento):
   - `GET/POST/PATCH /delivery-clients`, `GET /delivery-clients/by-tax-id/:taxId`
   - `GET/POST/PATCH /contractors`, `GET /contractors/by-tax-id/:taxId`
   - `PUT /delivery-clients/:id/windows`, `POST/DELETE .../exceptions`
   - `POST /trips/:id/stops/:stopId/schedule` (pedir, confirmar, recusar)
   - `POST /trips/:id/documents/:documentId/charges` (lançamento manual, entra em `recorded`)
   - `GET /delivery-charges?status=suggested` (a fila de conferência)
   - `POST /delivery-charges/confirm` (confirma em lote, com valor editável)
   - `POST /delivery-charges/:id/dismiss` (descarta a sugestão, com motivo)
   - `PUT /delivery-clients/:id/charge-rules`, `DELETE .../charge-rules/:ruleId`
   - `POST /extra-charge-batches` (fechar período), `POST .../:id/decisions`
   - `GET /extra-charge-batches/:id/report` (exportação)
   - `GET /public/extra-charge-batches/{token}` e `POST .../decisions` — a página da landing (D5),
     **anônimas** e escopadas a um lote só
   - `GET /delivery-clients/:id/metrics` (P3, derivado — D6)
7. `POST /trips/:id/dispatch` passa a validar agendamento pendente (D3).
8. A 057 ganha hora e protocolo na parada, e o **registro de ocorrência** (D4c). **Não** ganha
   lançamento de taxa (D4).
9. A 058 consome janela, taxa e tempo medido (RF-8 de lá).
10. Frontend: workspace de clientes com tabela conforme `docs/frontend/data-tables.md` (ordenação,
    multi-seleção, filtros e paginação em query param), editor de janela semanal, painel de lote.
11. Texto em `*.locale.json`.

## Requisitos não funcionais

- A resolução de cliente numa viagem de 200 paradas é **uma** consulta por lote de `tax_id`, não 200.
- `tax_id` é dado de pessoa quando é CPF: nunca em log (`security.md` §1); a busca por documento é
  por igualdade exata, nunca `LIKE` que permita varrer a base.
- Toda transição de lançamento é idempotente e auditada.
- Valores em `numeric`; nenhuma soma de dinheiro em ponto flutuante em lugar nenhum do caminho,
  inclusive no relatório.
- Multiempresa por construção: `company_id` do contexto autenticado, com teste negativo de
  isolamento (`database.md`).
- O relatório de um período com 500 lançamentos é gerado sem bloquear o event loop — se passar do
  teto, vai para worker (`api.md`).

## Casos extremos e falhas

| Caso                                                           | Comportamento                                                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Destinatário sem cadastro                                      | Caso normal: sem janela, taxa zero, nada na tela (D1).                                                                 |
| Cliente cadastrado com janela vazia                            | Igual a sem janela. A linha existe pela taxa.                                                                          |
| Janela que cruza a meia-noite (22h–02h)                        | Suportada; dois intervalos na representação interna, um na tela.                                                       |
| Feriado nacional                                               | **Não** é tratado aqui — só exceção por data cadastrada. Calendário nacional é Dúvida.                                 |
| Agendamento confirmado e a viagem é replanejada para outro dia | O agendamento é marcado como divergente e reaparece como pendência. Nunca segue calado com a data velha.               |
| Taxa lançada em nota que depois volta como `returned`          | O lançamento permanece: a taxa de agendamento foi paga mesmo sem entregar. Marcado como taxa sem entrega no relatório. |
| Lançamento em lote já `submitted`                              | Recusado; entra no lote seguinte.                                                                                      |
| Viagem com notas de três contratantes                          | Normal (D1b). Os lançamentos vão para três lotes diferentes.                                                           |
| Taxa de uma nota cujo emitente não tem cadastro de contratante | O lançamento existe, sem lote, e aparece na lista de "sem contratante" — nunca é descartado nem atribuído por palpite. |
| Contratante rejeita metade do lote                             | Cada lançamento tem estado próprio; o lote fica parcialmente aprovado, não travado.                                    |
| Cliente inativado com paradas em viagem aberta                 | As paradas mantêm a janela que tinham; o cadastro some das buscas novas.                                               |
| Dois cadastros para o mesmo `tax_id`                           | Impossível por unique. Tentativa devolve `409` com código estável e aponta o existente.                                |

## Critérios de aceite

- [ ] Teste de resolução cliente ← destinatário e contratante ← emitente, incluindo os dois caminhos
      sem regra preenchida.
- [ ] Teste de criação automática na importação: idempotente, sem regra, e falha ali não derruba a
      importação da nota.
- [ ] Teste de que a criação automática **não** sobrescreve janela, taxa nem `requires_scheduling`
      preenchidos por humano.
- [ ] Teste de que uma viagem com notas de contratantes distintos gera lotes distintos.
- [ ] Teste de que o motorista (`trip.report`) **não** consegue lançar taxa.
- [ ] Teste de janela: dentro, fora, dois intervalos no mesmo dia, exceção por data, cruzando a
      meia-noite, feriado do município, e **exceção do cliente vencendo o feriado**.
- [ ] Teste de que a página pública serve **um** lote e nada além, e de que fechar o lote de novo
      gira o token.
- [ ] Teste de que o despacho recusa agendamento pendente e aceita com `force` + motivo.
- [ ] Teste da máquina de estados do lançamento, incluindo **toda** transição inválida — e em
      especial que `suggested` **nunca** alcança `submitted` sem passar por `recorded`.
- [ ] Teste de que a regra recorrente gera exatamente uma sugestão por entrega concluída, e nenhuma
      quando desligada.
- [ ] Teste de que ocorrência de cobrança + regra recorrente no mesmo cliente geram **uma** sugestão.
- [ ] Teste de que sugestão não confirmada fica fora do lote fechado.
- [ ] Teste de que o total do relatório confere com a soma dos lançamentos, em `numeric`.
- [ ] Teste negativo de tenant nas rotas de cliente e de lote.
- [ ] Teste de contagem de queries na resolução de 200 paradas.
- [ ] E2E: cadastrar cliente com janela e taxa → vincular nota → agendar → despachar → entregar →
      lançar taxa → fechar lote → aprovar → relatório fecha.
- [ ] `tsc --noEmit` + `make validate`.
- [ ] Tela conferida em 375px, 768px e 1280px.
- [ ] ADR (**0048** — a 0046 já é do MDF-e) sobre o cliente de entrega existir sem virar CRM, sobre
      o ciclo de repasse e sobre a aprovação por link público.
- [ ] `docs/spec/domain-model.md` atualizado.

## Dúvidas

- **Aprovação do contratante** (respondido): página pública na landing, por token de lote — ver D5.
- **Feriado** (respondido): **calendário por município**, em `municipal_holidays` — `(company_id,
  city_ibge_code, holiday_on)`, com nome. É onde o problema real mora: a cidade fecha e o roteiro
  não sabe, e a exceção por cliente obrigaria a repetir a mesma data em todos os clientes daquela
  cidade. O município da parada já vem do endereço do destinatário (`nfe_addresses.city_code`), que
  é a mesma chave que a 065 usa para decidir CT-e ou NFS-e.

  O cadastro é **da empresa** e alimentado à mão: nenhuma fonte pública de feriado municipal é
  confiável o bastante para virar dependência, e a instalação é dedicada (ADR-0021) — quem opera
  conhece as cidades que atende. Data sem cadastro é dia útil, que é o comportamento de hoje.
- **Agendamento por canal próprio** (respondido): o cliente vai poder agendar **por WhatsApp** ou
  pelo **portal do cliente** (`frontend-client`, não o app do motorista). Os dois são superfícies
  novas e viram specs próprias — a 060 entrega o modelo (`trip_stop_schedules`, protocolo, estados)
  e o agendamento manual pelo painel; os canais consomem essas rotas. Integração com portal de
  terceiro (Neogrid, ESL) continua fora.

## 🤖 Modelo

| Etapa                                          | Modelo    |
| ---------------------------------------------- | --------- |
| Ciclo de repasse, máquina de estados, ADR-0046 | `opus` 🧠 |
| Cadastro, janelas, agendamento, rotas, testes  | `sonnet`  |
| Telas, editor de janela, painel de lote        | `sonnet`  |
| Locale e extração de constantes                | `haiku`   |
