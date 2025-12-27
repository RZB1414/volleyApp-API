# VolleyPlus API Worker

API do VolleyPlus rodando no Cloudflare Workers.

## 🔐 Configuração de Desenvolvimento Local

### 1. Criar arquivo `.dev.vars`

Este arquivo contém secrets locais e **NÃO deve ser commitado**.

```bash
cp .dev.vars.example .dev.vars
```

Depois edite `.dev.vars` e adicione seu JWT_SECRET:

```
JWT_SECRET=seu-secret-aqui
```

> ⚠️ **IMPORTANTE**: O arquivo `.dev.vars` já está no `.gitignore` e não será commitado.

### 2. Iniciar o servidor

```bash
npm run dev
```

O servidor estará disponível em: http://127.0.0.1:3000

## 🚀 Deploy para Produção

### Configurar Secrets no Cloudflare

Secrets **NÃO devem estar** no `wrangler.toml`. Use o comando:

```bash
npx wrangler secret put JWT_SECRET
```

Você será solicitado a inserir o valor do secret de forma segura.

## 📂 Estrutura

- `src/` - Código fonte
  - `routes/` - Rotas da API
  - `services/` - Lógica de negócio
  - `middleware/` - Middlewares
  - `utils/` - Utilitários
- `wrangler.toml` - Configuração do Workers (sem secrets!)
- `.dev.vars` - Secrets locais (gitignored)
- `.dev.vars.example` - Exemplo de configuração

## 🔒 Segurança

### ✅ Correto

- Secrets em `.dev.vars` (local)
- Secrets via `wrangler secret put` (produção)
- `.dev.vars` no `.gitignore`

### ❌ Incorreto

- Hardcoded secrets no `wrangler.toml`
- Commitar `.dev.vars` para o Git
- Secrets em arquivos públicos

## 📝 Endpoints

- `GET /health` - Health check
- `POST /auth/register` - Registro de usuário
- `POST /auth/login` - Login
- `GET /auth/me` - Perfil do usuário autenticado

## 🛠 Variáveis de Ambiente

### Localmente (.dev.vars)

```
JWT_SECRET=seu-jwt-secret
```

### Produção (Cloudflare Dashboard ou CLI)

Configure via:
```bash
wrangler secret put JWT_SECRET
```
