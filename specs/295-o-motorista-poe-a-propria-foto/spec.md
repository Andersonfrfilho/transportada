# Spec 295 — O motorista põe a própria foto

Pedido do dono (2026-11-05): o motorista (e o ajudante) troca a **própria** foto de perfil no app do
motorista (`apps/frontend-driver`), e ela aparece no lugar das iniciais.

## Contexto verificado

- A foto já existe como capacidade de administração: `PUT/GET/DELETE /company-users/:id/picture`
  (`users.manage`), caso de uso `user-picture.use-case.ts`, tabela `identity_user_picture`, leitura pública por
  token imprevisível (`/public/company-users/:token/picture`) e atributo `picture` do Keycloak.
- O app do motorista só mostra iniciais (`DriverShellHeader`, `DriverProfile`, conversas `avatars="initials"`).
- `KeycloakAuthProvider` já lê o claim `picture`, sem uso.
- A CSP do app do motorista já aceita `blob:` e a origem da API em `img-src`: nenhuma mudança de CSP.
- Sem spec anterior sobre o assunto além da 026 (administração) e da 183 (e-mail com foto): esta não duplica decisão.

## Requisitos

- **RF1** Qualquer membership ativa troca a própria foto: `PUT /me/picture` (multipart, campo `file`).
- **RF2** Qualquer membership ativa remove a própria foto: `DELETE /me/picture`.
- **RF3** Qualquer membership ativa lê a própria foto: `GET /me/picture` (bytes, `no-store`); 404 sem foto.
- **RF4** O usuário vem **só** do token (`context.scope.userId`); nenhuma rota `/me/picture` aceita id no caminho ou no corpo.
- **RF5** Mesma validação da administração (assinatura do conteúdo, 256 KiB, png/jpeg/webp): reaproveita o caso de uso.
- **RF6** No app: "Trocar foto" no Perfil (câmera ou galeria), compressão no aparelho antes de enviar, "Remover foto".
- **RF7** A foto aparece no cabeçalho, no Perfil e nas mensagens do próprio motorista nas conversas; sem foto ou com
  imagem quebrada, voltam as iniciais.
- **RF8** Depois do envio a foto aparece sem sair e entrar de novo.
- **RF9** Textos em pt e en.

## Fora de escopo

- Foto de outros participantes nas conversas do app (o pacote só entrega o nome do autor ao renderizador).
- Recorte/edição de imagem no app.
- Fase 4 (foto sugerida da CNH): ver RF10, **não implementada nesta entrega**.

## Foto sugerida da CNH (Fase 4 — bloqueada)

- **RF10** No cadastro do motorista, extrair o rosto da CNH já guardada (specs 091, 071; usuário criado pela 049) e gravá-lo
  como **sugestão pendente**. O motorista confirma ou troca no app no primeiro acesso; o painel mostra a sugestão aos
  administradores. CNH-e em PDF traz o rosto como objeto de imagem (extração sem detecção facial); foto da CNH física exige
  detecção e recorte (menos confiável).
- **LGPD:** é mudança de finalidade (documento de cadastro → foto exibida ao escritório e a contratantes nas conversas).
  Por isso é sugerida e confirmada, nunca aplicada em silêncio.
- **[NEEDS CLARIFICATION]** Modo de consentimento: "sugerir e o motorista confirma" (recomendado) ou "aplicar direto".
  Também depende das amostras de CNH da spec 048 (também com pergunta aberta). **A Fase 4 não é implementada sem resposta.**

## Aceite

1. `PUT /me/picture` com imagem válida → 200 e a foto é a do próprio usuário; outro usuário nunca é afetado.
2. Arquivo que não é imagem, vazio ou maior que 256 KiB → 400 com código estável.
3. Sem autenticação → 401; rota sem id externo (tentativa de alvo alheio não existe).
4. No app: trocar a foto atualiza cabeçalho e Perfil sem logout; imagem que falha volta às iniciais.
