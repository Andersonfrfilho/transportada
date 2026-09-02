# Tasks — 068

> 🤖 Modelo: `sonnet` (T1 é 🧠 — o formato das tabelas decide o resto)

- [x] **T1** 🧠 Migration + schema Drizzle das duas tabelas, com CHECK de tipo, de formato de
      telefone/e-mail, de rede do catálogo e de URL `https`; rollback ao lado. Contrato de schema.
- [x] **T2** Porta, repositório e caso de uso de leitura/escrita (substituição da lista inteira),
      com `companyId` do contexto. Contrato de isolamento por empresa.
- [x] **T3** Rotas `GET`/`PUT /company-settings/contacts` (`settings.manage`, escopo `company`) e
      serialização pública em `/public/landing-settings`. Contrato de rota e de paridade.
- [x] **T4** Rodapé do e-mail: telefones com `tel:`, WhatsApp com `wa.me`, e-mails com `mailto:`,
      endereço com link para o mapa, redes sociais em linha. Cópia do schema no worker.
- [x] **T5** Painel no frontend (aba Empresa), com linhas de contato ordenáveis e caixa de WhatsApp.
- [x] **T6** Rodapé do site institucional consumindo a rota pública.
