# ADR 0041 — A landing é genérica, e o SDK de usuário entra por ela

- Status: aceito
- Data: 2026-08-23
- Decisores: mantenedor do projeto e revisão Opus
- Não altera a **ADR-0021** (a empresa é o ambiente): a landing serve a empresa do deploy, e nenhuma
  rota nova cria empresa
- Reusa a decisão de origem própria de imagem e a de CEP servido de casa (**ADR-0040**)
- Fecha a decisão da spec 053

## Contexto

O pedido foi uma landing page de uma transportadora específica, com pré-cadastro de agregado, usando
"nosso SDK" para criar usuário. Três coisas mudaram o desenho durante a análise, e cada uma custa uma
decisão:

- **O produto é genérico.** A instalação é por transportadora (ADR-0021), e uma landing com o nome de
  um cliente no código seria a primeira regra de cliente específico dentro do repositório. Ela precisa
  nascer configurável, ou nasce para ser reescrita na segunda venda.
- **A empresa que compra pode ter filiais.** Uma transportadora costuma ter mais de um CNPJ, e as
  filiais compartilham a mesma marca e a mesma landing. Isso decide por onde a configuração é chaveada.
- **O SDK não atende inteiro.** A auditoria de `@adatechnology/user-module`, `user-contracts` e
  `user-ui` (versões `0.1.0-rc.2`, `0.1.0-rc.2` e `0.1.0-rc.1`) encontrou sete pontos em que o pacote
  não cobre o que a spec pede — o mais caro deles em design. Adotar sem registrar isso deixaria o
  próximo leitor concluindo que o SDK falhou, quando a adoção é que foi parcial de propósito.

## Decisão

### 1. A landing é app própria, e a configuração dela é dado, não build

`apps/frontend-landing/`. A configuração — marca, contatos, logo, cor de destaque, títulos e itens de
seção, seção ligada ou desligada — chega em tempo de execução por `GET /public/landing-settings`.

`VITE_*` é o caminho errado aqui, e a razão é mecânica: o Vite **inlina o literal no bundle**. Trocar
um telefone no rodapé viraria rebuild e redeploy, e quem opera a instalação do cliente não tem esse
botão. O que é `VITE_*` continua sendo só o que o bundle precisa para existir (URL da API, ambiente).

### 2. O que é configurável tem borda, e a borda é o formulário

Configurável: marca, contatos, logo, cor de destaque, textos e itens das seções, e ligar/desligar
seção. **Fixos**: a ordem e o layout das seções, quais seções existem, e **os campos do formulário de
pré-cadastro**.

O corte é o que impede a landing de virar um CMS. Os campos do formulário são colunas de
`aggregate_applications` que alimentam o mesmo caminho de `POST /fleet/drivers` — campo configurável
ali seria coluna configurável, e a aprovação deixaria de ter contrato.

### 3. Conteúdo escrito pelo cliente nunca vira marcação

A cor entra como hexadecimal validado e sai como `--color-accent`, nunca como CSS. O texto é texto,
com no máximo `*negrito*` e `_itálico_`, renderizado por `createElement` — a mesma regra que já vale
para o texto do fluxo de conversa. Nenhum `dangerouslySetInnerHTML` com conteúdo de origem do cliente.

### 4. O logo é o que já existe, com um irmão público

`company_logos` é reusado inteiro — mesma tabela, mesmo limite de 256 KiB, mesmos dois tipos. O que
nasce é `GET /public/landing-logo`, irmão público do que o painel já serve, com `ETag` vindo do
`sha256` gravado e cache público (a rota do painel é `no-store` de propósito, e continua).

Servir da nossa origem é o que mantém a CSP fechada. Aceitar URL colada pelo cliente obrigaria
`img-src *`, e trocaria uma coluna por uma diretiva aberta para sempre.

### 5. `landing_settings` é por **raiz de CNPJ**, não por empresa

Filial compartilha a raiz por definição legal — os oito primeiros caracteres do documento, o
`CNPJ_ROOT_PATTERN` que a API já tem em `shared/tax-id.service.ts`. Uma coluna `parent_company_id`
resolveria o mesmo hoje e criaria uma segunda verdade amanhã: quando ela discordar do CNPJ, **quem
está errado é a coluna**.

A filial aparece como "Unidade" no formulário e como cartão em "Onde estamos"; com uma empresa só, o
campo não é renderizado. `aggregate_applications.company_id` é a filial escolhida.

Consequência que não se resolve aqui: **filial ainda não é criável**. `PROVISION_COMPANY_ID` é
singular, não há `POST /companies`, `companies.manage` segue excluída de `CompanyPermission`, e o
token carrega uma empresa. A landing não fica bloqueada por isso — com uma empresa ela funciona
inteira. Criar filial é a **spec 054**.

### 6. O pré-cadastro é fila, e a resposta é invariável

`aggregate_applications` com `pending · approved · rejected · withdrawn`, e unicidade
`(company_id, tax_id)` **parcial em `pending`**: o mesmo candidato pode se recandidatar depois de uma
recusa, mas não empilhar pedidos abertos.

`POST /public/aggregate-applications` responde **202 sempre**. Rota anônima que distinguisse "já
existe" de "criado" viraria sonda de "este CPF já é agregado de vocês?" — a mesma razão pela qual
`POST /password-resets` responde 204 invariável. Aprovar chama o mesmo use case de `POST
/fleet/drivers`, na mesma transação: o agregado aprovado é um motorista, não um registro paralelo.

**A checagem de existência existe, e responde ao operador.** Toda submissão é conferida contra
candidatura aberta, motorista da raiz do grupo e conta de landing, na mesma transação e antes de
gravar: reenvio atualiza a candidatura em vez de empilhar outra, e colisão com motorista grava
`duplicate_driver_id`. Nada disso muda a resposta ao anônimo — o resultado aparece como distintivo na
aba Candidaturas, e aprovar um duplicado vincula à ficha existente. Por isso **não** há rota pública
de verificação: uma que responda sim ou não é exatamente a sonda que o 202 fecha. A garantia final
continua sendo o banco; a conferência prévia é conveniência, e entre ela e o `INSERT` cabe outra
escrita — a mesma leitura da regra de campo único do frontend.

Duplicado não recusa sozinho: motorista desligado que volta e ficha antiga de outra unidade são casos
reais, e a decisão é do operador.

### 7. Do SDK entra a camada headless, e só ela

Adoção parcial declarada. O que a auditoria achou, e o que se faz com cada ponto:

| Ponto       | O que o SDK faz                                                                   | Decisão                                                               |
| ----------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Estilo      | `user-ui` fixa classes Tailwind no `.tsx` e não expõe `className`, slot nem token | não usamos componente renderizado — este repositório não tem Tailwind |
| Rótulos     | `labels` é a única customização                                                   | serve, e é o que sobra da camada visual                               |
| Schema      | `pgSchema('user')`, tabelas próprias de usuário e sessão                          | montado em schema Postgres próprio, só para a landing                 |
| `companyId` | `varchar(64)` anulável                                                            | não é fonte de tenant; o tenant continua vindo do nosso contexto      |
| `role`      | `varchar(40)` livre                                                               | não substitui `membership_roles`                                      |
| Criação     | `createUserSchema` exige e-mail, nome, senha e papel                              | não há conceito de candidatura no pacote; a fila é nossa              |
| Recuperação | 202 que não revela existência                                                     | alinhado com o que já fazemos                                         |

O `identity` do painel **não muda**, e o Keycloak não é tocado. Um contrato
(`test/account/sdk-headless-only.contract.ts`) reprova se algum export renderizado do `user-ui` for
importado — a regra vale enquanto o pacote não publicar API de estilo, e é o teste que avisa quando
alguém tentar contornar.

### 8. A aba **Site** é exceção declarada a "configuração perto do efeito"

A regra manda o painel de configuração morar na tela onde o efeito aparece. Aqui o efeito aparece em
**outra app**, que o operador não tem aberta. A aba Site fica em `company-settings`, e a exceção é
registrada aqui para não ser lida como esquecimento.

## Consequências

- **A segunda venda não pede reescrita da landing** — pede preencher a aba Site. É o resultado que
  justifica todo o resto da ADR.
- **Nasce uma rota pública nova numa API que só tinha duas** (as de recuperação de senha), e ela
  **também sobe sem limitador**, como todas. O achado de `docs/SECURITY.md` sobre a ausência de rate
  limit ganha um consumidor a mais, e o 202 invariável é o que limita o estrago enquanto o limitador
  não existe.
- **Passa a haver dois depósitos de usuário no mesmo Postgres**, em schemas separados e com fronteira
  escrita. É o preço da adoção do SDK, e é reversível: nada do painel depende dele.
- **`user-ui` fica adotado pela metade**, e a metade de fora é a visual. Se o pacote publicar API de
  estilo, a decisão a rever é o contrato do item 7 — não esta ADR inteira.
- **A raiz de CNPJ vira chave de configuração antes de a filial existir.** A tabela nasce certa e
  serve o caso de uma empresa sem nenhum desconto; a 054 encontra o lugar pronto.
- Se um dia a landing precisar de seção nova, a decisão a tomar é sobre o item 2 — o corte entre
  configurável e fixo —, e não sobre acrescentar mais um campo livre. ADR nova.
