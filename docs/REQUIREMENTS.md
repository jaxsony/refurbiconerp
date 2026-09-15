# Requirement trace — Phases 1–6

Baseline: Multi Tenant Business Operations ERP SRS v1.0 (14 September 2026).

Every API, migration and test references one or more IDs below.

## Foundation (Phase 1)

| ID | Requirement | Implementation |
| --- | --- | --- |
| TEN-001 to TEN-008 | Tenant isolation, settings, context | Auth, tenant guard, provision |
| ADM-001 to ADM-006 | Branches, users, roles, sequences, audit, inbox | Organization + notifications |

## Tasks

| ID | Requirement | Implementation |
| --- | --- | --- |
| TSK-001 | Personal, team and department tasks | `POST /tasks` |
| TSK-002 | Checklists, comments, mentions, watchers and dependencies | Task sub-resources |
| TSK-003 | Recurring tasks | `POST /recurring-tasks` |
| TSK-004 | List, board, calendar and workload views | `GET /tasks?view=` |
| TSK-005 | Escalate overdue tasks | `POST /tasks/escalate-overdue` |
| TSK-006 | Convert linked entities into tasks | `POST /tasks/from-entity` |
| TSK-007 | Time spent and daily work logs | `POST /tasks/:id/time-logs` |
| TSK-008 | Notify assignees | Notification queue |

## CRM and sales

| ID | Requirement | Implementation |
| --- | --- | --- |
| SAL-001 | Capture leads | `POST /leads` |
| SAL-002 | Pipeline stage, probability, source, owner | Lead + Opportunity |
| SAL-003 | Duplicate customers | `GET /duplicates` |
| SAL-004 | Quotations, revisions, approvals | Quotations API |
| SAL-005 | Convert quotation to sales order | `POST /quotations/:id/convert` |
| SAL-006 | Price lists, tax, discount, credit | Pricing + credit check |
| SAL-007 | Reserve inventory | Approve order reserves stock |
| SAL-008 | Partial fulfilment, cancellation, returns | Fulfil / cancel / returns |
| SAL-009 | Targets, collections, margin | `GET /sales/performance` |
| SAL-010 | Customer timeline | `GET /parties/:id/timeline` |

## Inventory and procurement

| ID | Requirement | Implementation |
| --- | --- | --- |
| INV-001 | Items, services, SKU, tax, price lists | Products API |
| INV-002 | Stock by tenant, branch and warehouse | `Warehouse` + `StockBalance` |
| INV-003 | Receipts, issues, adjustments, reservations | Stock movements |
| INV-004 | Prevent negative stock | `negative_stock` setting |
| INV-005 | Locking and idempotency | Row lock + idempotency key |
| INV-006 | Purchase orders and goods receipts | Purchase order API |
| INV-007 | Serial and batch numbers | `SerialLot` |
| INV-008 | Reorder, ageing, valuation | `GET /inventory/reports/:kind` |

## Basic accounts

| ID | Requirement | Implementation |
| --- | --- | --- |
| ACC-001 | Chart of accounts, fiscal years | Ledger accounts |
| ACC-002 | Sales, purchase, receipt, payment, journal | Invoice / payment / journal |
| ACC-003 | Balanced double-entry | Invoice and payment posting |
| ACC-004 | Locked periods reject edits | Fiscal year lock + reverse |
| ACC-005 | Customer outstanding | `GET /receivables` |
| ACC-006 | Cost centres on journals | Journal `costCentre` |
| ACC-007 | Trial balance | `GET /trial-balance` |
| ACC-008 | Tax through product rates | Line tax |
| ACC-009 | Maker-checker for payments | `maker_checker_payments` |
| ACC-010 | Immutable posting | Voucher reverse-of |

## People (Phase 3)

| ID | Requirement | Implementation |
| --- | --- | --- |
| HR-001 | Employee master, designation, bank | `POST /employees` |
| HR-003 | Shifts, holidays, clock-in/out | Attendance API |
| HR-004 | Leave policy, request, approval | Leave API |
| HR-005 | Salary structures | `POST /salary-structures` |
| HR-007 | Payroll preview, approve, lock, publish | `/payroll-runs` |
| HR-010 | Employee self-service with masked bank | `GET /ess/me` |
| INC-001 | Incentive schemes | `POST /incentive-schemes` |
| INC-002 | Calculate with hold-until-paid | `POST /incentive-awards/calculate` |

## Service and dispatch (Phase 4)

| ID | Requirement | Implementation |
| --- | --- | --- |
| RMA-001 | Service tickets / RMA intake | `POST /service-tickets` |
| RMA-003 | Inspection and diagnosis | `POST /service-tickets/:id/diagnose` |
| RMA-004 | Estimate and customer authorization | estimate + authorize |
| RMA-005 | Consume spare parts | consume-parts |
| RMA-006 | Quality check then ready | qc + ready |
| DSP-001 | Pick lists from order or ticket | `POST /pick-lists` |
| DSP-003 | Pack, ship, AWB, tracking | Shipments API |
| DSP-006 | Proof of delivery | `POST /shipments/:id/proof` |

## Automation (Phase 5)

| ID | Requirement | Implementation |
| --- | --- | --- |
| REC-001 | Recurring rent/salary/AMC/subscription | `POST /recurring-schedules` |
| REC-002 | Spawn once per occurrence key | `POST /recurring-schedules/run` |
| BNK-001 | Bank accounts and imported feeds | Bank API |
| BNK-002 | Suggest and confirm matches | match + confirm |
| WAP-001 | WhatsApp conversations | Conversations API |
| WAP-003 | Inbound webhook idempotency | `POST /webhooks/whatsapp` |
| MKT-001 | Catalogue listing versions | Marketplace listings |
| MKT-002 | Idempotent marketplace orders | `POST /marketplace-orders` |

## Transition (Phase 6)

| ID | Requirement | Implementation |
| --- | --- | --- |
| RPT-001 | Operational reports | `POST /reports/:key` |
| MIG-001 | Import dry-run, commit, rollback | `/imports` |
| MOB-001 | Field devices | `/field/devices` |
| MOB-002 | Field clock-in | `POST /field/clock-in` |
| MOB-003 | Field sync | `GET /field/sync` |
| MOB-004 | Offline actions with idempotency | `POST /field/offline` |
| GOL-001 | Go-live readiness | `GET /go-live/readiness` |
