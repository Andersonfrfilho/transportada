# ADR-0114 — O vendedor usa o painel, com casca própria, e o servidor é a fronteira

- **Status:** aceito (decisão do Anderson em 2026-11-10: "a área do vendedor fica no app painel"; "esta correto" sobre a spec 316)
- **Data:** 2026-11-10
- **Contexto:** spec 316 (vendedor da contratante e o chat com ele).
- **Emenda a:** [ADR-0050](0050-o-cliente-tem-portal.md) §1, **só para o papel `salesperson`**. O
  contratante continua em `apps/frontend-client` e o motorista em `apps/frontend-driver` ([ADR-0075](0075-o-motorista-tem-app-propria.md)).

## Contexto

A ADR-0050 separou o portal de quem não é funcionário em app própria **por segurança**: o painel carrega frota,
financeiro, fiscal e cadastro, e servir o mesmo bundle a um usuário externo é depender de que toda condicional de
permissão no cliente esteja certa, para sempre.

O vendedor da contratante é um usuário externo com login: conta própria, no mesmo Keycloak, que enxerga as ocorrências
dos clientes da carteira dele e conversa com o escritório. O dono decidiu que a área dele mora **no painel**, não em
`frontend-client` nem em app nova. A decisão pesa o custo de manter mais um build, domínio e deploy contra o risco que
a 0050 descreveu. Esta ADR aceita o desenho do dono e escreve as travas que ocupam o lugar da separação de bundle.

## Decisão

### 1. A fronteira de segurança é o servidor, nunca o bundle

O bundle do painel é código, não dado. Quem vê o quê é decidido na API: o vendedor só recebe pelo servidor os dados
da própria carteira. Se um vendedor abrir o bundle inteiro, não ganha nenhum dado, só rotas que respondem `403`.
Por isso a separação de app (0050 §1) é trocada, para este papel, por **contratos que provam o recorte no servidor**.

### 2. Papel e permissões próprios

Papel novo `salesperson`, distinto de `contractor` e de qualquer papel do escritório, com **duas** permissões:
`salesperson.read` e `salesperson.reply`. Nenhuma das duas é concedida a papel de dentro (mesmo raciocínio de
`deliveries.track` na 0050 §2): o escritório lê e responde a conversa do vendedor pelas permissões de ocorrência que já
tem. O papel `salesperson` **não herda** `trip.*`, `fleet.*`, `invoices.*`, `occurrences.resolve` nem qualquer outro.

### 3. O recorte vem da carteira, não do papel nem do corpo da requisição

O vendedor entra por convite, como todo usuário (membership), amarrado a `contractor_salespeople.membership_id`. O que ele
enxerga sai da carteira (`contractor_salesperson_clients` das contratantes às quais está ligado). Rotas em
`/me/salesperson/*` **não recebem id de vendedor, de contratante, de cliente nem de ocorrência fora da carteira**: o
servidor resolve pela conta e confere cada id pedido contra a carteira (BOLA, como a 0050 §4). `companyId` vem do
contexto autenticado.

### 4. Contrato negativo de rotas

Como o bundle deixa de ser fronteira, entra um contrato que percorre **toda a tabela de rotas** da API e exige que o papel
`salesperson` receba `403` em todas, exceto numa lista explícita de rotas `/me/salesperson/*` e das rotas de sessão
(`/auth/me`, notificações próprias). Rota nova sem permissão declarada falha o contrato. Mais os contratos de isolamento:
vendedor A não lê cliente do vendedor B; contratante X não lê a Y; outra empresa nunca.

### 5. Casca mínima no painel

- O vendedor cai em `/vendedor/*` depois do login; qualquer outro caminho redireciona para lá. O papel não vê o menu do escritório.
- A casca é uma árvore de rotas à parte (`modules/salesperson`), carregada sob demanda, com layout próprio. Ela importa
  só componentes compartilhados do design system e o módulo de conversa; **nunca** módulos do escritório (frota, fiscal,
  faturamento). Um contrato de dependência (padrão dos contratos de paridade do repositório) quebra o build se importar.
- Isto reduz superfície e confusão, mas **não** é a fronteira: a fronteira é o item 1.

### 6. Dado mínimo no payload

O vendedor vê: ocorrência, tipo, cliente da carteira, endereço e observação do motorista, anexos da conversa dele e o chat.
Sem placa, sem nome ou telefone do motorista, sem valor de frete, sem dados de outras contratantes. O payload mínimo é
**contrato de teste**, como na 0050 §4.

### 7. Gatilho de revisão

Se aparecer vazamento, se o número de vendedores crescer a ponto de a superfície pesar, ou se o dono pedir, a casca
(`modules/salesperson` + rotas `/me/salesperson/*`) sai para app própria. O isolamento de dependências do item 5 existe
justamente para essa extração ser barata.

## Consequências

- O vendedor recebe o bundle inteiro do painel (código, sem dados). Aceito pelo dono; a compensação é o contrato do item 4.
- Todo endpoint novo do produto passa a ser coberto pelo contrato negativo do vendedor. Custo pequeno, benefício contínuo.
- Mudança no realm (papel `salesperson`) vai em `deploy/keycloak/realm.json` e na reconciliação, nunca por ajuste manual.
- A spec 316 (tasks T3.x) implementa a casca e os contratos; antes de qualquer tela do vendedor, o contrato negativo do item 4 precisa existir (T3.2).

## Alternativas descartadas

| Alternativa                                     | Por que não                                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Módulo no `frontend-client`                     | Era a recomendação inicial da spec; o dono preferiu o painel (uma só área de trabalho do escritório) |
| App nova para o vendedor                        | Mais um build, domínio e deploy para um público pequeno; fica como gatilho de revisão (item 7)       |
| Vendedor como papel `contractor`                | `contractor` recorta por documentos da contratante, não por carteira de clientes                     |
| Esconder o menu e confiar nas condicionais      | É exatamente o risco da 0050 §1; sem contrato no servidor não há fronteira                           |
| Conceder `salesperson.*` a papéis do escritório | Cria segundo caminho de leitura para manter alinhado com as permissões de ocorrência                 |
