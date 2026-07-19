SHELL := /bin/sh
.DEFAULT_GOAL := help

ENV_FILE ?= $(if $(wildcard .env),.env,.env.example)
PROJECT_NAME := $(shell sed -n 's/^PROJECT_NAME=//p' $(ENV_FILE) 2>/dev/null)
APP_ENV := $(shell sed -n 's/^APP_ENV=//p' $(ENV_FILE) 2>/dev/null)
COMPOSE_PROJECT_NAME := $(PROJECT_NAME)-$(APP_ENV)
BUN_VERSION := 1.3.14
FRONTEND_PORT := $(or $(shell sed -n 's/^FRONTEND_PORT=//p' $(ENV_FILE) 2>/dev/null),53000)
API_PORT := $(or $(shell sed -n 's/^APP_PORT=//p' $(ENV_FILE) 2>/dev/null),53001)
WORKER_PORT := $(or $(shell sed -n 's/^WORKER_PORT=//p' $(ENV_FILE) 2>/dev/null),53002)
KEYCLOAK_PORT := $(or $(shell sed -n 's/^KEYCLOAK_PORT=//p' $(ENV_FILE) 2>/dev/null),58080)
KEYCLOAK_MANAGEMENT_PORT := $(or $(shell sed -n 's/^KEYCLOAK_MANAGEMENT_PORT=//p' $(ENV_FILE) 2>/dev/null),59002)
KEYCLOAK_REALM := $(or $(shell sed -n 's/^KEYCLOAK_REALM=//p' $(ENV_FILE) 2>/dev/null),transportada-local)
KEYCLOAK_ADMIN_USERNAME := $(shell sed -n 's/^KEYCLOAK_ADMIN_USERNAME=//p' $(ENV_FILE) 2>/dev/null)
KEYCLOAK_ADMIN_PASSWORD := $(shell sed -n 's/^KEYCLOAK_ADMIN_PASSWORD=//p' $(ENV_FILE) 2>/dev/null)
KEYCLOAK_LOCAL_USER_PASSWORD := $(shell sed -n 's/^KEYCLOAK_LOCAL_USER_PASSWORD=//p' $(ENV_FILE) 2>/dev/null)
DATABASE_URL := $(shell sed -n 's/^DATABASE_URL=//p' $(ENV_FILE) 2>/dev/null)
RABBITMQ_URL := $(shell sed -n 's/^RABBITMQ_URL=//p' $(ENV_FILE) 2>/dev/null)
COMPOSE_BASE := docker compose --env-file $(ENV_FILE) -p $(COMPOSE_PROJECT_NAME)
COMPOSE := KEYCLOAK_PORT=$(KEYCLOAK_PORT) KEYCLOAK_MANAGEMENT_PORT=$(KEYCLOAK_MANAGEMENT_PORT) $(COMPOSE_BASE)
.PHONY: help bootstrap realm-contract config postgres-up up down ps dev check migration-test smoke

help: ## 📚 Lista os comandos disponíveis
	@sed -n 's/^\([a-z][a-z-]*\):.*## \(.*\)$$/\1\t\2/p' $(MAKEFILE_LIST)

bootstrap: ## 🧰 Prepara o .env e instala com Bun congelado
	@test -f .env || cp .env.example .env
	@bun install --frozen-lockfile

realm-contract: ## 🪪 Valida o contrato versionado do realm Keycloak local
	@bun test test/keycloak-realm.contract.test.ts

config: realm-contract ## 🔎 Valida o Docker Compose com o nome do projeto
	@test -n "$(PROJECT_NAME)"
	@test -n "$(APP_ENV)"
	@test -n "$(DATABASE_URL)"
	@test -n "$(RABBITMQ_URL)"
	@test -n "$(KEYCLOAK_PORT)"
	@test -n "$(KEYCLOAK_MANAGEMENT_PORT)"
	@test -n "$(KEYCLOAK_REALM)"
	@test -n "$(KEYCLOAK_ADMIN_USERNAME)"
	@test -n "$(KEYCLOAK_ADMIN_PASSWORD)"
	@test -n "$(KEYCLOAK_LOCAL_USER_PASSWORD)"
	@test "$$(bun --version)" = "$(BUN_VERSION)"
	@test "$(COMPOSE_PROJECT_NAME)" = "$(PROJECT_NAME)-$(APP_ENV)"
	@$(COMPOSE) config --quiet

postgres-up: ## 🐘 Sobe somente o PostgreSQL local para migrations
	@test -n "$(PROJECT_NAME)"
	@test -n "$(APP_ENV)"
	@test -n "$(DATABASE_URL)"
	@test "$$(bun --version)" = "$(BUN_VERSION)"
	@test "$(COMPOSE_PROJECT_NAME)" = "$(PROJECT_NAME)-$(APP_ENV)"
	@KEYCLOAK_PORT=$(KEYCLOAK_PORT) \
		KEYCLOAK_MANAGEMENT_PORT=$(KEYCLOAK_MANAGEMENT_PORT) \
		KEYCLOAK_ADMIN_USERNAME=not-used \
		KEYCLOAK_ADMIN_PASSWORD=not-used \
		KEYCLOAK_LOCAL_USER_PASSWORD=not-used \
		$(COMPOSE_BASE) up -d --wait postgres

up: config ## 🚀 Sobe PostgreSQL, RabbitMQ, MinIO, Mailpit e Keycloak
	@$(COMPOSE) up -d --remove-orphans --wait

down: config ## 🛑 Encerra a infraestrutura local
	@$(COMPOSE) down

ps: config ## 📋 Exibe os serviços locais
	@$(COMPOSE) ps

dev: up ## 💻 Inicia somente frontend, API e worker Bun
	@set -a; . "./$(ENV_FILE)"; set +a; \
		export FRONTEND_PORT="$(FRONTEND_PORT)"; \
		export QUEUE_PREFIX="$(PROJECT_NAME)_$(APP_ENV)"; \
		bun run --cwd apps/api-transportada dev & api_process_id=$$!; \
		bun run --cwd apps/worker-transportada dev & worker_process_id=$$!; \
		bun run --cwd apps/frontend-transportada dev & frontend_process_id=$$!; \
		cleanup() { \
			trap - INT TERM EXIT; \
			kill $$api_process_id $$worker_process_id $$frontend_process_id 2>/dev/null || true; \
		}; \
		trap 'cleanup; exit 130' INT TERM; \
		trap cleanup EXIT; \
		wait

check: config ## ✅ Executa todos os gates locais
	@bun run check

migration-test: postgres-up ## 🗃️ Valida migration e rollback em PostgreSQL descartável
	@set -a; . "./$(ENV_FILE)"; set +a; \
		DRIZZLE_TEST_DATABASE_URL="$$DATABASE_URL" \
		bun run --cwd apps/api-transportada db:test

smoke: config ## 🩺 Valida a stack local já iniciada
	@curl --fail --silent --show-error --output /dev/null "http://localhost:$(FRONTEND_PORT)/"
	@curl --fail --silent --show-error --output /dev/null "http://localhost:$(FRONTEND_PORT)/manifest.webmanifest"
	@curl --fail --silent --show-error "http://localhost:$(API_PORT)/health/live"
	@curl --fail --silent --show-error "http://localhost:$(API_PORT)/health/ready"
	@curl --fail --silent --show-error "http://localhost:$(WORKER_PORT)/health/live"
	@curl --fail --silent --show-error "http://localhost:$(WORKER_PORT)/health/ready"
	@curl --fail --silent --show-error --output /dev/null "http://localhost:59000/minio/health/live"
	@curl --fail --silent --show-error --output /dev/null "http://localhost:58025/livez"
	@curl --fail --silent --show-error --output /dev/null "http://localhost:$(KEYCLOAK_MANAGEMENT_PORT)/health/ready"
	@curl --fail --silent --show-error --output /dev/null "http://localhost:$(KEYCLOAK_PORT)/realms/$(KEYCLOAK_REALM)/.well-known/openid-configuration"
