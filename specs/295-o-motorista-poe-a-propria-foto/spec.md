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
- Fase 4 (foto da CNH, RF10 a RF13): **não implementada nesta entrega**; começa pelo spike.

## Foto da CNH como foto inicial (Fase 4 — aguarda o spike)

- **Decisão do dono (2026-11-05):** a foto extraída da CNH é **aplicada direto** como foto de perfil no cadastro, e o
  motorista a troca no app (a auto-troca desta spec). Não há modo "sugerir e confirmar".
- **RF10** No cadastro do motorista, extrair o rosto da CNH já guardada (specs 091, 071; usuário criado pela 049) e gravá-lo
  como foto de perfil com `origin = 'cnh'`. CNH-e em PDF traz o rosto como objeto de imagem (extração sem detecção facial);
  foto da CNH física exige detecção e recorte (menos confiável).
- **RF11** A foto guarda a origem (`cnh` | `self` | `admin`), coluna aditiva. Envio próprio grava `self`; envio do administrador, `admin`.
- **RF12** Foto de origem `self` ou `admin` **nunca** é sobrescrita por uma da CNH.
- **RF13** Transparência: enquanto a origem é `cnh`, o Perfil do app mostra "Foto tirada da sua CNH — toque para trocar"
  (`GET /me/picture` passa a expor a origem em cabeçalho/metadado quando a fase entrar).
- **LGPD:** é mudança de finalidade (documento de cadastro → foto exibida ao escritório e a contratantes nas conversas); a
  mitigação é a nota do RF13 e a troca/remoção a um toque. Registrar em `docs/SECURITY.md` ao implementar.
- O spike (T4.1, `opus`) precede tudo: amostras reais de staging (PDF digital e fotografada), taxa de sucesso, biblioteca
  compatível com Bun, sem serviço externo. A implementação espera o resultado; depende também da 048 (amostras de CNH).

## Aceite

1. `PUT /me/picture` com imagem válida → 200 e a foto é a do próprio usuário; outro usuário nunca é afetado.
2. Arquivo que não é imagem, vazio ou maior que 256 KiB → 400 com código estável.
3. Sem autenticação → 401; rota sem id externo (tentativa de alvo alheio não existe).
4. No app: trocar a foto atualiza cabeçalho e Perfil sem logout; imagem que falha volta às iniciais.
