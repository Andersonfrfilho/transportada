# syntax=docker/dockerfile:1
# Imagem oficial com a configuração embutida: o serviço não depende de volume nem de painel para
# saber o que fazer, e a configuração é revisada no mesmo pull request que a muda.
FROM timberio/vector:0.57.0-alpine@sha256:19e3526faf4d4b1ed0c28a0d68d4cc3a1e13e437099986a5b7a768707907497c

COPY deploy/vector/vector.yaml /etc/vector/vector.yaml

# `--require-healthy false`: o sink do OpenObserve pode estar fora do ar no boot, e isso não é
# motivo para o arquivo no bucket deixar de ser escrito.
#
# `--dangerously-allow-env-var-interpolation`: a 0.57.0 desligou a interpolação de `${VAR}` por
# padrão, e desligada ela é silenciosa — o literal `${LOG_ARCHIVE_S3_BUCKET}` vira nome de bucket e
# o erro que sobra é um `dispatch failure` que não fala de variável. O "dangerously" existe para
# configuração de origem não confiável ler o ambiente do processo; esta vem embutida na imagem e é
# revisada no mesmo pull request que a muda.
ENTRYPOINT ["/usr/local/bin/vector"]
CMD ["--config", "/etc/vector/vector.yaml", "--require-healthy", "false", \
     "--dangerously-allow-env-var-interpolation"]
