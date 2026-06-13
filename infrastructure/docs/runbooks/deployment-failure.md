# Runbook: Deployment Failure

**Severity:** P2 | **Team:** Infrastructure

## Symptoms
- CI/CD pipeline fails or pods stuck in `Pending`/`CrashLoopBackOff`
- Alert: `DeploymentFailed` or `PodCrashLooping`

## Diagnosis

```bash
# Check rollout status
kubectl rollout status deployment/vertexchain-backend

# Describe failing pods
kubectl describe pod -n vertexchain -l app=vertexchain-backend

# Check recent events
kubectl get events -n vertexchain --sort-by='.lastTimestamp' | tail -20
```

## Resolution

1. **Rollback immediately** if production is impacted:
   ```bash
   kubectl rollout undo deployment/vertexchain-backend
   kubectl rollout status deployment/vertexchain-backend --timeout=60s
   ```
2. **Fix and redeploy** after identifying root cause in logs/events.
3. **Check image pull errors** — verify registry credentials:
   ```bash
   kubectl get secret regcred -n vertexchain
   ```

## Escalation
If rollback fails → page on-call engineer immediately.

## Post-Mortem
File within 24 hours for P2 incidents. Template in `incident-response.md`.
