# ADR-0022: O primeiro acesso cria o administrador no Keycloak, e a rota se desliga

## Contexto

A ADR-0021 fixou que a empresa é o ambiente e que o arranque é provisionamento idempotente. O comando
existe e funciona (`environment-provisioning.service.ts`, feature 026 T000b), mas exige
`PROVISION_ADMIN_SUBJECT` — o `sub` de um usuário **criado à mão no console do Keycloak**. O arranque,
portanto, nunca fechou: ele pressupõe um passo manual que a ADR-0021 registrou como pendência e que
`docs/spec/railway.md:96` ainda descreve como "passo manual por ambiente".

O sintoma apareceu em staging. O ambiente subiu com as 41 migrations aplicadas e o banco vazio de
identidade:

```
{"companies":0,"memberships":0,"identities":0}
{"appliedMigrations":41}
```

Um usuário criado no console loga, recebe um token válido e leva `403` em toda rota autenticada:
`tenantContext.resolveCompany` procura membership ativo pelo par issuer + `sub`, não acha e recusa
(`tenant-context.service.ts:29-34`). Não é bug — é a ADR-0003 valendo: claims de papel do JWT não
participam da matriz de permissão, autorização nasce do vínculo no banco.

A raiz é que a identidade vive em dois lugares e nada as costura. O Keycloak responde "quem é você";
o banco da aplicação responde "o que você pode fazer". Criar de um lado só produz um usuário que
autentica e não autoriza.

A redação original da 026 resolvia isso em T000c — o comando de provisionamento passaria a criar o
usuário desabilitado no Keycloak e a emitir o primeiro código de ativação. Mas T000c depende de T010,
ou seja, das rotas de convite inteiras: o ambiente continua inutilizável até a fase C terminar. Para
um produto cujo modelo de distribuição é "um deploy por transportadora", um ambiente que não abre
sozinho é um custo de onboarding em cada venda.

## Decisão

### 1. O app é a fonte da verdade da identidade; o Keycloak guarda a credencial

A sincronização é de mão única — aplicação → Keycloak — pela Admin API, com service account e
`client_credentials`. Não existe job bidirecional, não existe password grant, e o Keycloak nunca é
editado à mão como parte do fluxo normal.

Consequência de contrato: quem cria usuário é o produto. O console do Keycloak vira ferramenta de
contingência, não etapa de operação.

### 2. Existe uma rota de primeiro acesso, e ela é de uso único

`POST /bootstrap/first-admin`, não autenticada, protegida por um segredo de ambiente
(`BOOTSTRAP_TOKEN`) comparado com `timingSafeEqual` sobre digests de tamanho fixo. Ela:

- recusa se já existir vínculo ativo com papel `company-admin` na empresa do ambiente;
- recusa se `BOOTSTRAP_TOKEN` não estiver configurado — **fail-closed**, sem valor padrão e sem
  fallback para string vazia;
- recusa se a empresa do ambiente ainda não existir, isto é, se o provisionamento não rodou;
- cria o usuário no Keycloak habilitado, com o atributo `company_id` da empresa do ambiente e a senha
  definida pela própria pessoa no formulário;
- cria usuário de identidade, identidade externa, vínculo e papel `company-admin` na mesma transação,
  sob o mesmo advisory lock do provisionamento;
- grava trilha de auditoria com ator, IP, timestamp e o `sub` criado.

Toda recusa responde `404` com corpo uniforme. `403` distinguiria "ambiente já provisionado" de
"token errado" e transformaria a rota num oráculo sobre o estado da instalação.

"Se desliga" é estado, não configuração: a condição de desligamento é a existência do primeiro
`company-admin`. Não há flag para reabrir, e reabrir exige intervenção no banco — deliberadamente.

#### Emenda (10/08/2026): a tela precisa saber que a porta fechou

A rota se desligou como previsto, mas `/primeiro-acesso` continuou sendo servida. Depois do arranque
de production, quem abrisse o endereço via um formulário completo que não tinha como concluir — e o
404 uniforme, por construção, não dá ao cliente como distinguir "já provisionado" de "token errado",
então a tela não podia nem reagir à recusa do `POST` sem expulsar quem apenas digitou o token errado.

Passa a existir `GET /bootstrap/first-admin`, anônima: `204` enquanto o arranque está aberto, o mesmo
`404` uniforme depois. A tela fechada não renderiza o formulário e sai para o login.

O `404` é uniforme entre as recusas do arranque — token ausente, empresa inexistente, já provisionado
respondem todos igual —, não entre o arranque e o resto da API: para quem chega sem token, caminho
desconhecido cai na autenticação e volta `401`, então o `404` denuncia que este caminho existe. Isso
não é novo nem foi introduzido aqui: o `POST` já respondia assim desde a decisão original.

Isto **é** o oráculo que o parágrafo acima recusa, e a recusa continua valendo para o `POST`. O que
mudou é o alcance do que se admite revelar:

- a sondagem **não recebe token**. Aceitá-lo trocaria um oráculo sobre o estado da instalação por um
  oráculo sobre o segredo — um lugar barato para adivinhar o arranque, que é bem pior;
- ela não cria nada, não autentica ninguém e reusa a mesma leitura do guarda (`readAvailability`),
  para a tela e a rota não contarem histórias diferentes;
- ela responde `404` também quando `BOOTSTRAP_TOKEN` não está configurado, o que amarra a §5: tirar a
  variável do ambiente some com a tela junto;
- o que ela revela — "esta instalação ainda não foi provisionada" — já é observável de fora, já que
  ninguém consegue logar numa instalação sem administrador;
- quem impede a criação de um segundo administrador continua sendo o `POST`: token em `timingSafeEqual`,
  `pg_advisory_xact_lock` com rechecagem dentro da transação, e a recusa uniforme. A sondagem é
  conforto de tela, nunca controle de acesso — e qualquer `curl` a ignora, como deve ser.

No cliente a sondagem **falha aberta**: erro de rede ou 5xx mantém o formulário de pé. Errar para o
lado do formulário é reversível; errar para o lado do redirecionamento trancaria uma instalação nova
fora do próprio arranque toda vez que a API oscilasse.

### 3. `PROVISION_ADMIN_SUBJECT` deixa de ser obrigatório, por expansão

Hoje declarar só uma das duas variáveis de provisionamento falha o deploy. Passa a valer:
`PROVISION_COMPANY_ID` sozinho é configuração completa e válida — garante a empresa do ambiente e
para por aí, deixando o administrador para o primeiro acesso. `PROVISION_ADMIN_SUBJECT` sozinho
continua sendo erro.

O caminho antigo (as duas variáveis juntas) continua funcionando e testado enquanto a rota nova não
estiver em produção. A contração — remover `PROVISION_ADMIN_SUBJECT` — é migration de configuração e
entra depois, num commit próprio.

### 4. Dado fiscal da empresa não passa por rota não autenticada

O primeiro acesso é um assistente de dois passos, e só o primeiro é anônimo:

1. bootstrap cria o administrador (rota acima);
2. a pessoa loga e a tela Empresa, ao ver perfil nulo, abre o formulário e grava por
   `PATCH /company-settings`, que já valida a entrada, já exige `settings.manage` e já resolve
   bloqueio otimista e idempotência.

Duplicar a validação do perfil fiscal numa rota anônima criaria duas fontes de verdade para CNPJ,
inscrição estadual e regime tributário, e colocaria dado de empresa atrás de um segredo de arranque
em vez de atrás de autenticação. Da perspectiva de quem usa continua sendo um assistente único.

### 5. O token de bootstrap é segredo de ambiente, com ciclo de vida curto

Gerado por ambiente, nunca igual entre ambientes, nunca commitado e removido do Railway assim que o
primeiro acesso conclui. A rota morrer já o inutiliza; remover a variável evita que ele fique
disponível para quem tiver acesso ao painel depois.

## Consequências

- A feature 026 muda: T000c é reescrita nestes termos e a fase A — o pacote
  `@adatechnology/keycloak-admin` — deixa de ser pré-requisito distante e vira o primeiro dominó.
- O realm ganha um client confidencial de service account com `manage-users` no `realm-management`.
  ⚠️ O import do realm ignora realm já existente, então **ambientes já criados não recebem esse client
  pelo deploy**: numa instalação viva ele entra por `partialImport` da Admin API ou pelo console.
  Instalações novas nascem com ele. Staging não é instalação viva — o banco tem só o registro de
  migrations, sem nenhum dado de negócio, e o reset está autorizado; lá o caminho é apagar o realm
  `transportada` e deixar o próximo deploy reimportar limpo.
- `docs/spec/railway.md` perde o passo manual do console e ganha `BOOTSTRAP_TOKEN` na lista de
  segredos por ambiente. `docs/ops/keycloak-first-admin.md` deixa de ser o caminho previsto e passa a
  ser runbook de contingência.
- Mais um segredo por ambiente para gerar, guardar e descartar.
- Risco aceito: se `BOOTSTRAP_TOKEN` vazar antes do primeiro acesso, quem o tiver vira administrador
  da instalação. Contenção: a rota morre no primeiro uso, a criação fica na trilha de auditoria com
  IP e horário, e a variável é removida ao fim do arranque. A alternativa sem segredo — "o primeiro
  que acessar vence" — foi descartada por deixar a janela aberta a qualquer um que descubra o
  domínio.
- Caminho preservado: quando a fase C entregar convite e ativação, a rota de bootstrap passa a emitir
  código de ativação em vez de aceitar senha, sem mudar o contrato visto de fora.
