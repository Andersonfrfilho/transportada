SHELL := /bin/sh
.DEFAULT_GOAL := help

ENV_FILE ?= $(if $(wildcard .env),.env,.env.example)
PROJECT_NAME := $(shell sed -n 's/^PROJECT_NAME=//p' $(ENV_FILE) 2>/dev/null)
APP_ENV := $(shell sed -n 's/^APP_ENV=//p' $(ENV_FILE) 2>/dev/null)
COMPOSE_PROJECT_NAME := $(PROJECT_NAME)-$(APP_ENV)
COMPOSE := docker compose --env-file $(ENV_FILE) -p $(COMPOSE_PROJECT_NAME)

.PHONY: help bootstrap config up down ps dev check smoke

help: ## 📚 Lista os comandos disponíveis
	@sed -n 's/^\([a-z][a-z-]*\):.*## \(.*\)$$/\1\t\2/p' $(MAKEFILE_LIST)

bootstrap: ## 🧰 Cria o .env local quando necessário
	@test -f .env || cp .env.example .env

config: ## 🔎 Valida o Docker Compose com o nome do projeto
	@test -n "$(PROJECT_NAME)"
	@test -n "$(APP_ENV)"
	@$(COMPOSE) config --quiet

up: config ## 🚀 Sobe PostgreSQL, Redis, MinIO e Mailpit
	@$(COMPOSE) up -d

down: config ## 🛑 Encerra a infraestrutura local
	@$(COMPOSE) down

ps: config ## 📋 Exibe os serviços locais
	@$(COMPOSE) ps

dev: up ## 💻 Inicia web, API e worker
	@set -a; . "./$(ENV_FILE)"; set +a; pnpm dev

check: config ## ✅ Executa todos os gates locais
	@pnpm check

smoke: ## 🩺 Valida API e worker já iniciados
	@curl --fail --silent --show-error --output /dev/null http://localhost:53000/
	@curl --fail --silent --show-error http://localhost:53001/health/live
	@curl --fail --silent --show-error http://localhost:53001/health/ready
	@curl --fail --silent --show-error http://localhost:53002/health/live
	@curl --fail --silent --show-error http://localhost:53002/health/ready
