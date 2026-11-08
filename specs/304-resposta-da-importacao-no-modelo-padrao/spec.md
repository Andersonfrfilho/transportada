# Spec 304 — A resposta da importação no modelo padrão, e XML grande dentro do zip

- RF1: o teto por XML dentro do zip sobe de 5 MiB para 25 MiB (o teto do storage de objetos). Razão de compressão, total por zip e caminho seguro seguem como proteção.
- RF2: o e-mail do resultado sai no modelo padrão de e-mail da empresa (`notification.standard-email`, editável em Notificações), com logo, em HTML e texto.
- RF3: o conteúdo traz recebido em, entrou no sistema em, contagens, cada arquivo com o motivo e as contratantes das notas novas.
- WhatsApp, recusa e falha continuam com o texto curto. Sem migration.
