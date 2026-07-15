# Contracts Contributing Guide

This guide is specific to the Soroban smart contracts in this workspace.
For general project contribution guidelines (JS/TS workspaces, PR process,
commit conventions) see the root [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Workspace Layout](#workspace-layout)
- [Adding a New Entry Point](#adding-a-new-entry-point)
- [Adding a New Contract](#adding-a-new-contract)
- [Error Enum Discipline](#error-enum-discipline)
- [Events Taxonomy](#events-taxonomy)
- [Testing](#testing)
- [Data-Model Migrations](#data-model-migrations)
- [Audit Checklist](#audit-checklist)

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Rust | >= 1.70 | [rustup.rs](https://rustup.rs) |
| `wasm32-unknown-unknown` target | — | `rustup target add wasm32-unknown-unknown` |
| `stellar-cli` | latest | `cargo install --locked stellar-cli --features opt` |

---

## Workspace Layout

```
contracts/
├── Cargo.toml              # Workspace root — defines members + shared deps
├── gist-registry/          # Location-aware gist registry
│   ├── Cargo.toml
│   └── src/lib.rs          # Single-file contract (types, errors, events, impl, tests)
├── multisig/               # Multi-signature wallet
├── governance/             # Proposal & voting
└── batch-wallet/           # Batch wallet creation/recovery
```

Every contract lives in a single `src/lib.rs` file. The canonical order
inside that file is:

1. `#![no_std]` + imports
2. `DataKey` enum (storage keys)
3. Domain structs (marked `#[contracttype]`)
4. Error enum (marked `#[contracterror]`)
5. Events struct + impl
6. Helper functions (private, not exposed as entry points)
7. `#[contract]` struct + `#[contractimpl]` impl block (entry points)
8. `#[cfg(test)] mod tests`

---

## Adding a New Entry Point

Use this checklist for every new public method on an existing contract.

### 1. Design

- [ ] Open or reference a GitHub issue describing the method.
- [ ] Confirm the method signature (return type, parameter types).
- [ ] Decide whether it mutates state or is read-only.
- [ ] If it emits events, define the topic shape (see [Events Taxonomy](#events-taxonomy)).

### 2. Implement

- [ ] Add the method inside the existing `#[contractimpl] impl Contract { ... }` block.
- [ ] First parameter is always `env: Env`.
- [ ] Use `Address` parameters for caller identity; validate with `env.auther().require_auth()` or `env.auther().require_auth_for_args(...)`.
- [ ] Return `Result<T, ContractError>` or use `panic_with_error!(env, Error::Variant)` — never `unwrap()` on user input.
- [ ] If a new storage key is needed, add a variant to the `DataKey` enum.
- [ ] If a new error condition arises, add a variant to the error enum (see [Error Enum Discipline](#error-enum-discipline)).
- [ ] If the method emits events, call the appropriate `Events` function.

### 3. Test

- [ ] Add at least one happy-path test.
- [ ] Add at least one error-path test using `#[should_panic(expected = "Error(Contract, #N)")]`.
- [ ] Add a comment above the `#[should_panic]` noting the error variant name and its `#[repr(u32)]` discriminant so it stays in sync.
- [ ] Run `cargo test --workspace` from the `contracts/` directory.

### 4. Submit

- [ ] `cargo fmt --all -- --check` passes.
- [ ] `cargo clippy --workspace --all-targets -- -D warnings` passes.
- [ ] `cargo build --workspace --target wasm32-unknown-unknown --release` compiles.
- [ ] PR title follows Conventional Commits (e.g. `feat(multisig): add pause entry point`).

---

## Adding a New Contract

1. Create a directory under `contracts/`:
   ```
   contracts/my-contract/
   ```
2. Add `Cargo.toml` following the standard template (see any existing contract's `Cargo.toml`).
3. Add the crate name to `[workspace.members]` in `contracts/Cargo.toml`.
4. Implement the contract in `src/lib.rs` following the file order in [Workspace Layout](#workspace-layout).
5. Add at least `initialize` + one business-logic method + tests.
6. Run the full workspace checks:
   ```bash
   cd contracts
   cargo fmt --all -- --check
   cargo clippy --workspace --all-targets -- -D warnings
   cargo test --workspace
   ```

---

## Error Enum Discipline

Every error enum must follow this pattern:

```rust
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum MyContractError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    // ... new variants below, always incrementing
}
```

### Rules

| Rule | Rationale |
|---|---|
| **Discriminants start at 1.** | `0` is reserved; Soroban treats it as "no error". |
| **Never reorder or remove variants.** | Existing `#[should_panic(expected = "Error(Contract, #N)")]` tests and off-chain indexers hard-code the discriminant. |
| **Always append new variants at the end** with the next integer. | Keeps existing discriminants stable. |
| **Always include `Overflow = N`** as the final variant. | Used for integer overflow guards. |
| **Derive `Ord` after `PartialOrd`.** | Required by Soroban's serialization. |
| **Use `panic_with_error!`** to raise errors. | Produces a typed error that clients can decode. |

### Common Variants

Every contract should define at minimum:

```rust
NotInitialized = 1,
AlreadyInitialized = 2,
Unauthorized = 3,
```

Add domain-specific variants after these three.

---

## Events Taxonomy

All events are published through an `Events` unit struct defined in each
contract file:

```rust
pub struct MyContractEvents;

impl MyContractEvents {
    pub fn something_happened(env: &Env, /* relevant data */) {
        let topics = (symbol_short!("domain"), symbol_short!("action"), /* optional id */);
        env.events().publish(topics, /* data tuple */);
    }
}
```

### Topic Conventions

| Field | Rule | Examples |
|---|---|---|
| `topic[0]` | **Domain symbol** — short noun identifying the contract area | `"batch"`, `"wallet"`, `"gov"`, `"tx"`, `"approve"` |
| `topic[1]` | **Action symbol** — verb or state-change noun | `"started"`, `"completed"`, `"created"`, `"executed"`, `"pending"`, `"record"` |
| `topic[2]` (optional) | **Entity ID** — the primary key of the affected entity | `batch_id`, `tx_id`, `proposal_id` |

### Data Payload

- Always a tuple of the relevant fields, in a consistent order.
- Include `env.ledger().timestamp()` in the data payload for time-sensitive events (governance, multisig execution).
- Clone owned types (`Address`, `String`) into the data tuple — do not borrow.

### Naming Rules

- Use `symbol_short!()` (<= 9 chars) for all topic symbols.
- Kebab or snake is fine for multi-word symbols but keep them short: `"batch"`, `"started"`, `"executed"`.
- Topic symbols should be stable — once published, do not rename.

### Example — Adding a Pause Event

```rust
// In the Events impl:
pub fn contract_paused(env: &Env, admin: &Address) {
    let topics = (symbol_short!("gov"), symbol_short!("paused"));
    env.events().publish(topics, (admin.clone(), env.ledger().timestamp()));
}
```

---

## Testing

All tests live inline in the `#[cfg(test)] mod tests` block at the bottom
of each contract's `src/lib.rs`.

### Running Tests

```bash
# All contracts
cd contracts
cargo test --workspace

# Single contract
cd contracts/multisig
cargo test
```

### Test Setup Pattern

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Env};

    fn setup_test_env() -> (Env, Address, MyContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths(); // Bypass authorization checks in tests

        let contract_id = env.register(MyContract, ());
        let client = MyContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        (env, admin, client)
    }

    #[test]
    fn test_happy_path() {
        let (env, admin, client) = setup_test_env();
        // ... assert expected behavior
    }

    #[test]
    // MyContractError::AlreadyInitialized = 2 (`#[repr(u32)]`) — keep in sync if enum is reordered.
    #[should_panic(expected = "Error(Contract, #2)")]
    fn test_cannot_initialize_twice() {
        let (env, _admin, client) = setup_test_env();
        let new_admin = Address::generate(&env);
        client.initialize(&new_admin);
    }
}
```

### Testing Rules

| Rule | Why |
|---|---|
| Call `env.mock_all_auths()` in setup. | Tests skip real signature verification; production auth is enforced by the runtime. |
| Use `Address::generate(&env)` for test addresses. | Deterministic but unique per test. |
| Use `#[should_panic(expected = "Error(Contract, #N)")]` for error paths. | Verifies the exact error discriminant fires. |
| Comment the discriminant number above `#[should_panic]`. | Keeps the test in sync if the error enum is ever reordered (which should not happen, but guards against accidents). |
| Add a setup helper function. | Reduces boilerplate across tests. |
| Test ledger state with `env.ledger().set_timestamp()` and `env.ledger().with_mut(...)`. | Controls time-dependent logic (deadlines, created_at). |

### CI Pipeline

The CI runs these checks on every PR touching `contracts/**`:

```
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo check --workspace --all-targets
cargo test --workspace
cargo build --workspace --target wasm32-unknown-unknown --release
```

All five must pass before merge.

---

## Data-Model Migrations

When you change a stored type (add a field, change a type, rename a
variant), you must handle existing on-chain data.

### Scenario: `u128` → Struct

**Before:**
```rust
#[contracttype]
pub struct Wallet {
    pub id: u64,
    pub balance: u128,  // plain integer
}
```

**After:**
```rust
#[contracttype]
pub struct Wallet {
    pub id: u64,
    pub balance: WalletBalance,  // richer type
}

#[contracttype]
pub struct WalletBalance {
    pub available: i128,
    pub locked: i128,
}
```

### Migration Steps

1. **Deploy the new contract** with the updated type definition.
2. **Write a migration entry point** (temporary, gated by admin):
   ```rust
   pub fn migrate(env: Env, admin: Address) {
       // 1. Verify caller is admin
       // 2. Read old storage, transform, write new format
       // 3. Set a migration-complete flag
       // 4. Emit a migration event
   }
   ```
3. **Run migration** on the target network:
   ```bash
   stellar contract invoke \
     --id <contract-id> \
     --fn migrate \
     --arg <admin-address> \
     --network testnet
   ```
4. **Remove the migration entry point** in the next release after confirming all instances have migrated.
5. **Update tests** to cover both old and new storage formats during the migration window.

### Storage Layout Rules

- Use `DataKey` enum variants — never raw `Bytes` keys.
- Version your storage by adding a `DataKey::Version` entry if the
  contract has already been deployed and you need to branch migration logic.
- Test migration on a fresh `Env` and on a "dirty" `Env` pre-loaded with
  old-format data.

---

## Audit Checklist

Before requesting a security review or deploying to mainnet, confirm every
item.

### Correctness

- [ ] All entry points validate `Address` authorization (`require_auth` / `require_auth_for_args`).
- [ ] No `unwrap()` or `expect()` on user-controlled values — use `Result` or `panic_with_error!`.
- [ ] Integer arithmetic uses checked ops or the contract compiles with `overflow-checks = true` (already set in release profile).
- [ ] Storage reads check `.has()` before `.get()` when the key may not exist.
- [ ] Pagination cursors and limits are bounded.

### Storage

- [ ] `DataKey` enum covers every storage access — no raw byte keys.
- [ ] No `StorageType::Persistent` used where `Instance` suffices (instance = config, persistent = large/runtime data).
- [ ] Storage is not written redundantly (write-once pattern for immutable records).

### Events

- [ ] Every state-mutating entry point emits an event.
- [ ] Topics use `symbol_short!()` — no dynamic strings in topics.
- [ ] Data payload includes enough info for off-chain reconstruction.

### Errors

- [ ] Error enum discriminants are sequential starting at 1.
- [ ] No variant has been removed or reordered since last deployment.
- [ ] All error paths are covered by `#[should_panic]` tests.

### Testing

- [ ] Happy-path test for every entry point.
- [ ] Error-path test for every `panic_with_error!` call.
- [ ] Edge cases tested: empty batches, zero thresholds, max-length inputs.
- [ ] `cargo test --workspace` passes.
- [ ] `cargo clippy --workspace --all-targets -- -D warnings` passes.
- [ ] `cargo fmt --all -- --check` passes.

### WASM Build

- [ ] `cargo build --workspace --target wasm32-unknown-unknown --release` succeeds.
- [ ] WASM binary size is reasonable (check with `ls -lh target/wasm32-unknown-unknown/release/*.wasm`).
- [ ] No debug symbols in release build (handled by `strip = "symbols"` in workspace profile).

### Deployment

- [ ] Contract has been deployed and tested on **testnet** before mainnet.
- [ ] Admin keys are secured (HSM or multisig — not a plain secret key).
- [ ] Initialization is idempotent or guarded by `AlreadyInitialized` error.
- [ ] If the contract replaces an existing one, a migration plan exists (see [Data-Model Migrations](#data-model-migrations)).

---

## Quick Reference

| Task | Command |
|---|---|
| Format check | `cargo fmt --all -- --check` |
| Lint | `cargo clippy --workspace --all-targets -- -D warnings` |
| Type check | `cargo check --workspace --all-targets` |
| Unit tests | `cargo test --workspace` |
| Build WASM | `cargo build --workspace --target wasm32-unknown-unknown --release` |
| Deploy (testnet) | `stellar contract deploy --wasm <path>.wasm --network testnet --source <identity>` |
