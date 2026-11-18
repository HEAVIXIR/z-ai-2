# HEAVIX Industrial & Mining Commerce Domain — ADR-001

- Date: 2026-11-18
- Status: **Proposed architecture / implementation gate**
- Branch: `integration/preview-readiness-workerd-2026-11-15`
- Scope: Main marketplace domain, Prisma design, listing wizard boundaries
- Owner direction: cover industrial and mining commerce broadly; no paid tools or services; keep Production isolated.

## 1. Decision summary

HEAVIX is an industrial and mining commerce platform, not a machinery classifieds clone. It must support:

- equipment, vehicles, machines, parts, attachments and industrial products;
- minerals, bulk materials, commodities, stockpiles, supply contracts and offtake;
- equipment and asset rental, including rental requests;
- industrial, mining, engineering, logistics and maintenance services;
- mine construction, operation, development, EPC/EPCM, drilling, extraction, processing and rehabilitation contractors;
- procurement, RFQ/RFI/RFP/RFB, tenders, sealed bids and reverse auctions;
- jobs, specialist workforce and contractor teams;
- mining assets/projects, licences/tenements, project sale, farm-in/farm-out, joint ventures, strategic partnerships and investment opportunities;
- financing/leasing partner referrals and machine/project dossiers;
- future international trade, logistics, inspection, insurance and compliance workflows.

These capabilities must share identity, company, category, industry, location, attributes, documents, media, search, permissions, audit, workflow and provenance infrastructure. They must **not** be collapsed into one overloaded Listing or one generic JSON blob.

## 2. Cost and operational guardrails

- Free-tier and already-connected tools only. No wallet top-ups, paid trials, paid API calls, paid automation, or paid feature activation.
- If a task cannot be completed with the free/current stack, record it as blocked and offer a manual/free alternative.
- Work only on `integration/preview-readiness-workerd-2026-11-15`; PR #340 remains Draft.
- No Production merge/deploy, DNS changes, or Production DB access.
- Preview DB migrations are allowed only within the owner's approved Preview scope, after read-only identity/history diagnostics, a paired encrypted B2 backup, and the repository workflow's explicit preconditions. Never run `db push` as a shortcut. No migration has been applied by this ADR.
- Investment participation, capital pooling, escrow, payment, lending or fund handling remain disabled until the legal gates in `docs/PRODUCT-MACHINERY-INVESTMENT.md` and financing partner gates are formally passed. Design-time schema is not authorization to solicit or collect money.

## 3. Verified current-state inventory (Integration source)

### Main Prisma

- `Category` already separates CATALOG / MARKETPLACE / SERVICE / FALLBACK layers.
- `ApplicationIndustry` and `CategoryApplicationIndustry` already represent industry applicability separately from category.
- `Brand`, `BrandAlias`, `BrandFamily`, `BrandIndustry`, `BrandCategory`, `BrandDomain`, `ProductModel`, `ModelCategory`, `Generation`, `Product` and dynamic attribute/provenance models already exist. Do not create parallel brand/model/taxonomy engines.
- `Listing` is the current offer-side aggregate and already has rental legacy fields, location, category/brand/model/product, dynamic attributes, media, company/user ownership, service type, auctions and deal/inspection/transport relations.
- `BuyRequest` is the current demand-side aggregate, but stores category/brand as text, quantity is not persisted, and structured attributes / canonical location IDs are incomplete.
- `RFQ` and `RFQQuote` exist in the legacy SQLite schema and RFQ already has a current Main model; retain their behavior while inventorying all callers before any consolidation.
- `Auction` and `AuctionBid` exist; auction is a deal mechanism/process, not a commercial intent or product category.
- `Company`, `CompanyDocument`, `CompanyBranch`, `CompanyVerification`, `CompanyPartner`, `DealRoom`, `Inspection`, `TransportRequest`, `MachinePassport`, `PriceObservation` and audit/AI infrastructure already cover useful shared capabilities.
- Main `TransactionType` remains a simple lookup; current seed contains legacy keys `SALE`, `RENT`, `WANTED`, `QUOTE`, `AUCTION`, `SERVICE_REQUEST`. Current wizard also references `SERVICE_OFFER`. Do not remove or rename stored keys until compatibility mapping and read/write usage are proven.

### Store Prisma (separate database)

- Store schema contains `RentalListing` / `RentalBooking`, `ServiceProvider` / `ServiceRequest`, `ProcurementRequest`, `PurchaseOrder` / `PurchaseOrderItem`, suppliers, inventory and shipping.
- These models are relevant source material, but the Store database is a distinct bounded context. Do not add cross-database Prisma relations or copy Store tables into Main. Determine whether a workflow is storefront/parts procurement (Store) or public industrial marketplace procurement (Main) before implementation.
- `ProcurementRequest` in Store currently represents internal procurement and purchase orders. It is not automatically the public mining tender model.

### Legacy schema

- `prisma/legacy-sqlite/schema.prisma` contains richer RFQ/RFQQuote and Auction/AuctionBid designs and industrial term/alias concepts. Treat it as behavior/reference material only; SQLite migrations/schema cannot be applied to PostgreSQL.
- No evidence in the inspected legacy Main schema that a complete Mineral / MiningProject / Contractor / Employment domain already exists. Search all historical repositories and docs before asserting those domains are absent globally.

## 4. Canonical axes — no overlap

1. **Commercial intent** — what the actor is doing: offering or requesting sale, rental, service, workforce, project, commodity or investment opportunity.
2. **Subject / catalog taxonomy** — what the offer/request concerns: machine, part, mineral, project, service, workforce, etc.
3. **Deal mechanism** — how parties reach agreement: fixed/negotiable/direct, RFQ, RFI, RFP, RFB/ITB, open/sealed tender, forward/reverse auction, booking, framework agreement.
4. **Commercial terms** — quantity, units, grade, price basis, currency, delivery, rental duration, milestones, payment terms, Incoterms and availability.
5. **Workflow lifecycle** — domain-specific states; do not force tender, job, listing, rental and investment into one status enum.
6. **Parties and authority** — user, company, branch, buyer, supplier, contractor, employer, candidate, licence holder, investor, operator, evaluator and regulator.
7. **Evidence and provenance** — source, document, verification, effective date, jurisdiction, confidence and audit trail.

Category is not transaction intent. Industry is not category. Auction/tender is not a transaction intent. ServiceType is not service direction. Investment opportunity is not a normal sale listing.

## 5. Commercial intent registry (target)

Eight primary intents for the first marketplace navigation/registration layer:

| Canonical key | Persian label | Direction | Domain |
|---|---|---|---|
| `SALE_OFFER` | عرضه برای فروش | OFFER | Asset / product / commodity |
| `PURCHASE_REQUEST` | درخواست خرید | REQUEST | Asset / product / commodity |
| `RENTAL_OFFER` | عرضه برای اجاره | OFFER | Rental asset |
| `RENTAL_REQUEST` | درخواست اجاره | REQUEST | Rental asset |
| `SERVICE_OFFER` | عرضه خدمات | OFFER | Service / project work |
| `SERVICE_REQUEST` | درخواست خدمات | REQUEST | Service / project work |
| `JOB_OFFER` | فرصت شغلی / جذب نیرو | OFFER | Employment |
| `JOB_SEEKER` | جویای کار | REQUEST | Employment |

Project and investment opportunities are a **separate project/opportunity workflow family**, not an arbitrary ninth or tenth listing intent. Their deal structures can include sale, lease, farm-in/farm-out, JV, royalty/streaming, offtake, asset acquisition or partner search.

### Legacy compatibility map (provisional, not yet executable)

- `SALE` → `SALE_OFFER`
- `RENT` → `RENTAL_OFFER`
- `WANTED` → `PURCHASE_REQUEST`
- `SERVICE_OFFER` → `SERVICE_OFFER`
- `SERVICE_REQUEST` → `SERVICE_REQUEST`
- `QUOTE` → procurement mechanism / RFQ workflow; not an intent
- `AUCTION` → auction mechanism attached to an eligible offer/project; not an intent

No key is renamed/deleted until all API/UI/seed/analytics/search/SEO/database uses are inventoried and a backward-compatible rollout is tested.

## 6. Domain map and canonical entities

### 6.1 Shared foundation (reuse)

- `User`, `Company`, `CompanyBranch`, `CompanyMembership`, `CompanyDocument`, `CompanyVerification`
- `Category`, `Brand`, `ProductModel`, `Product`, `ApplicationIndustry`
- `Country`, `Province`, `City`
- `AttributeDefinition`, `CategoryAttribute`, typed attribute values and provenance
- media assets, documents, audit, moderation, saved search, messaging, notifications, search and price observations

### 6.2 Equipment and industrial catalog

Reuse Product/Listing, Brand/Model, categories and dynamic attributes for:
machines, vehicles, industrial plants, spare parts, attachments, tools, generators, pumps, compressors, processing equipment, crushing/screening plants, drilling equipment and agricultural/forestry/port equipment.

Required cross-domain capabilities: serial/asset identity, manufacturer model/generation, year, operating hours, condition, ownership/title, service history, inspection, maintenance records, attachments compatibility, parts compatibility, warranty, location, availability and evidence. Do not create one table per machine class.

### 6.3 Minerals and bulk materials

A mineral commodity is not a machine ProductModel. Introduce a commodity/specification catalogue (or a carefully typed product extension after audit) for:
- commodity / mineral / material and product form;
- chemical composition, grade, assay values, moisture, impurities, particle/size distribution and test method;
- origin country, mine/site, stockpile/warehouse, loading point and chain of custody;
- quantity, unit (kg, t, DMT, WMT, m³, oz, lb as applicable), minimum/maximum lot, production capacity, available stock and delivery schedule;
- price basis (per unit / index-linked / formula), currency, taxes/royalties where relevant, Incoterms, transport mode, packaging and destination;
- laboratory certificate, assay report, origin certificate, mining/export permits, environmental/social evidence and expiry/verification metadata.

Model mineral sale/supply as an offer and mineral sourcing as a request. Support spot cargo, recurring supply, long-term supply, offtake and blended/combined lots without creating duplicate "mineral listing" and "mineral request" tables for each commodity.

### 6.4 Mining assets and projects

A mine/project is a durable asset/opportunity, not just a commodity listing. Proposed bounded context:
- `MiningProject`: identity, name, project stage (greenfield/exploration/resource/development/construction/operating/care-and-maintenance/closure), commodity set, location, area, ownership/operating company, project summary and lifecycle.
- `MiningTenement` / `ProjectRight`: licence/permit/tenement identifiers, jurisdiction, issuing authority, type, holder, status, effective/expiry dates, area/geometry reference, transfer/assignment restrictions and document evidence.
- `ProjectTechnicalReport`: report type, author/competent-person reference, standard/version (e.g. jurisdiction-specific reporting code), effective date, file, verification and confidentiality.
- `ResourceEstimate` / `ReserveEstimate`: commodity, classification, quantity, grade, cutoff assumptions, effective date, reporting standard and independent competent-person evidence. Never present inferred/AI-extracted values as verified reserves.
- `ProjectMilestone`, `ProjectDocument`, `ProjectStakeholder`, `ProjectSite` and `ProjectProductionSnapshot` as separate related records only where queryability/lifecycle requires them.

Project deal structures: asset sale, share sale, licence/tenement assignment, lease, farm-in/farm-out, earn-in/work commitment, JV, strategic partner, royalty/streaming, offtake, toll processing and project finance referral. Keep deal structure separate from project stage and commodity.

### 6.5 Mining contractors and work packages

Reuse Company as the legal organization identity. Add a typed `ContractorProfile` specialization only if no existing company capability model can represent it:
- contractor disciplines: mine development, drilling/blasting, earthworks, open-pit, underground, haulage, crushing/processing, plant construction, EPC/EPCM, maintenance, environmental, closure/rehabilitation, surveying/geology/lab services;
- capability statements, equipment fleet, workforce capacity, geographic coverage, project references, certifications, HSE metrics, insurance and licence evidence;
- `WorkPackage` / `ProjectScope`: deliverables, quantities, drawings/specifications, site conditions, schedule, milestones, payment basis and qualification criteria;
- contractor prequalification, tender participation, clarifications, technical/commercial submissions, evaluation, award, contract, variation, progress claim, acceptance and closeout.

A contractor's general service profile is not the same as a particular project work package or tender submission.

### 6.6 Procurement and tendering

Use distinct procurement method codes: `RFI`, `RFQ`, `RFP`, `RFB/ITB`, `OPEN_TENDER`, `SEALED_TENDER`, `DIRECT_NEGOTIATION`, `REVERSE_AUCTION`. A forward auction is different from a reverse auction.

Target capabilities:
- sourcing event, lots, line items, specifications, units, delivery sites, budget/range, currency, deadlines/timezone and eligibility;
- open vs invited suppliers; qualification and prequalification;
- questions, clarifications, addenda/versioning and deadline extensions;
- encrypted/private supplier submissions, immutable timestamps, late bid rejection and controlled opening;
- technical/commercial evaluation criteria and weights, evaluator assignments, conflict-of-interest declarations, scoring, award notice, contract and audit;
- bid/quote revisions, withdrawal, counteroffers, disqualification, cancellation and appeal/dispute trail.

Do not expose one supplier's quote to another. The public marketplace procurement lifecycle must not be confused with Store's internal `ProcurementRequest` and `PurchaseOrder` tables. Existing Main `RFQ` is a compatibility candidate; first inventory and map it, then decide whether to evolve it into the sourcing-event aggregate or maintain a one-to-one typed extension. Do not create a second competing RFQ engine.

### 6.7 Rental

Reuse Main Listing rental compatibility fields and audit Store `RentalListing`/`RentalBooking` behavior. Long-term canonical design should support:
- rental offer and rental request;
- asset/quantity, hourly/daily/weekly/monthly/project pricing, currency, minimum/maximum duration, deposit, operator, fuel, transport, mobilisation/demobilisation, availability calendar, inspection/maintenance, damage/insurance, cancellation, site induction and return condition;
- quote/booking/reservation, schedule conflict prevention, contract, handover, meter readings, extensions, incidents, return inspection and settlement.

Do not add a second rental subsystem until Main-vs-Store ownership and user journey are decided.

### 6.8 Services, employment and logistics

Services: keep ServiceType taxonomy separate from offer/request direction; support provider qualifications, service area, response time, SLA, call-out, mobilization, scope, deliverables, milestones, warranty and evidence.

Employment: separate `JobOpportunity`, `CandidateProfile`, `JobApplication`, screening/interview and offer/contract lifecycle. Candidate profile visibility is opt-in; sensitive identity/contact data is access-controlled and never public by default. Model roster/rotation, shift, remote/site, qualifications, certifications, experience, compensation range and work authorization.

Logistics: reuse/extend TransportRequest with route, cargo dimensions/weight, equipment, permits, escort, loading windows, delivery evidence, carrier qualifications, insurance and quote lifecycle. Do not duplicate it as a generic service listing.

### 6.9 Investment and financing

Preserve the existing `docs/PRODUCT-MACHINERY-INVESTMENT.md` and `docs/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md` as governing product constraints. Four documented investment models remain design-only:
A) capital pool for buy/sell; B) partner-originated installment financing; C) used machinery acquisition/refurbishment/resale; D) rental income.

Project investment may add mining-project specific opportunity profiles (equity/JV, farm-in/earn-in, royalty/streaming, project debt, equipment finance, offtake/prepayment, working capital) but must not bypass:
- verified legal entity/operator and jurisdiction;
- approved disclosures and risk statements;
- investor classification/KYC and sanctions/AML controls where applicable;
- documented escrow/custodian and segregated accounts;
- audit trail and independent accounting;
- no guaranteed-return language;
- no fund collection, pooled capital, payment endpoint or participation CTA before external legal sign-off and all platform rollout gates.

Until those gates pass, only draft/evaluation/education and private non-binding enquiries may be considered, subject to permissions and legal review.

## 7. Cross-cutting data standards

- Use canonical IDs for category, brand/model, company, locations and related entities; preserve legacy text columns through migration/backfill.
- Use exact decimal/precision strategy for quantities, grades and money; never use Float for high-integrity financial values. Define units and conversion dimensions.
- Currency is explicit per amount; store amount + currency code and price basis. Do not infer currency from locale.
- Store instants as timezone-aware DateTime/UTC with explicit business timezone on deadlines; never parse local date as UTC silently.
- Version flexible JSON payloads and use relational columns for frequently filtered, joined, indexed or permission-sensitive data.
- Every technical/commercial fact records provenance: seller, manufacturer, lab, competent person, regulator, admin, imported source, AI extraction or AI inference; verification state and timestamp.
- Documents have classification, owner, access policy, retention, expiry and checksum; private deal/tender/investment documents are not public media.
- Use soft-archive/versioning for catalog and regulated records; immutable audit for bids, awards, legal gates and fund-related events.
- Add indexes for actual access patterns; unique constraints for external IDs within issuer/jurisdiction; use FK actions that preserve evidence.
- Avoid Postgres-only types/functions that break the Workerd/Prisma client generation unless explicitly supported and covered by CI.
- Main and Preview schemas must remain structurally aligned; Store remains a separate client/database with no Prisma cross-database relation.

## 8. Global benchmark evidence (patterns, not copy targets)

- Schema.org Offer / GoodRelations distinguishes sell, lease, repair and demand; use it as an interoperability vocabulary, not as HEAVIX's internal schema.
- World Bank procurement methods distinguish RFP, RFB, RFQ and direct selection, with different complexity and evaluation patterns. WHO describes separate RFQ/ITB/RFP use and evaluation. Adopt process distinctions, not institutional legal rules wholesale.
- MinesOnline markets mining projects and investment/farm-in opportunities; MINEX distinguishes mineral supply from buyer sourcing requests, grade, origin, quantities and documents; MineralTrade separates mineral rights, minerals, equipment and services; other mining deal platforms surface project type, commodity, jurisdiction, area, tenement/licence IDs and deal structure.
- These patterns support keeping commodity trade, mining project rights, contractor work and capital opportunity as distinct but connected bounded contexts.

References:
- Schema.org Offer: https://schema.org/Offer
- World Bank Procurement Regulations, approved selection methods: https://thedocs.worldbank.org/en/doc/6c0602876d68949e80820507d90a14ed-0290012023/original/Procurement-Regulations-September-2023.pdf
- WHO procurement principles/processes: https://www.who.int/about/accountability/procurement/principles-and-processes
- MinesOnline: https://www.minesonline.com/
- MINEX: https://minex.technology/
- MineralTrade: https://www.mineraltrade.com/en
- MineTrade: https://minetradeit.com/
- TessaVex Mine Market: https://www.tessavex.com/
- UN extractive industry financing paper (farm-in/farm-out concepts): https://financing.desa.un.org/sites/default/files/2020-06/CRP24_%20Extractive_Financial.pdf

## 9. Listing wizard: immediate completion boundary

The immediate deliverable is a dependable seven-step registration flow for currently supported, legally ordinary marketplace transactions. It must not wait for the future mining investment or tender modules.

### Step contract

1. **Intent** — explicit choice; no implicit SALE. Show only currently supported intents and clearly distinguish offer vs request.
2. **Subject** — category path filtered by the selected intent/domain; allow machine, part, attachment, mineral/material and industrial equipment where taxonomy data exists. Do not display an empty/unsupported branch as if it were ready.
3. **Identity** — brand/model only when applicable. Minerals, services and projects must not be forced to select a machine brand/model.
4. **Specifications** — dynamic, inherited, typed attributes with unit validation, required/optional, unknown/not-applicable and provenance. Validate on server.
5. **Location** — canonical country/province/city plus site/mine/port/loading point where relevant; public precision may be coarsened for privacy.
6. **Commercial details** — intent-specific price, quantity/unit, currency, condition, availability, rental terms, service scope, mineral grade/origin/delivery and media/documents. Use conditional subforms, not a single bloated form.
7. **Review & submit** — immutable preview, seller/company identity, moderation state, consent, staged media ownership and clear success/error/retry. Final POST must atomically persist the primary aggregate and specialized child records.

### Immediate source-level blockers already known

- `WANTED` wizard still submits through `/api/listings`; canonical route is `/api/wanted` and canonical aggregate is `BuyRequest`. The current service maps category/brand IDs to text, quantity only to audit, and lacks structured demand attributes. This is a real data-loss gap.
- `RENT` currently models rental offer only; rental request is not represented as a distinct workflow.
- Current wizard has machine-oriented Brand/Model step; it must be conditional by subject, not mandatory for minerals/services/project opportunities.
- Main `Listing` already has rental fields; do not add duplicate columns until rental model audit is complete.
- Seller upload endpoint `/api/media/staging` requires auth, CSRF and rate limiting; confirm `media-service` provider and B2 persistence/readback/attachment on Preview before acceptance.
- Exact end-to-end acceptance still requires positive/negative tests for each supported transaction, media lifecycle, permissions, data persistence and seller/admin readback.

### Acceptance criteria

- No stale or implicit intent selection.
- Back/forward navigation preserves valid inputs and clears only dependent invalid selections.
- Each step has loading/empty/error/retry states.
- Category/attribute schemas are compatible with the selected subject.
- Server validates all client selections, ownership and transaction-specific terms.
- Request and offer records persist to their canonical aggregate; quantity and typed specs are not silently lost.
- No unauthenticated or cross-user staged media attachment.
- No public leakage of PENDING, private, sealed or confidential data.
- Audit and moderation transitions are present.
- Browser test proves a real Preview listing/request from start to readback.
- Exact-SHA CI and Workerd/OpenNext pass; no Production release from this workstream.

## 10. Implementation sequencing

**Batch A — finish ordinary listing flow first**
1. Inventory route/component/seed/API/permission callers and current test contracts.
2. Fix WANTED to use BuyRequest, preserving structured data; first prepare additive schema migration only after the migration gate is cleared.
3. Distinguish rental offer vs request, reusing the existing rental lifecycle where possible.
4. Make brand/model step conditional; ensure mineral/service subjects use their own attribute profiles.
5. Verify seller B2 media staging and attachment.
6. Run focused unit/contract tests, exact-SHA CI, OpenNext, then Preview browser journey.

**Batch B — canonical domain design and schema**
1. Produce ERD and intent × subject × mechanism × required-fields matrix.
2. Audit legacy Main schema, Store schema, old repository history and current APIs.
3. Build mineral commodity/lot schema; mining project/tenement/technical report/resource estimate; contractor capability/work package; sourcing/tender; employment; and investment opportunity model specs.
4. Generate schema diff and additive migration plan with data preservation and rollback/forward-repair.
5. Validate Main + Preview schema parity, Store separation, Workerd generator, seed idempotency and query indexes.
6. Apply to Preview only after paired encrypted backup and workflow preconditions; never Production.

**Batch C — phased release**
- Commodity listings and sourcing requests.
- Contractor profiles and project work packages.
- Mining projects/tenements and private due diligence.
- Tender and sealed-bid workflows.
- Employment and workforce.
- Financing referrals and investment opportunity drafts (legal gate locked).
- Capital participation/fund movement only after independent legal and compliance gates.

## 11. Decision log

- Do not create separate duplicate Category/Brand/Model/Service/Rental/Procurement engines.
- Do not make Auction, RFQ, RFP or Tender transaction intents.
- Do not treat mineral commodity supply as a MiningProject sale; one is a tradable material lot, the other a durable project/rights asset.
- Do not treat a contractor profile as a service listing or a tender response.
- Do not treat investment opportunity as an ordinary Listing or permit a public participation CTA before legal gate.
- Do not copy Store database tables into Main or create cross-database Prisma FKs.
- Do not implement every future feature in the first wizard release; design the extension points now, then ship in dependency order.


## 12. Intent × subject × mechanism compatibility matrix

This matrix is a validation contract. It does not imply that every row is already implemented or should appear in the first public wizard release.

| Intent | Eligible subjects | Normal mechanisms | Minimum specific data |
|---|---|---|---|
| SALE_OFFER | Machine, vehicle, part, attachment, industrial equipment, mineral/material lot, surplus inventory | Fixed price, negotiable, direct deal, forward auction | Subject/category, title, condition where relevant, quantity/unit where fungible, price/currency or contact-for-price policy, location/origin, seller/company, evidence/media |
| PURCHASE_REQUEST | Machine, part, attachment, equipment, mineral/material lot, consumables | Direct sourcing, RFQ, RFI, RFP, RFB/tender, reverse auction where suitable | Required subject/specification, quantity/unit, budget/currency, delivery/location, deadline, requester/company, substitution tolerance |
| RENTAL_OFFER | Machine, vehicle, plant, tool, industrial asset | Booking/reservation, quote, negotiated contract | Asset, rate basis/currency, availability, minimum duration, deposit, operator/fuel/transport, mobilisation, site, condition/inspection |
| RENTAL_REQUEST | Machine, vehicle, plant, tool, industrial asset | RFQ, invited quote, RFP/tender for large packages | Asset/spec, capacity, quantity, rental period, start/end window, site, operator/ancillary needs, budget, deadline |
| SERVICE_OFFER | Inspection, repair, engineering, mining contractor, drilling, processing, logistics, maintenance, lab/testing, environmental and consulting services | Direct negotiation, RFQ, RFP, framework agreement | ServiceType, scope, service area/site, qualifications/licences, capacity, schedule, deliverables, SLA, price basis, evidence |
| SERVICE_REQUEST | Same service subject families | RFQ, RFP, RFB/tender, direct selection | Scope/spec, site conditions, quantity/units, deliverables, schedule/milestones, HSE/site rules, budget, deadline, qualification criteria |
| JOB_OFFER | Employment roles, shift/roster, contract positions, project vacancies | Application, screening, interview, offer | Role, skills, certifications, experience, location/rotation, schedule, employment type, compensation range, employer and application deadline |
| JOB_SEEKER | Candidate profile and availability | Opt-in matching, application, recruiter contact | Skills, verified certificates, experience, availability, desired role/location/rotation, work authorization; identity/contact private by default |

### Subject-specific required field profiles

**Mineral / bulk material**
- Commodity/product form, grade and assay basis, moisture/impurity thresholds, size/spec, quantity and unit (including DMT/WMT where relevant), minimum lot, available stock/production capacity, origin/mine/loading point, delivery destination, Incoterms, price basis/currency, assay/lab/origin/permit documents.
- Distinguish measured assay, seller declaration, lab certificate, independent verification and AI extraction. A commodity lot is not a mineral right or mining project.

**Mining project / mineral right**
- Project stage, primary/secondary commodities, jurisdiction, licence/tenement IDs and holder, area, ownership/beneficial ownership, resource/reserve classification, reporting standard, competent person, effective date, infrastructure/access, permits, environmental/social status, capex/opex where disclosed, production history/capacity, technical reports and controlled data-room documents.
- Deal structure: asset/share sale, licence assignment, lease, farm-in/earn-in/work commitment, JV, royalty/streaming, offtake, toll treatment, strategic partnership or financing referral.
- Resource/reserve figures must never be promoted from AI-inferred or seller-entered to verified without source evidence and qualified review.

**Mining contractor / work package**
- Contractor company, discipline/capabilities, geographic coverage, equipment fleet, workforce capacity, licences/certifications, HSE system/record, insurance, references, project scale and availability.
- Work package: scope, quantities/units, drawings/specification revisions, site access/conditions, mobilisation, schedule, milestones, payment basis, acceptance criteria, HSE requirements, bonds/guarantees only where legally and commercially applicable.

**Procurement event**
- Method and stage, lots/line items, specs/units, supplier eligibility, public/invited/sealed visibility, clarification/addenda timeline, submission deadline/timezone, technical/commercial envelopes, evaluation criteria/weights, evaluator assignments, award and contract references.
- Sealed bids must be private until the configured opening event. The platform must retain immutable timestamps and audit all access/decisions.

**Investment opportunity (legal-gated)**
- Opportunity model A/B/C/D or project-specific equity/JV/farm-in/royalty/streaming/debt/offtake referral, underlying asset/project, operator legal identity, jurisdiction, target/use of proceeds, risk register, fees, term, exit scenarios, conflicts, disclosures and legal-review status.
- Until the legal rollout gate passes, no capital commitments, pooled funds, payments, escrow balances, subscriptions or participation calls-to-action. A draft opportunity record is not a financial product approval.

### First wizard release: supported scope vs later modules

The seven-step wizard should support only combinations whose API, schema, permissions and tests are ready. The intended release sequence is:

1. **First operational completion:** SALE_OFFER, PURCHASE_REQUEST (canonical BuyRequest), RENTAL_OFFER, SERVICE_OFFER and SERVICE_REQUEST, with existing Auction and RFQ as optional mechanisms where their data contracts are verified.
2. **Next controlled extension:** RENTAL_REQUEST and mineral commodity offers/requests after required persistence and unit/assay validation exist.
3. **Separate domain journeys:** contractor work packages/tenders, mining projects/tenements, employment and investment opportunities. These should have tailored wizards/data rooms, not be squeezed into the generic machine listing form.

The form may share seven visual steps, but the field schema and validation are conditional by subject and intent. The number of visible steps may collapse when a step is not applicable; a universal machine Brand/Model step is not mandatory for minerals, services or projects.


## 13. Progressive, subject-specific form composition — owner clarification (2026-11-19)

**Decision:** The registration wizard is a progressive form compiler, not a universal form with hundreds of optional fields. Each selection narrows the valid subject and the next form contract. By the technical-specification step, the system must resolve one applicable specification profile (or a small, explicitly composed set of profiles) for the selected intent + full category path + subject class + optional brand/model + applicable product generation. Only fields in that resolved profile are rendered.

### 13.1 Resolution inputs and precedence

1. Commercial intent / direction (for example sale offer vs rental offer vs rental request).
2. Full terminal category path, not just the root category.
3. Subject class and technical family (for example heavy equipment → mining equipment → excavator).
4. Capacity / size / operating class when represented in taxonomy (for example 22-ton class).
5. Brand, model and generation when applicable and selected.
6. Intent-specific commercial profile (sale, rental, purchase request, service request, etc.).

The resolved form is the intersection of applicable subject specifications and intent-specific fields, with explicit overrides only where a narrower profile is defined. A model selection may refine or override category defaults; it must not silently erase inherited required attributes.

### 13.2 Separate profiles, shared renderer

- Excavator, wheel loader, bulldozer, crusher, drill rig, mineral lot, mining project, contractor work package and employment each have distinct specification profiles.
- Sale excavator and rental excavator share core equipment identity/specifications but use different commercial/operational sections (price vs rate basis, availability window, minimum term, deposit, operator/fuel/transport, mobilisation, inspection and handover).
- Mineral commodity forms use assay/grade, moisture, impurities, size, quantity/unit, origin, lot/stock, delivery and certificates; they do not show engine, gearbox, hydraulic or machine model fields.
- Contractor/work-package forms use discipline, scope, fleet/workforce capacity, site, HSE, qualifications, milestones and deliverables; they do not reuse a machine product form.
- Brand/model controls are conditional capabilities of a subject profile, never mandatory wizard steps for subjects where they do not apply.

The renderer and typed validation components may be shared. The field definitions, sections, applicability and validation contracts must remain domain-specific. This avoids duplicating UI code without collapsing different domain forms into one schema.

### 13.3 Attribute definition and inheritance contract

- Category-level attributes provide defaults for a category family.
- Child-category attributes add or refine fields; inherited definitions are de-duplicated by stable attribute key.
- Model/generation-level attributes refine only that model/family and carry explicit precedence and compatibility rules.
- Intent-specific profiles add commercial fields without polluting the technical identity schema.
- Every field carries stable key, type, unit/dimension, requiredness, display order, section/group, applicability, validation constraints, filter/search visibility, and provenance/verification semantics where relevant.
- Values are stored with typed validation and canonical IDs; unit conversions are dimension-aware. Numeric values are never accepted without their declared unit where the dimension requires one.
- Unknown, not applicable, not disclosed and not yet measured are distinct states where the domain needs them; they must not be conflated with zero or an empty string.

### 13.4 UI behavior and data integrity

- Each prior selection narrows the next step and determines which step sections are visible. Non-applicable steps collapse or are omitted rather than showing empty generic controls.
- Changing an upstream selection invalidates only dependent downstream selections/values, with a clear confirmation when user-entered data would be discarded.
- The technical step is grouped into meaningful sections (e.g. general, engine/powertrain, hydraulic, undercarriage, dimensions/capacity, cabin/safety), not one flat list.
- Show required fields first, then relevant optional fields; advanced/rare fields may be progressively disclosed. Do not render hundreds of irrelevant attributes.
- The server independently resolves and validates the same profile from canonical IDs. It must not trust a client-supplied profile ID, category path, model compatibility or arbitrary attribute keys.
- Persist the resolved profile/version with the submission so later taxonomy edits do not reinterpret historical listing data.
- Acceptance tests must prove at least: a model-specific excavator form, a different loader form, mineral lot form, rental excavator form, and contractor/work-package form; assert both required fields and absence of irrelevant fields.

### 13.5 Implementation gate

The current AttributeFields component is a generic typed renderer and the category endpoint is already requested with categoryId + optional modelId. That alone does **not** prove full path, subject-class, generation or transaction-specific profile resolution. Before claiming this requirement complete, inspect and extend the actual attribute API, Prisma relations/seeds/admin tooling, and server-side listing validation. Do not solve it with hard-coded frontend conditionals or one giant attribute catalogue. Build a canonical, versioned profile-resolution contract and cover it with contract tests before changing the user-facing wizard.

## 14. Canonical taxonomy redesign — owner clarification (2026-11-19)

**Decision:** Build a stable hierarchy for what a subject is, and model application/industry, commercial intent, service activity and configuration as separate dimensions. Do not create duplicate machine identities to represent different industries.

### 14.1 Separate dimensions
1. Commercial intent: sale offer, purchase request, rental offer/request, service offer/request, job offer/seeker. Not a category.
2. Subject taxonomy: machinery/equipment, parts/components, minerals/materials, services, workforce, projects/assets.
3. Machine family/type: excavator, wheel loader, bulldozer, grader, crane, dump truck, crusher, drill rig, pump, compressor. One canonical identity per type.
4. Application/industry: mining, road construction, civil/building construction, concrete, asphalt, recycling, ports/material handling, agriculture/forestry, energy/process industry. Many-to-many with machine types.
5. Configuration/capacity: operating-weight band, payload, bucket capacity, power, reach, track/wheel configuration. Prefer typed attributes or controlled ranges, not arbitrary category children.
6. Brand/model/generation: only when relevant and compatible with the selected subject.
7. Service activity: trading/import-export, maintenance/repair/overhaul, inspection/testing, engineering, construction/installation, mining contracting, drilling/blasting, logistics, environmental/rehabilitation.
8. Service subject: equipment family/type, material, plant, site or project. A repair service for an excavator references the same canonical excavator type used by sale and rental.

### 14.2 Navigation and data rules
- Each canonical tree node has one semantic meaning and one parent. Do not create Mining Excavator and Road Excavator as separate machine types.
- Use explicit many-to-many applicability relations for machine type ↔ application/industry and service activity ↔ subject family/type.
- Contextual navigation may combine dimensions without creating duplicate category rows.
- Example UI path: Heavy machinery → Mining equipment → Excavator → 20–25 tonne class. In the canonical model Excavator is the machine type; Mining is its application. The UI resolves to the same excavator ID used in Heavy machinery → Road equipment → Excavator.
- Service path: Services → Repair → Heavy machinery → Excavator. It reuses the canonical excavator type/specification profile and adds repair scope fields.
- Parts are classified by component family and linked to compatible machine families/models; do not force parts into the machinery tree.
- Rental is an intent/workflow: Rental → Heavy machinery → Excavator. Compose excavator technical fields with rental-specific rate, duration, deposit, availability, operator/fuel/transport and mobilisation fields.
- 22 tonne is a capacity/configuration class, not a machine type or brand/model.
- Never delete/re-parent existing taxonomy records in place. Inventory IDs and create explicit old-to-new mapping, aliases and redirects.

### 14.3 Proposed top-level navigation (draft, subject to audit)
- Machinery & equipment: heavy machinery; light/compact machinery; industrial plant/process equipment; material handling/lifting; power generation/utilities; agricultural/forestry/port equipment.
- Parts, components & attachments.
- Minerals, metals & bulk materials.
- Services: trading/import-export; maintenance/repair/overhaul; inspection/testing/certification; engineering/consulting/design; construction/installation/commissioning; mining contracting/operations; drilling/blasting/extraction/processing; logistics/transport; environmental/safety/rehabilitation.
- Workforce & employment.
- Mining projects, assets & rights (separate controlled journey).
- Procurement events (RFI/RFQ/RFP/RFB/tenders; mechanisms/workflows, not equipment categories).

This is not yet the final dictionary or a database mutation. Validate against existing HEAVIX docs, seeds, APIs, category/attribute/model links, listing counts, search facets, UNSPSC crosswalks and official manufacturer product families. External standards are crosswalks, not a blind replacement for user navigation.

### 14.4 Progressive form resolver
Resolve the form from intent + canonical subject family/type + selected application context + capacity/configuration + compatible brand/model/generation + intent-specific commercial profile. Technical attributes come from subject/model profiles; commercial fields from intent; service scope from service activity. Retain application context even when it is not itself a canonical category.

### 14.5 Execution sequence and gate
1. Export taxonomy IDs, parent IDs, slugs, active/order, intent links, category-attribute links, brand/model links and listing counts.
2. Audit historic docs, old repositories, seeds, issues/PRs, APIs and Store taxonomy; distinguish historical proposals from runtime truth.
3. Compare to UNSPSC and official manufacturer product-family taxonomies, recording source and mapping confidence.
4. Publish canonical Persian/English dictionary: definition, inclusion/exclusion, synonyms, parent, application tags, eligible intents and form-profile key.
5. Create old-ID → canonical-ID mapping; preserve listing history, slugs, SEO routes and attribute values.
6. Define machine type/application separately, including multi-application machinery.
7. Build versioned specification profiles and server-side form resolution.
8. Then update seed/admin/API/search and prepare additive migration. Preview backup gates remain mandatory; Production untouched.

**Status:** architecture decision recorded. Export, historical audit, external crosswalk, final dictionary, mapping, migrations and runtime wizard integration remain outstanding; no claim of completed normalization.