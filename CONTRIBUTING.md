# Contributing to VertexChain

Thank you for your interest in contributing to VertexChain! This document provides guidelines and instructions for setting up your development environment and contributing to the project.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [Code Style and Standards](#code-style-and-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)

## Development Setup

### Prerequisites

- **Node.js 20**: This project uses Node.js version 20 (specified in `.nvmrc` files)
- **PostgreSQL**: Required for the Backend workspace
- **npm**: Package manager (comes with Node.js)
- **Git**: Version control

### Node.js Version Management

This project uses **Node.js 20** across all workspaces. We provide `.nvmrc` files to ensure consistency.

#### Using nvm (Node Version Manager)

If you have [nvm](https://github.com/nvm-sh/nvm) installed:

```bash
# At the repository root
nvm use

# Or in any workspace directory (Backend, Frontend, analytics)
cd Backend
nvm use
```

The `.nvmrc` file will automatically switch to Node.js 20.

#### Automatic version switching

For automatic Node.js version switching when you `cd` into the project:

- **nvm**: Add this to your `~/.bashrc` or `~/.zshrc`:
  ```bash
  # Auto-switch Node.js version with nvm
  autoload -U add-zsh-hook
  load-nvmrc() {
    local node_version="$(nvm version)"
    local nvmrc_path="$(nvm_find_nvmrc)"
    
    if [ -n "$nvmrc_path" ]; then
      local nvmrc_node_version=$(nvm version "$(cat "${nvmrc_path}")")
      
      if [ "$nvmrc_node_version" = "N/A" ]; then
        nvm install
      elif [ "$nvmrc_node_version" != "$node_version" ]; then
        nvm use
      fi
    fi
  }
  add-zsh-hook chpwd load-nvmrc
  load-nvmrc
  ```

- **avn**: Install [avn](https://github.com/wbyoung/avn) for automatic version switching:
  ```bash
  npm install -g avn avn-nvm
  avn setup
  ```

#### Without nvm

If you don't use nvm, make sure you have Node.js 20 installed:

```bash
node --version  # Should output v20.x.x
```

Download from [nodejs.org](https://nodejs.org/) if needed.

## Project Structure

VertexChain is a monorepo with the following workspaces:

```
VertexChain/
├── Backend/          # NestJS API server
├── Frontend/         # Next.js main application
├── analytics/        # Next.js analytics dashboard
├── contracts/        # Soroban smart contracts (Rust)
├── infrastructure/   # CI/CD, Docker, Kubernetes configs
└── .nvmrc            # Node.js version specification
```

Each workspace has its own:
- `package.json` - Dependencies and scripts
- `.nvmrc` - Node.js version (v20)
- `.env.example` - Environment variable documentation

## Environment Configuration

### Overview

Each workspace requires environment variables for configuration. We provide `.env.example` files documenting all required and optional variables.

**Important**: Never commit real secrets, passwords, or API keys to `.env` files. The `.env` files are gitignored.

### Setup Steps

1. **Navigate to each workspace and copy the example file:**

   ```bash
   # Backend
   cd Backend
   cp .env.example .env
   nvm use  # Switch to Node.js 20
   
   # Frontend
   cd ../Frontend
   cp .env.example .env
   nvm use
   
   # Analytics
   cd ../analytics
   cp .env.example .env
   nvm use
   ```

2. **Edit each `.env` file with your actual configuration** (see below for details)

### Backend Configuration

**Location**: `Backend/.env`

**Required variables:**
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME` - PostgreSQL connection
- `SOROBAN_RPC_URL` - Soroban RPC endpoint (default: testnet)
- `STELLAR_NETWORK_PASSPHRASE` - Stellar network passphrase
- `CONTRACT_ID_GIST_REGISTRY` - Deployed contract ID (leave empty if not deployed)

**Optional variables:**
- `PORT` - API server port (default: 3000)
- `NODE_ENV` - Environment mode (default: development)
- `PINATA_API_KEY`, `PINATA_SECRET_KEY` - For IPFS pinning (leave empty to use mocks)
- `STELLAR_SECRET_KEY` - For backend transaction signing (leave empty for client-side only)
- `CORS_ORIGINS` - Allowed CORS origins (default: localhost:3001,localhost:8081)
- `THROTTLE_TTL_MS`, `THROTTLE_LIMIT` - Rate limiting configuration

**Example minimal setup:**
```bash
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=yourpassword
DATABASE_NAME=vertexchain_dev
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
CONTRACT_ID_GIST_REGISTRY=
```

**Setting up PostgreSQL:**
```bash
# Create database
createdb vertexchain_dev

# Or using psql
psql -U postgres -c "CREATE DATABASE vertexchain_dev;"
```

### Frontend Configuration

**Location**: `Frontend/.env`

**Required variables:**
- `NEXT_PUBLIC_API_URL` - Backend API URL (e.g., `http://localhost:3000`)

**Example setup:**
```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Analytics Configuration

**Location**: `analytics/.env`

**Required variables:**
- `NEXT_PUBLIC_MAPBOX_TOKEN` - Mapbox access token for heatmap ([Get one here](https://account.mapbox.com/access-tokens/))

**Optional variables:**
- `NEXT_PUBLIC_API_URL` - Backend API URL for live data (default: mock data)
- `NEXT_PUBLIC_USE_MOCK` - Use mock data instead of API (default: false)

**Example setup:**
```bash
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoieW91cnVzZXJuYW1lIiwi...
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_USE_MOCK=false
```

## Running the Application

### Install Dependencies

Install dependencies for each workspace:

```bash
# Backend
cd Backend
npm install

# Frontend
cd ../Frontend
npm install

# Analytics
cd ../analytics
npm install
```

### Start Development Servers

**Backend** (runs on port 3000 by default):
```bash
cd Backend
npm run start:dev
```

The API will be available at:
- `http://localhost:3000` - API endpoints
- `http://localhost:3000/api/docs` - Swagger documentation

**Frontend** (runs on port 3001 by default):
```bash
cd Frontend
npm run dev
```

**Analytics** (runs on port 8081 by default):
```bash
cd analytics
npm run dev
```

### Running Database Migrations

```bash
cd Backend
npm run migration:run
```

### Verification

To verify your setup is working:

1. **Backend**: Visit `http://localhost:3000/api/docs` - you should see Swagger API documentation
2. **Frontend**: Visit `http://localhost:3001` - you should see the landing page
3. **Analytics**: Visit `http://localhost:8081` - you should see the analytics dashboard

## Code Style and Standards

### Linting

Each workspace has ESLint configured. Run linting:

```bash
# Backend
cd Backend
npm run lint

# Frontend
cd Frontend
npm run lint

# Analytics
cd analytics
npm run lint
```

### Formatting

We use Prettier for code formatting (configured in Backend):

```bash
cd Backend
npm run format
```

### Pre-commit Hooks

This project uses Husky for pre-commit hooks. The hooks automatically run linting before commits.

## Testing

### Backend Tests

```bash
cd Backend

# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

### Frontend/Analytics Tests

```bash
cd Frontend  # or cd analytics
npm run test
```

## Submitting Changes

### Workflow

1. **Fork the repository** (if you're an external contributor)

2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes** following the code style guidelines

4. **Test your changes**:
   ```bash
   # Run linting
   npm run lint
   
   # Run tests
   npm run test
   ```

5. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```
   
   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `style:` - Code style changes (formatting, etc.)
   - `refactor:` - Code refactoring
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create a Pull Request** on GitHub

### Pull Request Guidelines

- **Title**: Use a clear, descriptive title following Conventional Commits format
- **Description**: Explain what changes you made and why
- **Tests**: Ensure all tests pass
- **Documentation**: Update relevant documentation if needed
- **Small PRs**: Keep pull requests focused and reasonably sized

### Code Review Process

- All PRs require at least one review before merging
- CI checks must pass (linting, tests, build)
- Address review feedback promptly
- Keep your branch up to date with `main`

## Getting Help

- **Issues**: Check existing [GitHub Issues](https://github.com/coderolisa/VertexChain/issues) or create a new one
- **Discussions**: Use [GitHub Discussions](https://github.com/coderolisa/VertexChain/discussions) for questions
- **Documentation**: Check the README.md files in each workspace

## License

By contributing to VertexChain, you agree that your contributions will be licensed under the project's license.

---

## PR template (suggested)

Use the following checklist and template when opening PRs. Save it as `.github/PULL_REQUEST_TEMPLATE.md` to apply automatically.

```
## Summary
Short description of the change.

## Related Issue
Closes #<issue-number> (if applicable)

## Changes
- Bullet list of changes

## How to test
Step-by-step instructions to verify changes

## Checklist
- [ ] Tests added/updated
- [ ] Lint/format ran
- [ ] Documentation updated (if applicable)
```

## Commit message format (Conventional Commits)

We follow Conventional Commits to produce clear changelogs and enable tooling.

Format:

```
<type>(<scope>): <short summary>

[optional body]

[optional footer: BREAKING CHANGE: ..., Closes #123]
```

Common types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`.

Rules:
- Keep the summary <= 72 characters.
- Use present tense (e.g., "add", "fix").
- Reference issues with `Closes #<number>` in the footer.

Examples:
- `feat(api): add user authentication endpoint`
- `fix(ui): correct navigation dropdown focus`

## Security & reporting vulnerabilities

If you discover a security vulnerability, please do NOT open a public issue. Instead follow the repository's security policy:

- See the repository `SECURITY.md` for the full policy: [SECURITY.md](SECURITY.md)
- If you need to report privately and `SECURITY.md` lists a contact, use that contact (email or GitHub advisory process).
- If no contact is listed, open a private GitHub security advisory or email the maintainers at the address listed in `SECURITY.md`.

We will acknowledge reports promptly and work with you on a coordinated disclosure and fix.

---

Thank you for contributing to VertexChain! 🚀
