# 055 — o separador lê a nota com a câmera

> **Numeração:** o `spec.md` da 053 reserva verbalmente o número **054** ("**Recomendação:** abrir
> **spec 054 — a filial existe**"). Esta feature toma o **055** e deixa a lacuna reservada — o
> repositório já tem uma (não existe 036).

## Problema e resultado

Quem separa a carga no armazém não senta em frente a um desktop: anda entre paletes com o celular na
mão e um maço de DANFEs. Hoje, para pôr uma nota numa viagem, essa pessoa precisa **digitar um UUID
de 36 caracteres** no campo "Identificador" do diálogo de vínculo — o `linkValue` de
`trip.locale.json` —, e esse UUID não está impresso em lugar nenhum da nota. Na prática o separador
não usa o produto: alguém no escritório vincula depois, pela memória de qual nota foi para qual
entregador.

O resultado desta feature é o separador abrindo o PWA no celular, apontando a câmera para a etiqueta
da nota e vendo a nota entrar na viagem — sem digitar, sem sair da tela, e sem receber a permissão
que apaga veículo e motorista da frota.

**Três coisas separam o produto de hoje desse resultado, e nenhuma é a tela:** a câmera está
bloqueada por cabeçalho HTTP, a API não sabe achar nota por chave de acesso, e não existe papel de
separador. A tela é a quarta, e é a mais barata.

## Auditoria (leitura do código, não suposição)

### O que já está pronto e não precisa ser feito

| Fato                                                                     | Onde                                                 | Consequência                                                        |
| ------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------- |
| PWA instalável, `display: standalone`, ícones 192/512                    | `vite.config.ts:77-108` (`VitePWA`)                  | **Não há "app" a construir.** O separador instala pela própria aba. |
| `<meta name="viewport" content="width=device-width, initial-scale=1.0">` | `index.html:7`                                       | A base responsiva existe.                                           |
| `worker-src 'self'`                                                      | `shared/contentSecurityPolicy.service.ts`            | Um worker **empacotado** já é permitido.                            |
| `serializeDocument` publica `accessKey`                                  | `nfe-documents/presentation/nfe-documents.routes.ts` | A chave já viaja **de volta**; falta o caminho de ida.              |
| Multi-select, select com busca, diálogo, esqueleto, ícone                | `src/components/ui/`                                 | Nenhum controle novo além do leitor.                                |

### O que bloqueia, hoje, em código

| Bloqueio                                                | Evidência                                                                                                                                                                                                                                                                    | Efeito                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A câmera é negada para a própria origem                 | `server.ts:29` — `'Permissions-Policy': 'camera=(), geolocation=(), microphone=()'`                                                                                                                                                                                          | `getUserMedia` falha **antes** de qualquer diálogo do navegador. Nenhum leitor funciona.                         |
| A rota de vínculo só aceita UUID                        | `trips/presentation/trip-request.schema.ts:25-26` — `nfeDocumentId: z.uuid().nullable().default(null)`                                                                                                                                                                       | Uma leitura devolve chave de 44 caracteres, que a rota recusa.                                                   |
| Nenhuma rota resolve chave → nota                       | `nfe-documents.routes.ts` — `ListDocumentsInput = { cursor, limit }`; as outras três rotas pedem `documentId` por `parseUuidPathIdentifier`                                                                                                                                  | A chave lida não vira id sem varrer a lista inteira do cliente.                                                  |
| Escrever viagem exige `fleet.manage`                    | `trips/presentation/trip.routes.ts:40` — `TRIP_MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' }`, usada nas linhas 102, 122, 138, 154 e 166                                                                                                                  | Dar viagem ao separador **dá junto** cadastro e exclusão de veículo e de motorista.                              |
| Não existe papel de separador                           | `identity.schema.ts:29-37` — sete papéis; `authorization.policy.ts` — `driver` e `aggregate` têm só `['trip.read', 'trip.report']`                                                                                                                                           | Hoje o separador teria de ser `operator`.                                                                        |
| `trip.read` e `trip.report` não têm consumidor          | Nenhuma rota da API os cita; só aparecem no catálogo do frontend (`identity/queries/useAuthMe.query.ts:51-52`)                                                                                                                                                               | São permissões **reservadas**, como `companies.manage`. Há espaço para `trip.manage` ao lado delas.              |
| A CSP não tem `wasm-unsafe-eval` nem `blob:`            | `contentSecurityPolicy.service.ts` — `script-src 'self'` (mais `'unsafe-inline'` só em dev)                                                                                                                                                                                  | Um decodificador **WASM** obrigaria a afrouxar `script-src` para o bundle inteiro.                               |
| `docs/frontend/` não tem regra de responsividade        | Onze documentos: `buttons, checkboxes, data-tables, fields, icons, layout, loading, login-theme, mutations, panels, selects`                                                                                                                                                 | A regra existe só no `web.md` global, e o código já a contraria.                                                 |
| Sete consultas `max-width`, nove breakpoints diferentes | `billing/components/DueDateField.module.css:21`; `company-settings/styles/companySettings.module.css:748`; `nfe-workspace/styles/nfeWorkspace.module.css:949, 960, 1430`; `styles/index.css:1058, 1156` — e 40rem, 47.99rem, 48rem, 60rem, 64rem, 72rem, 80rem, 640px, 900px | `web.md` §10 proíbe `max-` ("`min-width` para adicionar — nunca `max-` para remover") e fixa base/640/1024/1280. |
| `trip.module.css` tem duas consultas, ambas de grade    | linhas 82 (`min-width: 40rem`) e 88 (`min-width: 64rem`)                                                                                                                                                                                                                     | A tela de viagem nunca foi pensada para 375px.                                                                   |

### O que o iOS impõe

`BarcodeDetector` é API de Chromium — **não existe no Safari do iPhone**. Como o PWA vai rodar nos
dois sistemas (decisão do cliente), o leitor precisa de um caminho que não dependa dela.

## Decisões

### D1 — A câmera abre por permissão de origem própria, e só ela

`Permissions-Policy` passa a `camera=(self), geolocation=(), microphone=()`. Microfone e
geolocalização **continuam negados a todo mundo, inclusive a nós** — o leitor não precisa de nenhum
dos dois, e afrouxar os três de uma vez seria pagar por uma feature com a superfície das outras
duas. `camera=(self)` não concede nada: ele devolve ao navegador o direito de **perguntar**, e quem
concede é a pessoa, uma vez, no diálogo do sistema.

O cabeçalho é o mesmo objeto congelado de `server.ts` que já serve a CSP fail-closed. O contrato que
nasce com esta decisão falha se `camera=()` voltar **e** se `geolocation` ou `microphone` deixarem de
ser `()` — a segunda metade é a que impede a diretiva de virar `camera=*, geolocation=*` numa
madrugada de depuração.

### D2 — O leitor é JavaScript puro, e a CSP não muda

Um decodificador WASM forçaria `'wasm-unsafe-eval'` dentro de `script-src`, e `script-src` vale para
**o bundle inteiro** — a tela de faturamento passaria a poder compilar bytecode por causa da tela do
armazém. Não vale a troca por uma leitura de etiqueta.

Então: onde `BarcodeDetector` existir (Android/Chromium), ele é usado — é nativo, é grátis e é mais
rápido que qualquer biblioteca. Onde não existir (iOS, e o Firefox de qualquer sistema), entra um
decodificador **JavaScript puro**, num worker **empacotado pelo Vite** (`new Worker(new URL(…,
import.meta.url), { type: 'module' })`), nunca um worker criado a partir de `blob:` — `worker-src` é
`'self'` e não tem `blob:`, e biblioteca que monta worker por blob **não serve**, por mais popular
que seja.

A biblioteca se escolhe na task, não aqui, pelo §13 do `code-standart` ("buscar a mais moderna e
ativamente mantida"). Os critérios de recusa já estão fixados: WASM, worker por blob, ausência de
ESM, e ausência de 1D (ver D3).

### D3 — A etiqueta não decide a leitura: a chave decide

A DANFE do modelo 55 imprime tradicionalmente **Code-128C com os 44 dígitos**; a NFC-e do modelo 65
imprime **QR com uma URL de consulta**. O produto é genérico (ADR-0021) e a etiqueta é de cada
emitente — desenhar para uma simbologia é descobrir na primeira semana que o cliente imprime a
outra.

Por isso o leitor tenta **QR e Code-128**, e quem transforma o resultado em chave é uma função pura:
44 dígitos crus passam direto; uma URL entrega a chave do parâmetro `p=` (primeiro segmento antes do
`|`) ou de `chNFe=`; qualquer outra coisa é leitura ignorada, não erro na cara do separador — que
está apontando a câmera para um palete, e vai pegar código de barras de embalagem no caminho.

⚠️ **O padrão da chave já existe nas duas apps e não se reescreve:** `CHAVE_PATTERN` em
`api-transportada/src/shared/tax-id.service.ts` e a regra reescrita em
`frontend-transportada/src/modules/shared/taxId.service.ts`, guardada por
`test/shared/alphanumeric-tax-id.contract.ts`. Ela é `^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$` — o CNPJ do
emitente alfanumeriza dentro da chave. Um filtro por `\d{44}` recusaria a nota de emitente com letra
no CNPJ, que é o cenário em produção desde 01/07/2026.

**A confirmar com uma DANFE real do cliente**, e a registrar em `evidence.md`: qual simbologia as
etiquetas dele trazem. A decisão acima é segura sob as duas respostas — a medição serve para saber
se o caminho da câmera basta ou se o campo digitável continua sendo o principal, não para mudar o
desenho.

### D4 — O navegador desembrulha, e a API só aceita a chave

A extração de D3 mora **no frontend**. A API ganha um filtro `accessKey` em `GET /nfe-documents`,
canônico e estrito (`CHAVE_PATTERN`, 44 caracteres, caixa alta) — nunca "o que a câmera devolveu".
Assim a fronteira da API continua estreita, e uma URL de consulta de terceiro nunca chega a ser
argumento de query.

O filtro entra na **rota que já existe**, não numa rota nova: `GET /nfe-documents` já carrega
`INVOICES_READ_POLICY` (`invoices.read`, escopo `company`), o filtro de tenant e o `serializeDocument`
que o separador precisa ver. Uma segunda rota duplicaria os três.

O vínculo continua sendo `POST /trips/{id}/documents` com `nfeDocumentId`, uma chamada por nota: o
endpoint é por nota e cada recusa (`documentAlreadyLinked`, `documentAlreadyDelivered`) precisa
aparecer **ao lado da nota que a causou**. Vincular em lote é decisão de outra spec.

### D5 — O separador tem papel, e ele não administra a frota

Nasce a permissão **`trip.manage`**, ao lado de `trip.read` e `trip.report`, que já estão reservadas
e sem consumidor. As cinco rotas de escrita de viagem trocam `fleet.manage` por `trip.manage`, e
`company-admin` e `operator` recebem `trip.manage` no mesmo passo — ninguém que hoje cria viagem
perde a capacidade.

Nasce o papel **`separator`**, com `['trip.read', 'trip.manage', 'invoices.read', 'fleet.read']`:
enxerga a frota para escolher veículo e motorista, enxerga a nota que escaneou, escreve a viagem, e
**não toca** em cadastro, faturamento, CT-e nem configuração. Papel novo é linha nova no
`membership_roles_role_check` (`identity.schema.ts:131`) e no `COMPANY_ROLE_LIST` do convite
(`user-invitation.schema.ts:34`) — migration versionada, aditiva, com `rollback.sql` ao lado.

Esta é a metade da feature que **bloqueia o go-live**: entregar a tela sem o papel significa dar
`fleet.manage` a quem anda no armazém.

### D6 — É a mesma tela, e o celular é regra do produto

Não nasce rota de celular. Duas telas para o mesmo trabalho divergem — a do desktop ganha um campo
que a do celular não tem, e a partir daí são dois produtos. A tela de viagem passa a caber em 375px
por reflow, e o leitor é um controle a mais, escondido onde não há câmera.

E a regra sai desta feature para o produto: nasce `docs/frontend/responsive.md` com os quatro
breakpoints do `web.md` §10 (base · 640px · 1024px · 1280px), a proibição de `max-width` e o alvo de
toque de 44px, mais o contrato que os cobra. Os sete `max-width` de hoje se corrigem **nesta spec** —
um contrato com lista de exceções nasce sendo a documentação do que não se cumpre.

### D7 — O leitor é primitivo do design system, não componente da viagem

`@/components/ui/barcode-scanner`, ao lado de `select`, `checkbox` e `date-picker`. A conferência de
lote e a nota avulsa vão querer o mesmo leitor, e o segundo consumidor é sempre quem descobre que o
primeiro escondeu a regra dentro do módulo. Ele encerra as trilhas de vídeo ao fechar — câmera que
fica acesa atrás de um diálogo fechado é a luz do celular denunciando o bug.

## O que muda no produto (leitura do código, não suposição)

| Onde                                                       | Mudança                                                                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `frontend/server.ts`                                       | `camera=(self)` na `Permissions-Policy`; contrato novo                                                     |
| `frontend/src/components/ui/barcode-scanner.tsx`           | primitivo novo: câmera traseira, `BarcodeDetector` com queda para decodificador JS, encerramento de trilha |
| `frontend/src/modules/shared/nfeAccessKey.service.ts`      | extração pura: dígito cru, `p=`, `chNFe=`                                                                  |
| `frontend/src/modules/trip/`                               | painel de criação e diálogo de vínculo mobile-first; leitura em sequência com lista encenada               |
| `frontend/src/modules/trip/locales/*.locale.json`          | rótulos do leitor, nos dois idiomas                                                                        |
| `frontend/src/styles/index.css` e cinco `*.module.css`     | os sete `max-width` viram `min-width`                                                                      |
| `docs/frontend/responsive.md`                              | documento novo                                                                                             |
| `api/src/nfe-documents/presentation/`                      | filtro `accessKey` em `GET /nfe-documents`                                                                 |
| `api/src/identity/domain/authorization.policy.ts`          | `trip.manage`; papel `separator`                                                                           |
| `api/src/trips/presentation/trip.routes.ts:40`             | `TRIP_MANAGE_POLICY` passa a `trip.manage`                                                                 |
| `api/src/database/identity.schema.ts` + migration          | papel `separator` no CHECK                                                                                 |
| `frontend/src/modules/identity/queries/useAuthMe.query.ts` | `trip.manage` no catálogo                                                                                  |
| `docs/adr/0042-…`                                          | a escolha do decodificador                                                                                 |
| `docs/SECURITY.md`                                         | a abertura de `camera=(self)`, datada                                                                      |

## Fora do escopo

- **Vínculo em lote.** Uma chamada por nota, pelo motivo em D4.
- **Leitura offline.** O PWA cacheia o shell, mas resolver chave exige a API. Separador sem rede vê
  a falha e digita depois; fila de leituras pendentes é outra spec.
- **Conferência de carga.** Escanear para _conferir_ o que já está na viagem é outro fluxo, com outra
  tela e outro relatório.
- **A etiqueta impressa por nós.** Nada aqui gera código de barras; só lê o que o emitente imprimiu.
- **Convite de separador pela tela.** O papel nasce no catálogo e no CHECK; quem convida usa as
  rotas de `/company-users` que já existem.
- **A filial (spec 054).** O separador é de um armazém, e armazém é filial — mas a filial não existe
  no modelo e não nasce aqui.

## Histórias

### P1 — O separador põe a nota na viagem sem digitar

**Dado** um separador autenticado, com o papel `separator`, numa viagem aberta, no celular
**Quando** ele toca em "Ler etiqueta" e aponta a câmera para a DANFE
**Então** a nota aparece na lista da viagem com número, emitente e destinatário
**E** a câmera continua aberta para a próxima etiqueta, sem confirmação a cada leitura.

### P1 — A leitura que não é nota não vira erro

**Dado** o leitor aberto
**Quando** a câmera pega o código de barras da embalagem, ou um QR de rastreio da transportadora
**Então** nada acontece — a leitura é descartada em silêncio
**E** só a etiqueta que carrega chave de 44 caracteres produz efeito.

### P1 — A nota já vinculada diz onde está

**Dado** uma nota que já pertence a outra viagem
**Quando** o separador a lê
**Então** a linha dela aparece com a recusa **ao lado dela**, com o texto de
`feedback.documentAlreadyLinked`
**E** as notas lidas antes e depois continuam na lista, intactas.

### P1 — Sem câmera, o trabalho continua

**Dado** um separador que negou a permissão de câmera, ou um navegador sem `getUserMedia`
**Quando** ele abre o diálogo de vínculo
**Então** o campo de chave digitável está lá, aceitando os 44 caracteres impressos sob o código de
barras
**E** o botão de leitura, quando a câmera é impossível, não aparece — botão que não pode funcionar é
pior que botão ausente.

### P1 — O separador não apaga veículo

**Dado** um usuário com o papel `separator`
**Quando** ele chama qualquer rota de escrita da frota
**Então** a API responde `403`
**E** as cinco rotas de escrita de viagem respondem normalmente.

### P2 — A tela cabe no polegar

**Dado** a tela de viagens em 375px de largura
**Quando** o separador cria a viagem
**Então** não há rolagem horizontal em nenhum ponto
**E** todo alvo de toque tem ao menos 44px
**E** o diálogo de vínculo ocupa a tela inteira, como manda o `web.md` §10.

### P2 — A chave resolve pela nota que existe

**Dado** uma chave de acesso de nota de **outra** empresa
**Quando** o separador a lê
**Então** a API responde lista vazia, e a tela diz que a nota não foi encontrada
**E** nada distingue "não existe" de "é de outro tenant".
