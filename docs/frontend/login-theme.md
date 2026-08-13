# Tela de login (tema Keycloak)

A tela de login não é do frontend: ela é servida pelo Keycloak, a partir do tema em
`deploy/keycloak/theme/`. O `compose.yaml` monta esse diretório em modo leitura no container local
e o `deploy/keycloak/Dockerfile` copia o mesmo diretório para a imagem — **um único tema para os
dois caminhos**, para o que se vê em `local` ser o que sobe.

O realm aponta para ele por `loginTheme: transportada` em `deploy/keycloak/realm.json` (e no
`realm/` local). Sem essa linha o Keycloak serve o tema de fábrica e nada aqui aparece.

## Por que o tema herda de `base`, e não de `keycloak.v2`

`keycloak.v2` traz o PatternFly junto: layout de cartão, cabeçalho próprio, cantos arredondados e
uma folha de estilo que vence quase tudo por especificidade. Um tema que só troca cores em cima
dele continua parecendo Keycloak. Herdando de `base` o markup é nosso — `template.ftl` e
`login.ftl` são reescritos — e o CSS estiliza elemento por elemento, sem briga.

O preço é que as páginas que **não** reescrevemos (erro, aviso, sessão expirada, confirmação de
saída, verificação de e-mail) continuam vindo do `base`, com o markup dele. Elas passam pelo nosso
`template.ftl`, então herdam a moldura; o que elas escrevem por conta própria são as classes
`instruction`, `content-area`, `form-actions` e `clearfix`, todas estilizadas no fim do
`login.css`. **Página nova do Keycloak que apareça sem estilo quase sempre é uma classe estática
dessas que ainda não foi coberta** — o caminho é ler o `.ftl` correspondente no tema `base` e
acrescentar a regra.

## `theme.properties` é o mapa de classes

As páginas herdadas escrevem `class="${properties.kcInputClass!}"` em vez de uma classe literal.
O `theme.properties` traduz cada uma dessas chaves para a classe do nosso CSS (`kcInputClass=field-input`,
`kcButtonClass=action`, e assim por diante). Mudou o nome de uma classe no `login.css`? mude no
`theme.properties` também, ou as páginas herdadas ficam sem estilo enquanto o login continua certo.

## Os tokens são cópia por valor

`resources/css/login.css` declara `--transportada-*` com os mesmos valores de
`apps/frontend-transportada/src/styles/index.css`. O tema do Keycloak não importa código nosso e
não passa por build, então não há como referenciar o arquivo original. **Mudou cor, fonte ou escala
no frontend? copie aqui.** Duas paletas no mesmo fluxo leem como dois produtos.

## O texto vive no pacote de mensagens

Os realms não ligam internacionalização, então o Keycloak resolve tudo pelo pacote `en` — é por
isso que o português está em `messages/messages_en.properties`. O `messages_pt_BR.properties` é
cópia idêntica, para o dia em que algum realm ligar i18n. Texto novo entra nos dois.

Os rótulos e erros não pedem desculpa e não descrevem o mecanismo: `Usuário ou senha inválidos.`,
`Informe o usuário.`, `Algo deu errado`.

## O link de recuperação de senha

A recuperação de senha é tela nossa (`/recuperar-senha`, servida pelo frontend) e o Keycloak não
sabe o endereço do frontend. O `login.ftl` renderiza a âncora escondida e
`resources/js/password-reset-link.js` resolve a origem pelo `redirect_uri` da própria requisição de
login antes de revelá-la. Sem `redirect_uri` legível o link continua escondido — melhor ausente do
que apontando para lugar nenhum.

## Verificando uma mudança

O Keycloak guarda o tema em cache mesmo em `start-dev`: depois de editar qualquer arquivo,
`docker restart transportada-local-keycloak-1`. A URL que abre a tela sem passar pelo app precisa
dos parâmetros de PKCE e do `redirect_uri` exato registrado no cliente
(`http://localhost:53000/auth/callback`) — qualquer outro devolve a página de erro, que também é
útil para conferir a moldura das páginas herdadas.
