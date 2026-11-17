Format: flow-plan/1
Autonomy: checkpoints

# Cancel order endpoint

## Goal
As a customer I want to cancel an unshipped order so that I am not charged for it.
- A `POST /api/orders/{id}/cancel` endpoint cancels owned, unshipped orders.
- The order page shows a Cancel button that calls it.

## Scope
In: endpoint, service, UI button. Out: refunds.

## Architecture
Service method on `OrderService`; the UI calls the endpoint.

### API contract
```
POST /api/orders/{id}/cancel   auth: ROLE_USER (owner only)
  req:  { reason: string(1..200) }
  200:  { id: uuid, status: "CANCELLED", cancelledAt: ISO-8601 }
  404 order not found | 409 already shipped | 403 not owner
```

## Changes per layer
API: new endpoint. Service: cancel(). Database: none. UI: button.

## Risks
Race with shipping: mitigated by a status check in the transaction.

## Test strategy
Unit tests for the service, a controller test for the contract, a component test for the button.

## Wave 1

### T1: Order cancel service and endpoint
- Status: [ ] todo
- Worker: java-developer
- Size: M
- Sensitive: yes
- Contract: POST /api/orders/{id}/cancel
- Owns: src/main/java/shop/orders/OrderService.java, src/main/java/shop/orders/OrderController.java, src/test/java/shop/orders/
- Read first: src/main/java/shop/orders/OrderService.java, src/main/java/shop/orders/OrderController.java
- Depends on: none
- Done when: `mvn -q test -Dtest=Order*`
- Acceptance criteria:
  - Given an owned unshipped order When POST cancel Then 200 and status CANCELLED
  - Given a shipped order When POST cancel Then 409
  - Given a foreign order When POST cancel Then 403

### T2: Cancel button
- Status: [ ] todo
- Worker: frontend-developer
- Size: S
- Sensitive: no
- Model: sonnet
- Contract: POST /api/orders/{id}/cancel
- Owns: web/src/app/orders/order-detail/
- Read first: web/src/app/orders/order-detail/order-detail.component.ts
- Depends on: none
- Done when: `npm --prefix web test -- --watch=false`
- Acceptance criteria:
  - Given an unshipped order When the page renders Then a Cancel button is visible
  - Given a 409 response When the button is clicked Then an error message is shown

## Wave 2

### T3: Release note
- Status: [ ] todo
- Worker: node-developer
- Size: S
- Sensitive: no
- Model: haiku
- Tests: writer
- Contract: none
- Owns: docs/notes/cancel-order.md
- Read first: none
- Depends on: T1, T2
- Done when: `node -e "require('fs').accessSync('docs/notes/cancel-order.md')"`
- Acceptance criteria:
  - Given the endpoint exists When the note is read Then it lists the contract
  - No blocker or major findings after at most 2 fix rounds

## Follow-ups
