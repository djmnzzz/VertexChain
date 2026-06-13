# Runbook: Database Down

**Severity:** P1 | **Team:** Infrastructure + Backend

## Symptoms
- `vertexchain_db_up` Prometheus metric = 0
- Backend returning 500 errors on all write endpoints
- Alert: `DatabaseDown`

## Diagnosis

```bash
# Check pod status
kubectl get pods -n vertexchain -l app=postgres

# Check logs
kubectl logs -n vertexchain -l app=postgres --tail=50

# Test connectivity from backend pod
kubectl exec -n vertexchain deploy/vertexchain-backend -- \
  pg_isready -h postgres-service -p 5432
```

## Resolution

1. **Restart StatefulSet** (if pod is crashlooping):
   ```bash
   kubectl rollout restart statefulset/postgres -n vertexchain
   kubectl rollout status statefulset/postgres --timeout=120s
   ```
2. **Check PVC** (if storage issue):
   ```bash
   kubectl get pvc -n vertexchain
   kubectl describe pvc postgres-data -n vertexchain
   ```
3. **Restore from backup** (last resort):
   ```bash
   ./infrastructure/scripts/restore-backup.sh latest vertexchain_prod
   ```

## Escalation
Immediate page to on-call DBA if not resolved within 5 minutes.

## Post-Mortem
Required for all P1 incidents. Use template in `incident-response.md`.
