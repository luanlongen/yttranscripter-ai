#!/bin/bash

# ===============================================
# Script de Verificação Pré-Publicação
# Apify Actor: YouTube Transcript Wrapper
# ===============================================

set -e  # Exit on error

echo "🔍 Verificando estrutura do projeto Apify..."
echo "=============================================="
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

checks_passed=0
checks_failed=0

# Função para verificar arquivo
check_file() {
    local file=$1
    local description=$2
    
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $description"
        ((checks_passed++))
    else
        echo -e "${RED}✗${NC} $description - NÃO ENCONTRADO"
        ((checks_failed++))
    fi
}

# Função para verificar diretório
check_dir() {
    local dir=$1
    local description=$2
    
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓${NC} $description"
        ((checks_passed++))
    else
        echo -e "${RED}✗${NC} $description - NÃO ENCONTRADO"
        ((checks_failed++))
    fi
}

# Verificar estrutura obrigatória
echo "📁 Estrutura de Projeto:"
check_dir ".actor" "Diretório .actor/"
check_file ".actor/actor.json" "Arquivo .actor/actor.json"
check_file ".actor/input_schema.json" "Arquivo .actor/input_schema.json"
check_file "src/main.ts" "Arquivo src/main.ts (entry point)"
check_file "package.json" "Arquivo package.json"
check_file "Dockerfile" "Arquivo Dockerfile"
check_file "tsconfig.json" "Arquivo tsconfig.json"
check_file ".actorignore" "Arquivo .actorignore"
check_file ".dockerignore" "Arquivo .dockerignore"
check_file ".gitignore" "Arquivo .gitignore"

echo ""
echo "📦 Dependências:"

# Verificar se Node.js está instalado
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js $NODE_VERSION instalado"
    ((checks_passed++))
else
    echo -e "${RED}✗${NC} Node.js não encontrado (requerido v18+)"
    ((checks_failed++))
fi

# Verificar se npm está instalado
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓${NC} npm $NPM_VERSION instalado"
    ((checks_passed++))
else
    echo -e "${RED}✗${NC} npm não encontrado"
    ((checks_failed++))
fi

# Verificar se apify CLI está instalado
if command -v apify &> /dev/null; then
    APIFY_VERSION=$(apify --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✓${NC} Apify CLI $APIFY_VERSION instalado"
    ((checks_passed++))
else
    echo -e "${YELLOW}⚠${NC} Apify CLI não encontrado - Instale com: npm install -g apify"
    ((checks_failed++))
fi

echo ""
echo "📄 Conteúdo do package.json:"

# Verificar Apify SDK
if grep -q '"apify"' package.json; then
    echo -e "${GREEN}✓${NC} Apify SDK está em dependencies"
    ((checks_passed++))
else
    echo -e "${RED}✗${NC} Apify SDK não encontrado em dependencies"
    ((checks_failed++))
fi

# Verificar script "start"
if grep -q '"start"' package.json; then
    echo -e "${GREEN}✓${NC} Script 'start' definido"
    ((checks_passed++))
else
    echo -e "${RED}✗${NC} Script 'start' não encontrado"
    ((checks_failed++))
fi

echo ""
echo "🔧 Validação de Código:"

# Verificar TypeScript
if command -v npx &> /dev/null; then
    if npx -p typescript tsc --version &> /dev/null; then
        echo -e "${GREEN}✓${NC} TypeScript disponível"
        ((checks_passed++))
    else
        echo -e "${YELLOW}⚠${NC} TypeScript não está instalado"
    fi
fi

echo ""
echo "📋 Documentação:"
check_file "README.md" "README.md"
check_file "ACTOR_README.md" "ACTOR_README.md (instruções do actor)"
check_file "PUBLICATION_GUIDE.md" "PUBLICATION_GUIDE.md (guia de publicação)"

echo ""
echo "=============================================="
echo ""

if [ $checks_failed -eq 0 ]; then
    echo -e "${GREEN}✓ Todas as verificações passaram!${NC}"
    echo ""
    echo "Próximos passos:"
    echo "1. Instale as dependências: npm install"
    echo "2. Verifique os tipos: npm run typecheck"
    echo "3. Faça login: apify login"
    echo "4. Publique: apify push"
    echo ""
    exit 0
else
    echo -e "${RED}✗ $checks_failed verificação(ões) falharam${NC}"
    echo ""
    echo "Corrija os problemas acima antes de publicar."
    echo ""
    exit 1
fi
