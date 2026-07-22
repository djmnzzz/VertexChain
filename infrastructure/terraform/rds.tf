# Variable declarations have been moved to variables.tf

resource "aws_db_instance" "postgres" {
  identifier        = "${var.project_name}-${var.environment}-postgres"
  engine            = "postgres"
  engine_version    = "15"
  instance_class    = var.db_instance_class
  allocated_storage = 20
  storage_encrypted = true

  db_name  = "vertexchain"
  username = "vertexchain"
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.postgres.name

  backup_retention_period   = 7
  monitoring_interval       = 60
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project_name}-${var.environment}-final"

  tags = { Environment = var.environment, Project = var.project_name }
}
