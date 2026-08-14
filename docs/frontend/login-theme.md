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

## O rodapé de copyright

O `base` traz um `footer.ftl` cujo macro é vazio — por isso a tela nasceu sem rodapé mesmo com o
`template.ftl` chamando `<@loginFooter.content/>`. O arquivo foi sobrescrito em
`login/footer.ftl`, e com isso o rodapé aparece em **toda** página do tema, inclusive nas herdadas
do `base`, sem editar nenhuma delas.

O ano vem de `.now?string('yyyy')`, não do texto: um rodapé com ano fixo envelhece na virada e
ninguém percebe. O texto é `transportadaColophon` no pacote de mensagens, com `{0}` recebendo o ano.

A chamada foi movida para fora do `.panel`: o `base` a coloca dentro do cartão, onde a linha lê como
parte do formulário. Na grade de duas colunas o `.colophon` atravessa as duas (`grid-column: 1 / -1`);
sem isso ele cairia embaixo da marca, desalinhado do painel.

Ao lado do texto vem a marca da Ada Technology, em `resources/img/ada-technology.png`. O arquivo é
**cópia por valor** de `apps/frontend-site/public/ada-icon.png` do repositório `ada-technology`,
reduzido para 96px (`sips -Z 96`) — o tema não importa código nosso, e menos ainda de outro
repositório; trocou a marca lá? copie aqui. O `alt` é vazio porque o nome está escrito ao lado —
anunciar a imagem repetiria a palavra no leitor de tela.

⚠️ **Não use o `ada-icon-192.png` do painel.** Aquele é ícone de PWA: alfa 255 em todo pixel, com o
fundo branco chapado no arquivo, porque ladrilho de PWA precisa ser opaco. Aqui ele vira um bloco
branco — e o filtro abaixo é justamente o que torna o defeito total em vez de discreto. O arquivo
certo é o do site: cantos em `alpha 0` e 256 valores de alfa. Antes de trocar a marca, confira o
alfa dos cantos do arquivo novo.

O gradiente azul da marca é feito para fundo claro: sobre o asfalto a ponta escura sumiria. O
`.colophon-mark` a achata em silhueta branca (`filter: brightness(0) invert(1)`, `opacity: 0.8`) —
que é exatamente o que o site da Ada faz no rodapé escuro dele. A regra é copiada de lá, não
inventada aqui; recolorir a marca no cobre do produto seria pintar a marca de outra empresa com a
nossa cor.

## O botão de mostrar a senha

O olho vive em `resources/js/password-visibility.js` e nasce `hidden` no `login.ftl` — sem script
ele não teria como alternar nada, e um olho que não abre é pior do que olho nenhum. O script revela
o botão, troca `type` entre `password` e `text`, e acompanha com `aria-pressed` e `aria-label`
(`showPassword` / `hidePassword` no pacote de mensagens), devolvendo o foco ao campo.

O rótulo do campo de senha é **irmão** do `input`, não o envolve: dentro de um `<label>` o clique
num botão descendente também alcançaria o controle rotulado. O `for="password"` mantém a
associação. Os dois ícones ficam no markup e o CSS escolhe qual aparece por `[aria-pressed]` — nada
de montar SVG por script.

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
