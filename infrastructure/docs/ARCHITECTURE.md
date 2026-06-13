# VertexChain Architecture

## System Overview

VertexChain is a decentralized geospatial social platform combining social curation, mapping, and on-chain ownership via Soroban smart contracts on the Stellar network.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VertexChain Platform                            │
├─────────────────┬─────────────────────┬─────────────────────────────┤
│   Frontend      │    Backend API      │     Blockchain              │
│   (Next.js)     │    (NestJS)         │     (Soroban/Stellar)       │
│                 │                     │                             │
│  • Map View     │  • REST/GraphQL     │  • Gist Registry Contract   │
│  • Social Feed  │  • Auth/Sessions    │  • Gist Token Contract      │
│  • Wallet Mgmt  │  • Geo Queries      │  • On-chain Metadata        │
│  • Analytics    │  • IPFS Integration │                             │
└─────────────────┴─────────────────────┴─────────────────────────────┘
         │                   │                    │
         │                   │                    │
         ▼                   ▼                    ▼
┌─────────────────┬─────────────────────┬─────────────────────────────┐
│    Infrastructure Layer (Docker / Kubernetes)                      │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ PostgreSQL│  │  Redis   │  │Prometheus│  │   OpenTelemetry   │  │
│  │ (PostGIS)│  │  Cache   │  │Gateway   │  │     Collector     │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────────┘  │
│        │            │            │              │          │        │
│        └────────────┴────────────┴──────────────┴──────────┘        │
│                       Observability Stack                          │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Frontend (`/Frontend`)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 15 (App Router) | SSR, routing, API routes |
| UI | React 19, Tailwind CSS v4 | Component rendering |
| Mapping | Leaflet + React-Leaflet | Geospatial visualization |
| Blockchain | Wagmi, viem, React | Stellar wallet interaction |
| State | React hooks, TanStack Query | Client state management |

**Key Pages:**
- Map view with geospatial pins
- User profiles and social feeds
- Pin creation/editing workflow
- Analytics dashboard

### Backend (`/Backend`)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | NestJS 11 | Structured API architecture |
| ORM | TypeORM 0.3 | Database migrations, entities |
| Database | PostgreSQL + PostGIS | Geo-spatial queries |
| Auth | Session-based / JWT | User authentication |
| Blockchain | ethers.js v6 | Soroban contract interaction |
| Validation | class-validator | DTO validation pipeline |

**Key Modules:**
- `AuthModule` - User authentication and sessions
- `PinsModule` - Pin CRUD, geo-queries
- `UsersModule` - User profiles and social graph
- `BlockchainModule` - Soroban contract calls
- `AnalyticsModule` - Metrics aggregation
- `DatabaseModule` - TypeORM configuration

### Data Layer

```
PostgreSQL (PostGIS)
├── users          # User accounts and profiles
├── pins           # Geospatial pin data
│   └── geometry   # PostGIS Point/Geometry columns
├── sessions       # Auth sessions
├── gists          # IPFS hash references
└── migrations     # TypeORM migration history

Redis
├── Cache          # API response caching
├── Rate Limit     # Request throttling
└── Sessions       # Session storage (optional)

IPFS
└── gist-content   # Decentralized pin content storage
```

### Blockchain Layer

```
Stellar Network (Soroban)
├── gist_registry
│   ├── register_gist(metadata_hash, location)
│   ├── transfer_gist(gist_id, new_owner)
│   └── burn_gist(gist_id)
├── gist_token (Stellar Asset)
│   ├── mint(beneficiary, amount)
│   ├── transfer(from, to, amount)
│   └── balance_of(account)
└── Soroban RPC
    └── Contract invocation & events
```

## Infrastructure Architecture

### Container Stack

```
┌──────────────────────────────────────────────────────────────┐
│                    Docker Compose / K8s                       │
├──────────────────┬───────────────────┬────────────────────────┤
│  backend         │  frontend         │  postgres               │
│  (NestJS:3000)   │  (Next.js:3001)   │  (PostGIS:5432)         │
│                  │                   │                          │
│  ├── OpenTelemetry│  └── OTEL SDK    │  └── PostGIS enabled    │
│  └── Prom client  │                   │                          │
├──────────────────┴───────────────────┴────────────────────────┤
│                    Observability Stack                        │
├──────────────────┬───────────────────┬────────────────────────┤
│  otel-collector  │  prometheus       │  grafana                │
│  (4317/4318)     │  (9090)           │  (3000)                 │
├──────────────────┼───────────────────┼────────────────────────┤
│  loki            │  jaeger           │  alertmanager           │
│  (3100)          │  (16686)          │  (9093)                 │
└──────────────────┴───────────────────┴────────────────────────┘
```

### Kubernetes Deployment

```
Namespace: vertexchain

Deployments
├── backend (2-3 replicas, HPA)
├── analytics (2 replicas, HPA)
├── otel-collector (1-2 replicas)
├── prometheus (1 replica, StatefulSet)
├── loki (1 replica, StatefulSet)
└── jaeger (1 replica)

Services
├── backend-service (ClusterIP)
├── analytics-service (ClusterIP)
└── ingress (nginx-controller, TLS)

Secrets
├── database-credentials
├── stellar-keys
├── session-keys
└── ipfs-gateway-credentials

PVCs
├── postgresql-data
├── prometheus-data
└── loki-data
```

## Technology Decisions

### Backend: NestJS
- Structured, opinionated framework for enterprise Node.js
- Built-in dependency injection, guards, interceptors
- TypeORM integration for database operations
- Swagger integration for API documentation

### Frontend: Next.js 15
- App Router with React Server Components
- Excellent DX with Turbopack for dev
- Built-in image optimization and routing
- API routes for server-side operations

### Database: PostgreSQL + PostGIS
- PostGIS for geospatial queries (radius search, bounding boxes)
- Strong consistency for financial/social data
- Mature ecosystem and tooling

### Blockchain: Soroban (Stellar)
- Lower transaction fees vs Ethereum
- Rust-based smart contracts
- Built-in asset issuance (Stellar Asset)
- Environment sustainability focus

### Observability: OTel + Prometheus + Jaeger + Loki
- OpenTelemetry for vendor-neutral instrumentation
- Prometheus for metrics and alerting
- Jaeger for distributed tracing
- Loki for log aggregation
- Grafana for unified dashboards

### IaC: Terraform + Helm
- Terraform for cloud infrastructure (VPC, EKS, RDS, etc.)
- Helm for Kubernetes application packaging
- Separation of concerns between platform and application

## Monitoring Strategy

### Metrics (Prometheus)
- Application metrics via Prometheus client and OTel exporter
- Infrastructure metrics via node-exporter
- SLI/SLO definitions tracked in alerts

### Traces (Jaeger via OTel)
- Auto-instrumentation for HTTP, database, blockchain calls
- Sample rate: 10% head-based, tail-based for errors/latency
- Trace context propagated across services

### Logs (Loki via OTel)
- Structured JSON logging in backend
- Filelog receiver for container logs
- Log-based alerting in Alertmanager

### Dashboards (Grafana)
- Infrastructure overview
- API latency and error rates
- Database performance
- Blockchain transaction status

## Security Architecture

```
Application Layer
├── Input Validation (class-validator)
├── Rate Limiting (@nestjs/throttler)
├── CORS (configurable origins)
├── Helmet (security headers)
└── Session Management (secure, httpOnly cookies)

Infrastructure Layer
├── TLS termination (Ingress / ALB)
├── Network Policies (K8s)
├── RBAC (least-privilege)
├── Secrets Management (External Secrets Operator)
└── Vulnerability Scanning (CI security gates)

Data Layer
├── PostgreSQL: pgcrypto for sensitive columns
├── Encryption at rest (AWS RDS / EBS)
├── Backup encryption
└── Secrets: never in code, never in logs
```

## Scalability Considerations

### Vertical Scaling
- Backend: ~1000 RPS per instance with current configuration
- Frontend: Edge-cached, serves static assets
- Database: Read replicas for analytics-heavy workloads

### Horizontal Scaling
- Backend: Stateless, scales behind load balancer
- Frontend: Stateless, multiple replicas
- Database: Streaming replication with hot standby

### Bottlenecks
- PostGIS queries: Spatial indexes mitigate complexity
- Soroban RPC: Connection pooling required
- IPFS: Gateway rate limits; pinning service for reliability
