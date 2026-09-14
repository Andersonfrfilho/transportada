## frontend-client

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

**A app não fala com terceiro nenhum**: `connect-src` é a própria origem, a API e o Keycloak — o
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
Envs: `VITE_API_URL`, `VITE_CLIENT_APP_URL`, `VITE_KEYCLOAK_*`.

## Documento fiscal: o CNPJ tem letra

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
