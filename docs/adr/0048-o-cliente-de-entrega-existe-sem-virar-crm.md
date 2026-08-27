# ADR-0048 — O cliente de entrega existe sem virar CRM, e o repasse aprova por link

- **Status:** aceito
- **Data:** 2026-08-27
- **Contexto:** spec 060. Alimenta a 058 (roteirização) e a 057 (a viagem no bolso do motorista).

## Contexto

Hoje não existe cadastro de cliente neste produto. O destinatário é derivado de `nfe_participants` a
cada documento, sem identidade própria — e é assim de propósito: o produto importa nota fiscal, não
gerencia relacionamento comercial.

Só que duas coisas da operação real não cabem na nota. **A hora**: há cliente que só recebe em janela
combinada, e chegar fora dela é voltar com a carga. **O preço**: há cliente que cobra para receber —
descarga, agendamento, plataforma —, e essa taxa é adiantada pela transportadora e cobrada de quem
contratou o frete. As duas vivem na cabeça de quem monta o roteiro e num grupo de WhatsApp.

## Decisão

### 1. O cadastro nasce sozinho, e ele nasce **sem regra**

`delivery_clients` e `contractors` têm `(company_id, tax_id)` único e nascem na importação da NF-e —
o destinatário vira cliente, o emitente vira contratante. Ninguém vincula nada à mão.

**O que nasce é identidade**: documento, nome visto, endereços vistos. Janela, taxa e
`requires_scheduling` ficam **vazios**, e são preenchidos à mão só para quem de fato os tem — que é a
minoria.

Essa distinção é o que faz o desenho funcionar. Um cadastro automático que já viesse com "regra em
branco" tratada como regra faria toda parada ganhar janela vazia e taxa zero explícitas, e o solver
teria de distinguir "sem janela" de "janela não preenchida". Aqui não precisa: **ausência de janela é
ausência**, tenha o cliente cadastro ou não.

Corolário, e ele é bloqueante: **a criação automática nunca sobrescreve o que gente preencheu**, e
**nunca derruba a importação**. Nota nova com nome diferente atualiza o nome visto; erro na criação
do cadastro é registrado e a nota entra assim mesmo. O cadastro é conveniência; a nota é o produto.

### 2. Isto não é CRM, e a fronteira é o que o cadastro **não** guarda

Sem contato, sem contrato, sem tabela de preço de frete, sem funil, sem histórico de conversa. O
cadastro guarda **o que afeta a entrega**. Preço ao contratante continua sendo de `freight_rules`;
faturamento continua sendo do billing.

Herança por raiz de CNPJ fica de fora: o cadastro é plano. Duas lojas da mesma rede são dois
cadastros, porque na prática elas têm horários e taxas diferentes. A herança é fácil de acrescentar
depois (a raiz vira um segundo registro consultado quando o específico não tem regra) e difícil de
remover.

### 3. O feriado é do município; a janela é do cliente

São perguntas diferentes: a janela responde "que horas", o feriado responde "hoje não". A segunda é
da cidade — quando Sertãozinho fecha, fecham os quarenta clientes de lá, e repetir a data em quarenta
cadastros é o caminho mais curto para trinta e nove ficarem desatualizados.

`municipal_holidays` é `(company_id, city_ibge_code, holiday_on)`, alimentado à mão. Nenhuma fonte
pública de feriado **municipal** é confiável o bastante para virar dependência, e a instalação é
dedicada (ADR-0021): quem opera conhece as cidades que atende.

**Exceção do cliente vence feriado do município.** O CD que trabalha no feriado da cidade cadastra a
exceção que abre, e ela manda — sem isso, o único cliente aberto no feriado seria invisível para o
roteiro justamente no dia em que ele importa.

### 4. A taxa esperada e a taxa cobrada são dados diferentes

`delivery_clients.delivery_fee_amount` é **expectativa**: serve ao solver e à previsão de custo.
`delivery_charges` é **fato**: nasce quando a entrega acontece, com o valor real e o comprovante.

Guardar só o esperado é não ter o que repassar; guardar só o real é não conseguir prever a viagem. E
é justamente a divergência entre os dois que interessa a quem paga.

### 5. O que a máquina automatiza nasce **proposto**, nunca lançado

Regra recorrente (a taxa que se repete) e ocorrência do motorista geram `delivery_charges` em
`suggested`. Um toque de gente leva a `recorded`.

A razão de a regra existir com segurança é essa: o valor muda, a entrega às vezes não gera a cobrança,
e o lançamento é **dinheiro cobrado de outra empresa**. Uma regra que escrevesse direto em `recorded`
produziria, seis meses depois, um relatório com taxas que ninguém pagou — e a conversa que vem disso
custa mais que a digitação economizada.

O ciclo é `suggested` → `recorded` → `submitted` → `approved` | `rejected` → `reimbursed`, com
`suggested` alcançável **só** pelo que nasceu automático, e `submitted` inalcançável sem passar por
`recorded`.

### 6. O motorista avisa; ele não lança

Quem está lá quando a taxa acontece é o motorista, e tirar dele o lançamento deixaria um buraco. A
ponte é a **ocorrência**: tipo de lista fechada, descrição curta, foto opcional — segundos, e nenhuma
decisão dele.

A ocorrência **não é uma cobrança**: é o aviso de que talvez exista uma. Ocorrência de cobrança cai
na fila de sugestões com a foto do recibo; as demais viram pendência operacional. O lançamento
continua sendo do escritório, sob `trip.manage`, porque é dinheiro que vai ser cobrado de outra
empresa e precisa de conferência.

### 7. O contratante aprova por **link público**, não por conta

O embarcador não ganha usuário, papel nem tela do produto: ganha um link. O lote guarda um token
opaco, e `/repasse/{token}` na landing serve o relatório daquele lote e os dois botões, por
lançamento.

É aprovar dentro do produto sem construir portal. As consequências, que não são opcionais:

- **o token é a credencial** — opaco, longo, não enumerável, e a rota vive fora do roteador
  autenticado, ao lado de `/public/nfse-callbacks/{token}`, que já é assim;
- **quem decidiu é quem tinha o link**, e é isso que a trilha registra (token, IP, hora) — nunca um
  `userId` inventado. A pergunta "quem aprovou isso?" se responde com "quem estava com o link", e essa
  é a resposta honesta;
- **a página serve um lote e nada além**: sem lista, sem busca por documento, sem nome de outro
  contratante. Token vazado alcança um período de um contratante;
- **fechar o lote de novo gira o token**, e o antigo deixa de abrir.

## Consequências

- O produto passa a ter cadastro de cliente sem passar a ser CRM, e a fronteira está escrita.
- A roteirização (058) ganha janela, taxa esperada e tempo medido sem depender de digitação por
  viagem.
- O despacho ganha um portão novo: agendamento pendente recusa, com o mesmo `force` + motivo do
  despacho com nota pendente (ADR-0043 §2).
- Taxa deixa de ser prejuízo silencioso: ela vira lançamento rastreável, com estado e trilha.
- Aparece uma superfície **anônima** nova. Ela é a segunda do produto (a primeira é o postback da
  NFS-e), e cada uma dessas é dívida de segurança permanente — daí o escopo de um lote só e o giro
  do token.

## Alternativas descartadas

| Alternativa                                    | Por que não                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Cadastro manual de cliente                     | A base nunca ficaria completa, e o valor está justamente em ter todos os destinatários sem digitar     |
| Cadastro automático já com janela e taxa vazias | Obrigaria o solver a distinguir "sem janela" de "janela não preenchida" para sempre                    |
| Feriado nacional por biblioteca                | Resolve o feriado que todo mundo já sabe; o que derruba roteiro é o municipal, e ele não tem fonte     |
| Motorista lançando a taxa pelo PWA             | É dinheiro cobrado de outra empresa, sem conferência, decidido na porta do cliente                     |
| Regra recorrente escrevendo em `recorded`      | Seis meses depois, relatório com taxas que ninguém pagou                                                |
| Portal autenticado para o contratante          | Conta, papel, convite e tela para uma decisão que ele toma duas vezes por mês                          |
| Relatório por e-mail e alguém marca aprovado   | A decisão fica fora do sistema, e a trilha vira "fulano disse que o cliente aprovou"                   |
