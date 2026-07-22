# =============================================================
# Root module variable definitions
# All variable declarations are consolidated here to avoid
# duplicate-variable errors when Terraform loads the module.
# =============================================================

# --------------- General ---------------

variable "environment" {
  description = "Deployment environment (dev | staging | prod)"
  type        = string
}

variable "region" {
  description = "Primary AWS region where most resources are deployed"
  type        = string
  default     = "us-east-1"
}

variable "dr_region" {
  description = "Disaster-recovery AWS region used to mirror backups for cross-region resilience"
  type        = string
  default     = "us-west-2"
}

variable "enable_cross_region_backup" {
  description = "Whether to replicate AWS Backup recovery points to the DR region. Set false in dev/test to avoid DR-region costs."
  type        = bool
  default     = true
}

variable "project_name" {
  description = "Project name used in resource naming and cost-allocation tags"
  type        = string
  default     = "vertexchain"
}

# --------------- Networking ---------------

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs"
  type        = list(string)
}

# --------------- Tags ---------------

variable "cost_center" {
  description = "Cost-centre code for billing allocation"
  type        = string
  default     = "engineering"
}

variable "owner" {
  description = "Team or individual responsible for these resources"
  type        = string
  default     = "platform-team"
}

# --------------- RDS ---------------

variable "db_instance_class" {
  description = "RDS instance class (e.g. db.t3.micro for dev, db.t3.medium for prod)"
  type        = string
  default     = "db.t3.micro"
}

variable "db_password" {
  description = "RDS master password — supply via AWS Secrets Manager or CI secret"
  type        = string
  sensitive   = true
}

# --------------- ElastiCache / Redis ---------------

variable "redis_node_type" {
  description = "ElastiCache node type (e.g. cache.t3.micro)"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of Redis cache nodes (≥2 enables automatic failover)"
  type        = number
  default     = 1
}

# --------------- EKS node group ---------------

variable "eks_node_instance_type" {
  description = "EC2 instance type for EKS managed node group"
  type        = string
  default     = "t3.small"
}

variable "eks_desired_size" {
  description = "Desired number of EKS worker nodes"
  type        = number
  default     = 1
}

variable "eks_min_size" {
  description = "Minimum number of EKS worker nodes"
  type        = number
  default     = 1
}

variable "eks_max_size" {
  description = "Maximum number of EKS worker nodes"
  type        = number
  default     = 3
}

# --------------- Auto Scaling Group ---------------

variable "asg_min_size" {
  description = "Minimum ASG capacity"
  type        = number
  default     = 1
}

variable "asg_max_size" {
  description = "Maximum ASG capacity"
  type        = number
  default     = 3
}

variable "asg_desired_size" {
  description = "Desired ASG capacity"
  type        = number
  default     = 1
}

# --------------- Backup & DR ---------------

variable "backup_retention_days" {
  description = "Number of days to retain both primary and DR backups"
  type        = number
  default     = 30
}
