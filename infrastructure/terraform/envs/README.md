# Terraform Environment Variables & Workspace Switching

This directory contains per-environment variable files that drive the VertexChain
Terraform root module.  One file exists for each environment:

| File | Purpose |
|---|---|
| `terraform.tfvars.dev` | Development — small/cheap instances, single replicas |
| `terraform.tfvars.staging` | Staging — production-like config, reduced scale |
| `terraform.tfvars.prod` | Production — HA sizing, multi-AZ, automated failover |
| `terraform.tfvars.example` | Safe template tracked in git — copy to get started |

> **Security** — `terraform.tfvars.dev`, `terraform.tfvars.staging` and
> `terraform.tfvars.prod` are gitignored because they contain real VPC IDs
> and subnet IDs.  Only `terraform.tfvars.example` is committed.

---

## Quick-start: switching environments

### Prerequisites

```bash
# Install Terraform ≥ 1.5
# Authenticate to AWS (OIDC in CI, profile or env-vars locally)
export AWS_PROFILE=vertexchain-dev   # or set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
```

### One-command workspace switch helper

Save the snippet below as `switch-env.sh` (already provided at
`infrastructure/scripts/` — run it from the repo root):

```bash
#!/usr/bin/env bash
# Usage: ./switch-env.sh <dev|staging|prod>
set -euo pipefail

ENV="${1:?Usage: switch-env.sh <dev|staging|prod>}"
TF_DIR="infrastructure/terraform"

if [[ ! "$ENV" =~ ^(dev|staging|prod)$ ]]; then
  echo "ERROR: ENV must be dev, staging, or prod" >&2
  exit 1
fi

VAR_FILE="${TF_DIR}/envs/terraform.tfvars.${ENV}"
if [[ ! -f "$VAR_FILE" ]]; then
  echo "ERROR: ${VAR_FILE} not found.  Copy terraform.tfvars.example and fill in real values." >&2
  exit 1
fi

cd "$TF_DIR"
echo "→ terraform init"
terraform init -input=false -reconfigure

echo "→ terraform workspace select ${ENV}"
terraform workspace select "${ENV}" 2>/dev/null \
  || terraform workspace new "${ENV}"

echo "✓ Now on workspace: $(terraform workspace show)"
echo "  Run: terraform plan -var-file=envs/terraform.tfvars.${ENV}"
```

### Step-by-step

```bash
cd infrastructure/terraform

# 1. Initialise (only needed once, or after provider/backend changes)
terraform init -input=false

# 2. Select (or create) the target workspace
terraform workspace select dev       # or staging | prod
# If the workspace doesn't exist yet:
terraform workspace new dev

# 3. Plan with the matching var file
terraform plan -var-file=envs/terraform.tfvars.dev

# 4. Apply (human approval required for staging/prod)
terraform apply -var-file=envs/terraform.tfvars.dev
```

---

## State isolation

Each workspace stores its state under a distinct S3 prefix:

```
s3://vertexchain-terraform-state/
  vertexchain/terraform.tfstate          ← default workspace (not used)
  env:/dev/vertexchain/terraform.tfstate
  env:/staging/vertexchain/terraform.tfstate
  env:/prod/vertexchain/terraform.tfstate
```

The `workspace_key_prefix = "env:"` setting in `providers.tf` handles this
automatically — no manual path management required.

---

## CI / CD

On every pull request that touches `infrastructure/terraform/**`, the
`plan-matrix` GitHub Actions job runs `terraform plan` against **all three
environments in parallel** using the corresponding `terraform.tfvars.<env>`
file.  Each plan result is posted as a separate PR comment.

On push to `main`, `terraform apply` is triggered against **staging** only.
Production applies must be triggered manually via the
`workflow_dispatch` input on the Terraform workflow.

---

## Variable reference

| Variable | Default | Description |
|---|---|---|
| `environment` | *(required)* | `dev` / `staging` / `prod` |
| `region` | `us-east-1` | AWS region |
| `project_name` | `vertexchain` | Used in all resource names |
| `vpc_id` | *(required)* | Target VPC |
| `vpc_cidr` | *(required)* | VPC CIDR for SG ingress rules |
| `private_subnet_ids` | *(required)* | Private subnets for EKS / RDS |
| `public_subnet_ids` | *(required)* | Public subnets for ALB |
| `db_instance_class` | `db.t3.micro` | RDS instance type |
| `redis_node_type` | `cache.t3.micro` | ElastiCache node type |
| `redis_num_cache_nodes` | `1` | ≥2 enables automatic failover |
| `eks_node_instance_type` | `t3.small` | EKS managed node type |
| `eks_desired_size` | `1` | EKS desired node count |
| `eks_min_size` | `1` | EKS minimum node count |
| `eks_max_size` | `3` | EKS maximum node count |
| `asg_min_size` | `1` | ASG minimum capacity |
| `asg_max_size` | `3` | ASG maximum capacity |
| `asg_desired_size` | `1` | ASG desired capacity |
| `cost_center` | `engineering` | Billing cost-centre tag |
| `owner` | `platform-team` | Owner tag |
