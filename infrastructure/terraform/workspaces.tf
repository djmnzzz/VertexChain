# Per-environment workspace configuration
# Variable declarations have been moved to variables.tf
#
# When using per-env tfvars files the workspace name is used
# only for state isolation; sizing values come from the tfvars
# file chosen at plan/apply time rather than being hard-coded here.

locals {
  current_env = terraform.workspace
}

output "workspace_name" {
  description = "Current Terraform workspace"
  value       = terraform.workspace
}
