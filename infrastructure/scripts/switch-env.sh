#!/usr/bin/env bash
# switch-env.sh — select a Terraform workspace and print the plan command.
# Usage (from repo root): ./infrastructure/scripts/switch-env.sh <dev|staging|prod>
set -euo pipefail

ENV="${1:?Usage: switch-env.sh <dev|staging|prod>}"
TF_DIR="infrastructure/terraform"

if [[ ! "$ENV" =~ ^(dev|staging|prod)$ ]]; then
  echo "ERROR: ENV must be dev, staging, or prod" >&2
  exit 1
fi

VAR_FILE="${TF_DIR}/envs/terraform.tfvars.${ENV}"
if [[ ! -f "$VAR_FILE" ]]; then
  echo "ERROR: ${VAR_FILE} not found." >&2
  echo "  Copy terraform.tfvars.example, fill in real values, and save as terraform.tfvars.${ENV}" >&2
  exit 1
fi

cd "$TF_DIR"

echo "→ terraform init"
terraform init -input=false -reconfigure

echo "→ terraform workspace select ${ENV}"
terraform workspace select "${ENV}" 2>/dev/null \
  || terraform workspace new "${ENV}"

CURRENT=$(terraform workspace show)
echo ""
echo "✓ Active workspace : ${CURRENT}"
echo ""
echo "  Plan  : terraform plan  -var-file=envs/terraform.tfvars.${ENV}"
echo "  Apply : terraform apply -var-file=envs/terraform.tfvars.${ENV}"
