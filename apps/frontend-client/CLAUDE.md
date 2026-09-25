## frontend-client

Referência completa (mesmo conteúdo, para consulta): `docs/ai-context/frontend-client.md`.

O **portal do contratante** — quem paga o frete acompanha a carga dele. App própria (ADR-0050 §1):
build, bundle, domínio e `Dockerfile` separados, porta 53100. Servir o bundle do painel a um usuário
externo seria depender de que toda condicional de permissão no cliente esteja certa, para sempre, em
todo deploy; bundles separados transformam isso num erro **impossível** em vez de improvável.

**O contratante é usuário, e o vínculo é o recorte.** Ele entra pelo mesmo Keycloak, com o mesmo
convite, com o papel `contractor` e **duas** permissões: `deliveries.track` (acompanhar) e
`charges.decide` (decidir repasse — dinheiro não sai de carona com acompanhar entrega). O que ele
enxerga **não vem do papel**: vem de `contractor_portal_bindings`, que amarra a membership dele a
linhas de `contractors` — e é `contractors` que carrega o documento, desde a 060. As duas FKs do
vínculo levam `company_id` junto: a FK simples aceitaria amarrar conta de uma empresa ao contratante
de outra. Administrar o vínculo é `users.manage` (`/contractors/:id/portal-users`), não
`settings.manage`: uma decisão é para quem se cobra, a outra é quem enxerga a operação. ⚠️ Amarrar
membership **sem** o papel `contractor` é `409` — sem isso quem tentou acreditaria ter concedido
acesso, e ninguém descobriria até o cliente ligar.

**Nenhuma rota do portal recebe id interno.** `/client/me/deliveries` não aceita nem query; a nota é
nomeada pela **chave de acesso** (`.../:accessKey/schedule` e `.../:accessKey/location`), e o
servidor descobre a parada e a viagem. `resolveContractorScope` é a única fonte do recorte e recebe
vínculo, não filtro — e um contrato confere isso **por texto de fonte**, porque uma assinatura que
aceitasse `taxId` compilaria e passaria em todo teste de caminho feliz. Conta sem vínculo é `403`,
nunca lista vazia. Chave que não é dele, chave que não existe e nota sem viagem respondem **igual**.

**O rastro ao vivo tem três guardas** (ADR-0050 §5): o motorista consente (`fleet_drivers.
location_sharing_consent_at`, nulo por padrão, e retirá-lo apaga o rastro na mesma transação); o
rastro morre com a viagem (`purgeByTrip` no fechamento e no cancelamento, fora da transição); e o
cliente vê `latitude`/`longitude`/`recordedAt`, nunca quem dirige. Sem consentimento e fora de viagem
respondem igual ao celular (`202`, contra `201` do gravado). ⚠️ **Nada expira o rastro de viagem que
nunca fecha**, e não há limite de frequência de ping.

**A app não fala com terceiro nenhum**: `connect-src` é a própria origem, a API, o Keycloak e o bucket
da própria instalação (spec 183) — o
painel tem quatro destinos externos, aqui são zero, e um contrato varre `https://` no código. Câmera,
posição e microfone são **todos negados** na `Permissions-Policy` (o painel abre a câmera para o
separador). O provedor de autenticação é cópia do painel **menos** o bypass de fumaça, e o contrato
falha por nome se ele voltar. O mapa é desenho nosso em SVG (projeção equirretangular corrigida pelo
cosseno da latitude, janela de meio grau) — ⚠️ **sem a malha do IBGE que a ADR previa**: o payload
mínimo não carrega cidade nem UF, e alargá-lo para desenhar contorno trocaria privacidade por
enfeite.

⚠️ Esta app **não tem design system nem Playwright**: CSS próprio curto com os tokens copiados por
valor, campos nativos (inclusive `datetime-local`, que o painel proíbe), e nenhum teste de tela — o
que se prova é serviço puro e texto de fonte. Crescer a app é decidir isso de novo, por escrito.
Envs: `VITE_API_URL`, `VITE_APP_ENV`, `VITE_CLIENT_APP_URL`, `VITE_IDENTIFIER_FIRST_LOGIN`,
`VITE_KEYCLOAK_*`, `VITE_STORAGE_URL`. `VITE_APP_ENV` (`local`·`staging`·`production`, ausente/desconhecido cai em
`production`) liga a faixa de ambiente no topo e o ícone 🚧 na aba — cópia por valor do painel, e
`environment-banner.contract.ts` compara o texto da faixa com o dele.

**A app cresceu uma vez, por escrito: a conversa da ocorrência** (ADR-0073, spec 183, aceita em
24/09/2026). A tela "Ocorrências" da 164 ganha a conversa com a transportadora **ao lado** do
`DecisionForm`, que continua sendo o único jeito de decidir pelo portal — a conversa nunca decide.
O que a ADR fixa, e que continua valendo para quem mexer aqui:

- **`Permissions-Policy` igual:** câmera, microfone e posição negados. A contratante anexa por
  seletor de arquivo e ouve áudio; não grava nem fotografa. Liberar microfone é ADR nova.
- **O bucket entrou no `connect-src` e no `media-src`** (emenda de 25/09/2026 à ADR-0073, spec 183
  T702b): o anexo sobe direto ao bucket pela URL assinada de PUT, sem o token, e o áudio toca pelo
  `<audio>`. É a mesma origem do `img-src` (`VITE_STORAGE_URL`), que agora tem `ARG` no
  `Dockerfile` — antes não tinha, e a CSP saía sem o bucket sem erro nenhum. Terceiro continua
  fora: `EXTERNAL_CONNECT_ORIGIN` segue vazia.
- **Nenhum id interno:** a conversa é nomeada pela `conversationRef` (`public_ref` aleatória) que
  `GET /client/me/occurrences` passa a devolver; rotas em `/client/me/occurrence-conversations/:ref`,
  recorte só por `resolveContractorScope`, e só nas ocorrências que a 164 D5 mostra ao portal. A rota
  de decisão da 164 recebe o id interno da ocorrência — dívida da 164, registrada fora da ADR.
- **Serializador próprio:** nenhum campo do motorista (nome, telefone, foto) nem do funcionário; a
  transportadora aparece como empresa. O aviso de mensagem nova ao usuário do portal sai por e-mail
  **sem o corpo**.
- **Peças do `@adatechnology/conversations-ui`, estilo nosso, sem Tailwind e sem o `styles.css` do
  pacote.** A ADR-0073 §1 previa importar o `styles.css`; o painel descobriu na spec 183 (T407) que
  ele traz regra global (`:where(*) { border-color }` e `:root`), que repintaria a app inteira, e que
  o `MessageBubble` só tem forma com Tailwind. Então o balão é nosso, com `MessageText`/`StatusTicks`/
  `DateDivider` dentro, e os tokens de balão são cópia por valor dos do painel (`--color-bubble-*`).
- **Continua sem design system e sem Playwright:** a prova é serviço puro e texto de fonte, mais o
  contrato de que a `Permissions-Policy` não mudou e de que o `connect-src` só ganhou o bucket. O tamanho do bundle antes e
  depois do pacote fica no `evidence.md` da spec 183 (T653).

**Tela de identificação antes do login** (`VITE_IDENTIFIER_FIRST_LOGIN`, ligada em staging e
produção): cópia por valor da do painel — `KeycloakAuthProvider.provider.ts` inicializa com
`check-sso` em vez de `login-required` quando a flag está ligada, `initialize()` devolve `boolean`
(`false` sem sessão), e `main.tsx` renderiza `LoginIdentifierPage` nesse caso. `loginHintClient.
service.ts` resolve o contato digitado (e-mail, CPF, CNPJ, telefone) em `login_hint` chamando
`POST /login-hints`, anônimo, sem token. `restartAuthentication` recarrega a página em vez de ir
direto ao provedor — o contato pode não ser o `username` que o Keycloak entende. Contrato:
`test/keycloak-auth-provider.test.ts` e `test/login-hint-client.test.ts`.

## Documento fiscal: o CNPJ tem letra

Regra transversal (API, worker, frontend-transportada e este portal compartilham o mesmo formato de
documento) — colocada aqui porque foi assim que veio no CLAUDE.md original; ver também
`docs/ai-context/api-transportada.md` para os pontos que ficam do lado da API.

CNPJ alfanumérico (IN RFB 2229/2024, NT Conjunta DF-e 2025.001, em produção desde 01/07/2026):
**`[A-Z0-9]{12}[0-9]{2}`** — letra só nas doze posições da base, os dois dígitos verificadores
continuam numéricos. **O CPF não mudou**: onze dígitos, sempre. A chave de acesso herda o documento
nas posições 7 a 20, então o padrão dela é `^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$` (cUF+AAMM, o CNPJ do
emitente, e daí em diante só dígito). Todo CHECK de chave no banco é esse — `nfe`, `cte-issuance`,
`billing`, `mdfe`, `nfse`, `fleet`, `digital-certificate`.

**A forma canônica é sem máscara e em CAIXA ALTA.** Canonicalizar é `normalizeTaxId`: tira `.`, `/`,
`-` e espaço, e sobe a caixa. Onde ela mora:

- `api-transportada/src/shared/tax-id.service.ts` — **único** ponto da API que importa
  `CNPJ_PATTERN`/`CHAVE_PATTERN`/`normalizeTaxId` de `@adatechnology/fiscal-provider`, para o `~` do
  Postgres, o `regex` do Zod e o XML não divergirem. Ali também ficam `CPF_PATTERN`,
  `CNPJ_ROOT_PATTERN` (a raiz alfanumeriza junto — é prefixo do documento), `TAX_ID_PATTERN`,
  `DOCUMENT_FILTER_PATTERN` e `parseTaxIdValue` para fronteira que não é Zod (query string, rota).
- `api-transportada/src/shared/tax-id.schema.ts` — `buildTaxIdSchema` / `buildOptionalTaxIdSchema`.
  A ordem importa: `.transform(normalizeTaxId)` **antes** do `.refine(pattern)`, senão a minúscula
  vinda do formulário é recusada antes de ter chance de subir a caixa.
- `worker-transportada/src/shared/tax-id.service.ts` — reexporta do mesmo pacote fiscal.
- `frontend-transportada/src/modules/shared/taxId.service.ts` — aqui a regra é **reescrita**, porque
  o bundle não carrega o pacote fiscal; `test/shared/alphanumeric-tax-id.contract.ts` é o que
  garante que as duas dizem a mesma coisa. Campo de CNPJ **nunca** leva `inputMode="numeric"` — o
  teclado do celular não tem letra — e o `onChange` canonicaliza enquanto se digita.

**O que continua sendo por comprimento, e está certo:** `toParticipante`
(`cte-issuance/domain/cte-payload.builder.ts`) escolhe `cnpj` em 14 caracteres e `cpf` em 11. O CNPJ
alfanumérico continua tendo 14 — a discriminação sobrevive à IN, e trocá-la por padrão seria
mudança sem ganho.

**O que precisou virar guarda de conjunto:** `formatDacteDocumentNumber`
(`cte-issuance/domain/dacte-format.policy.ts`) canonicaliza e testa `CNPJ_PATTERN` **antes** de
`CPF_PATTERN`. Filtrar por dígito, como antes, deixava onze dígitos num CNPJ de três letras e
imprimia o documento sob a máscara de CPF.

Cobertura ponta a ponta em
`api-transportada/test/integration/alphanumeric-cnpj-end-to-end.integration.ts`: nota de emitente
alfanumérico → lote → frete → payload de CT-e → DACTE → fatura. Ele **não** cobre assinatura e
transmissão (o XML nasce no worker, com certificado e rede).
