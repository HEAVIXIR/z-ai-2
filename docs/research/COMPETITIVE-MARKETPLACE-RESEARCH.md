# HEAVIX — Global Industrial Marketplace Competitive & Technology Research

- **Document:** `docs/research/COMPETITIVE-MARKETPLACE-RESEARCH.md`
- **Task ID:** 5 (STEP 11.29-R)
- **Agent:** `/research`
- **Scope:** Global industrial / heavy-machinery marketplace competitive landscape + practical technology capabilities, cross-checked against the HEAVIX schema (`prisma/schema.prisma`) and the architecture decisions recorded in ADR-005 and the Store Center Specification (see `/home/z/my-project/worklog.md`, STEP 11.27 / 11.28).
- **Mode:** Research only — NO code, schema, or PR modifications. NO merges.
- **Sourcing policy:** Every capability/market claim is tied to a real URL retrieved via web search. Where a credible source could not be found, the entry is marked `UNSOURCED — do not claim.` No market statistic is fabricated.

---

## 0. Methodology

1. Read `/home/z/my-project/worklog.md` (steps P2 → STEP 11.28) to understand:
   - **ADR-005** (Store Center architecture, 8 decisions): Store Identity extends `Company` (not a new model); VIP Showroom via new `Showroom` model; Lead status structured enum; `SalesTeamMember` new model; Smart Inventory Score (deterministic, versioned, cached); Machine Passport per-section verification fields; 11 new permission keys; Business Assistant is **advisory only — no mutations**.
   - **Critic findings (B1/B2/H1/H2/H3)** cross-verified against `prisma/schema.prisma`:
     - **B1 CONFIRMED:** `Company.logoUrl` (and `coverImage`, `verified`, `metaTitle`, `metaDescription`) already exist (schema.prisma L1177–L1215). "Store Identity" is not a new capability — it is an extension of existing fields.
     - **B2 CONFIRMED:** `MachinePassport` (schema.prisma L1149–L1159) has only `serialNumber`, `inspectionDate`, `inspectionResult`, and a `PassportEvent[]` log. It has **no per-section verification fields, no per-section verifier, no per-section verifiedAt** — ADR-005 decision #6 is required to add them.
     - **H1/H2/H3 CONFIRMED:** `PremiumSubscription` (schema.prisma L1126–L1143) is `userId @unique` — **per-user, NOT store/company-linked**. Any seller-side premium feature scoped to a Store/Company requires a schema change.
2. Verified HEAVIX data already on hand:
   - `PriceObservation`, `PriceEstimate` (with `priceLower`/`priceUpper`/`confidence`/`comparableCount`/`modelVersion`), `PriceOverride` — full price-engineering schema (L2061–L2123).
   - `ComparisonSession`, `ComparisonItem` — comparison-engine V1.0 (L2133+).
   - `AttributeDefinition` with `aiRelevant`, `labelFa`/`labelEn`/`nameEn`, and `ListingAttributeValue` with provenance (`sourceType` ∈ {`SELLER_INPUT`,`MANUFACTURER_DOCUMENT`,`AI_EXTRACTION`,`AI_INFERENCE`,`ADMIN_VERIFIED`,`IMPORTED`}, `confidence`, `verifiedAt`, `verifiedBy`) — schema.prisma L316–L387.
   - `Inspection` (checklist JSON, score, photos, reportUrl, status), `Lead` (minimal — no status enum, no score field), `ListingImage`, `ModerationLog`, `Conversation`, `AI Gateway` route (`/api/ai-gateway/route.ts`).
3. Ran 23 targeted web searches (MachineryTrader / IronPlanet / Ritchie Bros / Mascus / Plant & Equipment / Boom & Bucket / EquipmentWatch / CDK / DealerBuilt / Salesforce Automotive / Impel AI / Microsoft Copilot for Sales / KBB / V7 Go / Cloudinary / SpecLens / etc.). All URLs cited below are real results returned by the search tool; snippets are quoted or paraphrased.
4. Did NOT claim any capability that HEAVIX already ships — every claim is checked against the schema or worklog.

---

## 1. Competitive Landscape — 5 Research Areas

### 1.1 Heavy Machinery / Used Equipment Marketplaces

| Competitor | What they do (sourced) | Source URL |
|---|---|---|
| **IronPlanet** (Ritchie Bros.) | "Buy & Sell Used Equipment ... View our detailed inspection reports and buy with confidence." Auction + Marketplace-E (Make Offer / Buy Now). | https://www.ironplanet.com |
| **Ritchie Bros. Marketplace-E** | "It's a 24/7 online platform that lets you buy and sell using Make Offer and Buy Now formats." | https://blog.ritchiebros.com/6-things-you-didnt-know-about-marketplace-e |
| **Ritchie Bros. IronClad Assurance** | "Equipment condition certification ... one of our inspectors has personally visited the item, taken pictures." | https://www.rbauction.com/buying/ironclad-assurance |
| **IronPlanet DEKRA-certified inspections** | "The DEKRA certification means that our IronClad Assurance inspections are in compliance with a comprehensive list of criteria and subcriteria from DEKRA." | https://www.ironplanet.com/DEKRA |
| **Mascus** | "The leading European online listing website to buy and sell used heavy machinery and industrial vehicles. Since 2001." Claims 400k–600k listings. | https://www.mascus.com ; https://highways.today/2026/09/25/mascus-at-25 |
| **Plant & Equipment** | "Online portal dedicated to connecting buyers and sellers of equipment such as wheel loaders, excavators, trucks ... Auctions, Listings and our managed export program." | https://www.plantandequipment.com |
| **MachineryTrader (Sandhills Group) — Fast Track Iron / IronGuides Serial Number Handbook** | "Quickly verify the model year of any asset, whether it's a construction or farm machine, truck, or trailer." | https://www.machinerytrader.com/blog/how-to-and-tips/2025/12/serial-number-guide-gives-fast-track-iron-users-fast-free-sn-vin-lookups |
| **Boom & Bucket** | "View detailed photos and videos, read over inspection and oil analysis reports, activate a warranty plan." Positioning: "the first trusted marketplace for heavy equipment." | https://www.boomandbucket.com/blog/introducing-boom-bucket-the-first-trusted-marketplace-for-heavy-equipment |
| **Cat Used / Cat Certified Used** | "The Cat Certified Used program enforces rigorous quality and performance standards for its used equipment." | https://www.quinncompany.com/used ; https://catused.cat.com |

**Market-size note (cited, not projected by HEAVIX):**
- Mordor Intelligence: "Used Construction Equipment Market worth USD 132.67 billion in 2026 is growing at a CAGR of 5.63% to reach USD 174.28 billion by 2031." https://www.mordorintelligence.com/industry-reports/used-construction-equipment-market
- Strategic Market Research (different methodology, smaller figure): "global used construction equipment market was valued at USD 22.5 billion in 2024." https://www.strategicmarketresearch.com/market-report/used-construction-equipment-market

The two figures differ by ~6× because of scope differences (whole-equipment resale vs. components + resale). HEAVIX should treat these as **indicative ranges only**, not as a TAM commitment.

### 1.2 Digital Dealership Management, Inventory & Showroom Tools

| Vendor | What they do (sourced) | Source URL |
|---|---|---|
| **CDK Global DMS** | "Dealer Management System (DMS) helps dealerships manage Sales, Service, Parts, Accounting and customer information from a centralized platform." | https://www.cdkglobal.com/insights/dealer-management-systems-guide |
| **CDK Vehicle Inventory Suite** | "Gives CDK DMS customers direct visibility into completed service history and reconditioning costs within the vehicle [record]." | https://www.cdkglobal.com/product-updates/vehicle-inventory-suite/connected-dms-intelligence |
| **DealerBuilt** | "Enterprise-class DMS platform that is precisely tailored to each dealer client's unique requirements ... DMS, CRM, desking, service lane tools, and marketing analytics." | https://dealerbuilt.com/home |
| **Gartner peer reviews** — DMS category | "DealerBuilt ceDMS is a software designed for automotive dealerships to manage core operations such as sales, finance, service, parts, and accounting." | https://www.gartner.com/reviews/market/dealer-management-systems |

Note: these are **automotive** DMS vendors. There is no dominant heavy-equipment-specific DMS at automotive-DMS scale; IronPlanet/Ritchie Bros' "rb Asset Solutions" + dealer inventory feeds play this role in heavy equipment. UNSOURCED for an exact heavy-equipment DMS market-share figure — do not claim one.

### 1.3 Machine Appraisal, History, Documentation & Trust Indicators

| Capability | What exists (sourced) | Source URL |
|---|---|---|
| **Equipment condition certification (IronClad Assurance)** | "Equipment condition certification ... our inspectors have personally visited the item." Policy caveat: "NOT intended to detect latent or hidden defects or conditions that could only be found by dismantling the [equipment]." | https://www.rbauction.com/buying/ironclad-assurance ; https://www.rbauction.com/legal-policies/ironclad-assurance-policy |
| **Third-party certification of inspection process (DEKRA)** | "IronClad Assurance inspections are in compliance with a comprehensive list of criteria and subcriteria from DEKRA." | https://www.ironplanet.com/DEKRA |
| **Equipment valuation data (EquipmentWatch)** | "Equipment costs, values/prices, year verification, rental rates ... The source trusted by finance for heavy equipment FMV, OLV, FLV, values, and prices." | https://equipmentwatch.com/values-market-data |
| **EquipmentWatch Market Activity** | "Data on transactions, utilization, popularity and value trends." | https://equipmentwatch.com/market-activity-data |
| **Equipmentworld free valuation calculator** | "Free access to market-based estimated values for used equipment. Backed by verified resale and auction transaction data." | https://www.equipmentworld.com/equipment-calculator |
| **Serial-number / model-year verification (Fast Track Iron / IronGuides)** | "Quickly verify the model year of any asset ... enter a serial number or vehicle identification number (VIN), and if the number is valid, view a historical [record]." | https://www.tractorhouse.com/blog/how-to-and-tips/2025/12/simplify-your-business-operations-with-the-sandhills-cloud |
| **"Carfax for heavy equipment" — DOES NOT EXIST** | "Carfax explicitly covers cars, light trucks, and motorcycles — not tractors or heavy construction equipment." Industry recommendation: "Look into EquipmentWatch, they aren't exactly CarFax, more TrueCar but really great valuation data." | https://machinetrail.com/blog/best-tractor-check-2026 ; https://www.quora.com/Is-there-something-like-CarFax-for-heavy-equipment-e-g-construction-agriculture-mining |

### 1.4 Seller CRM, Lead Scoring, Conversion-Optimization Tools

| Vendor / source | What they do (sourced) | Source URL |
|---|---|---|
| **Salesforce Automotive Cloud — Lead Conversion Score** | "Scoring Framework with Lead Conversion Score (Automotive Cloud) or Opportunity to Account [conversion prediction]." | https://help.salesforce.com/s/articleView?id=ind.auto_scoring_framework_lead_and_opportunity_conversion.htm |
| **Driftrock — Automotive lead scoring criteria** | "How automotive marketing teams decide which leads deserve a salesperson's time, which need nurturing, and which should be [dropped]." | https://www.driftrock.com/blog/lead-scoring-criteria-for-the-automotive-industry |
| **Strolid — Automotive Lead Management** | "Dealerships using lead scoring see 25-35% improvements in sales efficiency and 15-20% increases in conversion rates." (Vendor claim — treat as marketing, not independently audited.) | https://strolid.com/learn/hub/automotive-lead-management-complete-guide-to-converting-more-leads |
| **LeadLocate — Conversion funnel benchmark** | "Automotive lead conversion is measured as a four-stage funnel: contact rate, appointment rate, show rate, and close rate." | https://leadlocate.com/sales-leads/automotive-lead-conversion-benchmarks |

### 1.5 Practical AI Applications in Industrial Marketplaces

| Capability | Real-world example (sourced) | Source URL |
|---|---|---|
| **AI appraisals for used construction equipment** | Stilltide: "AI-powered appraisals for excavators, loaders, dozers, and heavy construction machinery." | https://www.stilltide.us/equipment/construction |
| **ML resale-price prediction (peer-reviewed)** | "Predicting construction equipment resale price: machine learning [model]" — Emerald ECAM journal. | https://www.emerald.com/ecam/article/32/5/3453/1274746/Predicting-construction-equipment-resale-price ; https://www.researchgate.net/publication/378261904 |
| **AI residual-value prediction for equipment lenders** | "AI paves way for equipment lenders to predict residual values." | https://equipmentfinancenews.com/news/lender-operations/ai-paves-way-for-equipment-lenders-to-predict-residual-values |
| **Caution on AI in appraisal (counter-source)** | "AI should be viewed as a potential tool for qualified appraisers; however, it is important to be cautious with the level of reliance [on AI]." | https://www.equipmentappraisal.com/blog/the-pros-and-cons-of-using-ai-in-equipment-valuation |
| **Agentic AI buyer agents in automotive retail** | Impel AI: "AI systems that don't just respond to questions — they take autonomous actions on behalf of buyers or dealerships." | https://impel.ai/blog/agentic-ai-automotive-retail-buyer-agent |
| **Conversational AI for dealerships** | Strolid: "Conversational AI for car dealerships uses NLP and machine learning to engage website visitors, answer questions." | https://strolid.com/learn/conversational-ai-for-dealerships-chatbots-that-convert |
| **AI Sales Co-Pilot across CRM+DMS** | AutomotiveAI: "Sales Co-Pilot is the chat assistant your reps actually open. Ask anything across CRM, DMS, inventory, scheduler, and calendar." | https://automotiveai.com/agents/copilot |
| **Microsoft Copilot for Sales** | "AI assistant for sales teams to maximize productivity and close more deals." | https://learn.microsoft.com/en-us/microsoft-sales-copilot/introduction |
| **AI semantic search for ecommerce** | Salesforce Commerce Cloud: "Semantic search combines NLP, machine learning, and vector embeddings." | https://www.salesforce.com/commerce/ecommerce-site-search/semantic |
| **Vertex AI Vector Search for ecommerce catalogs** | "Walk through building a semantic search system for an e-commerce catalog using Vertex AI Vector Search." | https://oneuptime.com/blog/post/2026-02-17-how-to-implement-semantic-search-for-e-commerce-with-vertex-ai-vector-search/view |
| **LLM-based semantic search (peer-reviewed)** | arXiv: "LLM-based semantic search framework that effectively captures user intent from conversational queries by combining domain-specific [context]." | https://arxiv.org/html/2601.16492v1 |
| **AI product-spec comparison (SpecLens)** | "Compare product specifications instantly with AI. Extract specs from PDFs, Excel, and vendor documents. Create comparison matrices in seconds." | https://www.speclens.ai |
| **AI multilingual listing generation (Perci.ai)** | "Every AI tool can translate a listing. Perci supports 23 Amazon marketplaces and 15 languages." | https://perci.ai/listing-translation |
| **AI multilingual e-commerce listings (Linguin)** | "AI translation optimizes multilingual e-commerce product listings for global sales." | https://linguin.app/blog/ai-translation-multilingual-e-commerce-product-listings |
| **AI missing-document detection (V7 Go)** | "Specialized AI agent scans your entire document repository, compares it against your requirements checklist, and instantly flags what's missing." | https://www.v7labs.com/agents/missing-document-detection |
| **Document AI for compliance (ABBYY)** | "Document AI helps financial institutions cut manual errors, detect fraud early, and stay compliant with evolving AML and KYC regulations." | https://www.abbyy.com/blog/document-ai-aml-kyc-compliance |
| **Duplicate image detection (Velebit AI)** | "Effortlessly Detect Duplicate Images with AI. Enhance your e-commerce or marketplace platform accuracy." | https://www.velebit.ai/duplicate-detection |
| **Cloudinary duplicate-image add-on** | Cloudinary "Duplicate Image Detection Add-on" with "Admin API can be used to list all moderated images." | https://cloudinary.com/documentation/cloudinary_duplicate_image_detection_addon |
| **AWS media deduplication** | "Uses video and audio similarity technology to compare individual frames [for duplicate content detection]." | https://aws.amazon.com/blogs/media/using-computer-vision-to-automate-media-content-deduplication-workflows |
| **Visual-AI content moderation (Visua)** | "Computer Vision can solve the challenges of moderating visual content across all key sectors and platforms." | https://visua.com/use-case/content-moderation-with-computer-vision |
| **Kelley Blue Book (automotive analog) — data-driven valuation** | "Kelley Blue Book uses predictive analytics based on Cox Automotive data, and industry and field analysis to review trends." | https://b2b.kbb.com/dealership-resources/why-kbb |

---

## 2. HEAVIX Schema Cross-Check (what we have today vs. what we don't)

Verified directly against `/home/z/heavix/prisma/schema.prisma` (line numbers below refer to that file).

| Concept | HEAVIX today | Gap |
|---|---|---|
| `Company.logoUrl`, `coverImage`, `verified`, `metaTitle`, `metaDescription` | **EXISTS** (L1182–L1194) | None — B1 critic finding confirmed. |
| `Company.verified` boolean + `CompanyVerification[]`, `CompanyDocument[]`, `CompanyBranch[]` | **EXISTS** (L1190, L1202–L1204) | None for verification lifecycle. |
| `MachinePassport` | **EXISTS** (L1149–L1159) with `serialNumber`, `inspectionDate`, `inspectionResult`, `PassportEvent[]` | **B2 confirmed:** no per-section verification fields, no per-section verifier, no `verifiedAt` per section. ADR-005 decision #6 required. |
| `PremiumSubscription` | **EXISTS** (L1126–L1143) — `userId @unique`, per-user; flags `analyticsAccess`, `aiAssistantAccess`, `priorityLeads`, `companyPage`, `featuredCredits` | **H1/H2/H3 confirmed:** NOT store/company-linked. A store-scoped premium tier requires schema migration. |
| `Lead` | **EXISTS** (L618–L627) — `leadType`, `viewerPhone`, `viewerName`, `note`, `createdAt` | **Lead.status gap** (per worklog STEP 11.27 / ADR-005 decision #3) — no status enum, no score, no source attribution, no assignment. |
| `Inspection` | **EXISTS** (L1351–L1371) — `status`, `scheduledDate`, `completedAt`, `checklist` (JSON), `score` (0–100), `reportUrl`, `photos` (JSON), `inspectorId` | Strong base for inspection-backed disclosure; no third-party certification authority. |
| `PriceObservation` / `PriceEstimate` / `PriceOverride` | **EXISTS** (L2061–L2123) — `askingPrice`, `estimatedPrice`, `priceLower`, `priceUpper`, `confidence`, `comparableCount`, `modelVersion` | Engine exists. Bottleneck = volume of `PriceObservation` rows (market data sparsity, esp. IRAN market). |
| `ComparisonSession` / `ComparisonItem` | **EXISTS** (L2133+) — `shareToken`, `aiSummary`, `aiSummaryAt` | Comparison V1.0 already specified (`docs/HEAVIX-MACHINE-COMPARISON-SPEC-V1.0.md`). |
| `AttributeDefinition` (`aiRelevant`, `labelFa`/`labelEn`/`nameEn`) + `ListingAttributeValue` provenance (`sourceType`, `confidence`, `verifiedAt`, `verifiedBy`) | **EXISTS** (L316–L387) | Excellent substrate for AI-extracted specs + multilingual drafts; the data dictionary already supports `AI_EXTRACTION` and `AI_INFERENCE` provenance. |
| `ListingImage` | **EXISTS** (L535–L543) — `url`, `alt`, `isPrimary`, `sortOrder` | No `phash`, no `embedding`, no `moderationStatus`. |
| `ModerationLog` | **EXISTS** (referenced L528) | Visual moderation pipeline not yet wired (per worklog). |
| `Conversation` (P1-MESSAGING) | **EXISTS** (referenced L526) | Conversational AI assistant can plug in via existing messaging + AI Gateway. |
| `HotSearch` | **EXISTS** (L669–L677) — term, link, count | This is a popularity tracker, NOT a semantic/vector index. No embedding store exists. |
| AI Gateway route | **EXISTS** (`src/app/api/ai-gateway/route.ts`) | Single route; needs provider routing, prompt templates, and policy enforcement (per HEAVIX-DATA-GOVERNANCE-V1). |
| `SalesTeamMember` | **DOES NOT EXIST** | ADR-005 decision #4 — proposed, not yet implemented. Blocks seller-side copilot features that are team-scoped. |
| `Showroom` (VIP) | **DOES NOT EXIST** | ADR-005 decision #2 — proposed, not yet implemented. |
| Smart Inventory Score | **DOES NOT EXIST** | ADR-005 decision #5 — deterministic, versioned, cached scoring — proposed, not yet implemented. |

**Hard guardrails (from worklog STEP 11.28 stage summary):**
- Investment / financing / leasing capabilities remain **GATED** (legal review required). This research does NOT propose de-gating them.
- ADR-005 decision #8: Business / AI Assistant is **advisory only — no mutations**. Any AI capability proposed below inherits this constraint.

---

## 3. Capability Deep Dives

Each capability is documented with the full required template and classified into one of:
- **MVP-ready** — HEAVIX has the data + legal clearance today.
- **Needs more data** — requires data HEAVIX doesn't yet collect.
- **Needs partner or legal clearance** — financing/leasing/appraisal certification, OEM trademark, third-party licensed data, etc.

### CAP-01 · Inspection-Backed Equipment Condition Disclosure
- **Credible source:** Ritchie Bros. IronClad Assurance — https://www.rbauction.com/buying/ironclad-assurance ; IronPlanet DEKRA-certified inspections — https://www.ironplanet.com/DEKRA ; IronClad Assurance policy (inspection ≠ warranty of latent defects) — https://www.rbauction.com/legal-policies/ironclad-assurance-policy
- **Real-world example:** IronPlanet IronClad Assurance (DEKRA-certified third-party audit of the inspection process).
- **Value for HEAVIX:** Buyer-facing inspection disclosure (checklist, photos, score, inspector identity, reportUrl) raises trust on a marketplace that today shows only seller-provided fields; differentiates HEAVIX from raw classifieds.
- **Complexity:** Medium — `Inspection` model already exists with `checklist`, `score`, `photos`, `reportUrl`, `inspectorId`; remaining work is disclosure UI + policy copy ("inspection is a disclosure, not a warranty of latent defects").
- **Data dependency:** Completed `Inspection` rows with non-null `checklist`, `score`, `reportUrl`, and identified `inspectorId`. Must have at least 1 photo set.
- **Risk:** **Legal** — wording must NOT imply warranty or guarantee of latent-defect absence (Ritchie Bros' own policy explicitly disclaims this). Use "disclosure" language, not "certification" language, unless a licensed third-party certifier is engaged.
- **Success measurement method:** Conversion lift on listings with inspection vs. without (view→lead rate, lead→offer rate); buyer-trust survey score.
- **Classification:** **MVP-ready** (for disclosure) — the `Inspection` model is sufficient. Calling it "certified" requires a licensed third-party certifier (see CAP-12).

### CAP-02 · Serial-Number / Model-Year Verification
- **Credible source:** MachineryTrader Fast Track Iron — https://www.machinerytrader.com/blog/how-to-and-tips/2025/12/serial-number-guide-gives-fast-track-iron-users-fast-free-sn-vin-lookups ; Sandhills IronGuides Serial Number Handbook — https://www.tractorhouse.com/blog/how-to-and-tips/2025/12/simplify-your-business-operations-with-the-sandhills-cloud ; IronMart Online industry description — https://www.ironmartonline.com/10-steps-determine-excavator-value-by-serial-number
- **Real-world example:** Sandhills Fast Track Iron / IronGuides Serial Number Handbook (subscription serial-number-to-model-year lookup, considered "industry standard" per IronMart).
- **Value for HEAVIX:** Cuts seller mis-yearing fraud; gives buyers a free, fast verification step; standardizes model-year normalization for the price engine.
- **Complexity:** High — requires licensing a serial-number-to-year reference DB (IronGuides or equivalent); HEAVIX cannot crowd-source this credibly.
- **Data dependency:** `MachinePassport.serialNumber` (already exists) + a licensed reference dataset; per-category decode rules.
- **Risk:** **Legal** (licensing terms; redistribution restrictions); **Operational** (decode errors — false verification is worse than no verification).
- **Success measurement method:** % of listings with verified-year badge; disputes raised on year mismatch; seller NPS for the verification step.
- **Classification:** **Needs partner or legal clearance** — requires licensed serial-number reference data.

### CAP-03 · Data-Driven Price Suggestion with Range + Confidence
- **Credible source:** EquipmentWatch Values & Market Data — https://equipmentwatch.com/values-market-data ; peer-reviewed ML model — https://www.emerald.com/ecam/article/32/5/3453/1274746/Predicting-construction-equipment-resale-price ; Stilltide AI appraisals — https://www.stilltide.us/equipment/construction ; appraisal-industry caution on AI reliance — https://www.equipmentappraisal.com/blog/the-pros-and-cons-of-using-ai-in-equipment-valuation
- **Real-world example:** EquipmentWatch (data licensed by finance for FMV/OLV/FLV); Stilltide AI appraisals; Makana "Used Equipment Value Calculator" — https://www.makana.com/en/used-equipment-value-calculator
- **Value for HEAVIX:** Sellers get an evidence-backed asking-price range; buyers get a "fair price" indicator; reduces haggling friction; monetizable as a premium seller analytics feature (already covered by `PremiumSubscription.analyticsAccess` flag).
- **Complexity:** Medium — engine and schema already exist (`PriceEstimate` with `priceLower`/`priceUpper`/`confidence`/`comparableCount`/`modelVersion`). Spec V1.0 already shipped (`docs/HEAVIX-PRICE-ESTIMATION-SPEC-V1.0.md`).
- **Data dependency:** **Volume of `PriceObservation` rows per (brand, category, year, market) bucket.** Confidence = `INSUFFICIENT` when `comparableCount` is below the spec's threshold — this is the production blocker for the IRAN market today.
- **Risk:** **Legal** — must label as *estimate* not *appraisal* (appraisal requires certified appraiser — see https://www.equipmentappraisal.com/blog/the-pros-and-cons-of-using-ai-in-equipment-valuation); **Reputational** — confidently-wrong estimates erode trust faster than no estimate.
- **Success measurement method:** Share of listings with `confidence` ∈ {HIGH, MEDIUM} (target ≥ 60% before public display); MAPE on backtest; seller-reported usefulness score; estimate-to-asking-price delta distribution.
- **Classification:** **Needs more data** — engine exists; observation volume does not.

### CAP-04 · Multi-Machine Comparison with Auto-Extracted Technical Specs
- **Credible source:** SpecLens AI — https://www.speclens.ai ("Extract specs from PDFs, Excel, and vendor documents. Create comparison matrices in seconds."); HEAVIX internal spec `docs/HEAVIX-MACHINE-COMPARISON-SPEC-V1.0.md`; schema `ComparisonSession` / `ComparisonItem` (`prisma/schema.prisma` L2133+).
- **Real-world example:** SpecLens (vendor document → comparison matrix); HEAVIX V1.0 spec already designs the session layer.
- **Value for HEAVIX:** Buyers compare ≥2 machines side-by-side with normalized attributes; AI auto-extracts specs from seller-uploaded PDFs into `ListingAttributeValue` rows with `sourceType = AI_EXTRACTION` and a confidence score — provenance already supported by the schema.
- **Complexity:** Medium — session/persistence layer exists; remaining work = AI extraction pipeline (PDF → attribute values) + diff UI + provenance labeling.
- **Data dependency:** `AttributeDefinition` catalog per `Category` (already exists); seller-uploaded PDFs/photos; AI extraction policy (already a concern in `HEAVIX-DATA-GOVERNANCE-V1.md`).
- **Risk:** **Technical** — extraction confidence must be surfaced to the buyer (schema supports `confidence` per value); **Operational** — mismatched attribute keys across categories break comparison.
- **Success measurement method:** Comparison-session conversion rate; AI-extracted attribute accuracy on a held-out labeled set (precision/recall per attribute key); sessions shared via `shareToken`.
- **Classification:** **MVP-ready** for attributes already in the catalog (manual + AI_EXTRACTED); **Needs more data** for fully-automated spec extraction from arbitrary PDFs (requires extraction-pipeline accuracy ≥ threshold).

### CAP-05 · Semantic / Natural-Language Machine Search
- **Credible source:** Salesforce Commerce Cloud — https://www.salesforce.com/commerce/ecommerce-site-search/semantic ; Vertex AI Vector Search guide — https://oneuptime.com/blog/post/2026-02-17-how-to-implement-semantic-search-for-e-commerce-with-vertex-ai-vector-search/view ; peer-reviewed LLM semantic-search framework — https://arxiv.org/html/2601.16492v1 ; Bloomreach explainer — https://www.bloomreach.com/en/blog/semantic-search-explained-in-5-minutes
- **Real-world example:** Salesforce Commerce Cloud semantic search; Bloomreach Discovery; Vertex AI Vector Search.
- **Value for HEAVIX:** Buyers type "کمبیین ۲۰ تنی کارکرده زیر ۸۰۰۰ ساعت" ("20-ton excavator, under 8,000 hours") and get matched listings even when the seller's title doesn't contain those exact tokens — critical for a Persian-primary marketplace where keyword search is brittle.
- **Complexity:** High — requires Persian-capable embedding model, vector store (pgvector on existing Postgres is feasible), hybrid (BM25 + vector) retrieval, re-ranker, and query-rewriting for Persian/RTL.
- **Data dependency:** Normalized listing text (title + description + `ListingAttributeValue`); a Persian embedding model; a query-logging pipeline for offline eval.
- **Risk:** **Technical** (Persian embedding quality; cost); **Reputational** (hallucinated matches returning irrelevant machines); **Operational** (embedding re-index cost as catalog grows).
- **Success measurement method:** Search → listing-view rate; query reformulation rate (lower = better); offline nDCG@10 on a held-out query set; coverage of zero-result queries.
- **Classification:** **Needs more data** — no embedding index exists today.

### CAP-06 · Multi-Language Listing Draft Generation from Verified Data
- **Credible source:** Perci.ai — https://perci.ai/listing-translation ; Linguin — https://linguin.app/blog/ai-translation-multilingual-e-commerce-product-listings ; Listapro — https://listapro.ai/multiple-languages ; Lionbridge / LILT (enterprise options) — https://qualixsolutions.com/insights/enterprise-ai-multilingual-content-generation-marketing-platforms
- **Real-world example:** Perci.ai (Amazon listings across 23 marketplaces / 15 languages); Linguin (AI translation for e-commerce listings).
- **Value for HEAVIX:** HEAVIX is Persian-primary but a real export marketplace needs English + Arabic drafts for cross-border buyers. Generating from verified `ListingAttributeValue` rows (not from free-text) keeps drafts grounded in truth and traceable to provenance.
- **Complexity:** Medium — single LLM call per draft, with a prompt that takes verified attribute values + bilingual `AttributeDefinition.labelFa`/`labelEn` (already in schema L321–L322). Output stored as a draft with `sourceType = AI_INFERENCE` for any derived sentence.
- **Data dependency:** Verified `ListingAttributeValue` rows per listing; bilingual attribute labels; brand/category bilingual dictionary.
- **Risk:** **Technical** — mistranslation of technical terms (e.g., "undercarriage" vs. "زیرسازی"); must label output as *draft* not certified; **Legal** — export-control / sanctions screening (cannot auto-translate for embargoed destinations).
- **Success measurement method:** Draft acceptance rate by sellers; edit-distance between AI draft and final published description; multilingual listing view share; cross-border lead share.
- **Classification:** **MVP-ready** — HEAVIX has the provenance-aware attribute substrate + bilingual labels. Caveat: must store drafts with explicit `AI_INFERENCE` provenance and a "draft, not certified" badge.

### CAP-07 · Missing-Document Detection
- **Credible source:** V7 Go "AI Missing Document Detection Agent" — https://www.v7labs.com/agents/missing-document-detection ; ABBYY Document AI for KYC/AML — https://www.abbyy.com/blog/document-ai-aml-kyc-compliance ; Uptiq KYC compliance checklist — https://www.uptiq.ai/blogs/kyc-compliance-requirements-checklist
- **Real-world example:** V7 Go missing-document agent (compares document repository against a requirements checklist).
- **Value for HEAVIX:** Sellers see exactly which documents are required (and missing) before a listing goes live — by category (e.g., forklifts require load-test certificate; cranes require annual inspection certificate) and by jurisdiction. Reduces moderation rejections.
- **Complexity:** Medium — rules engine over a required-document manifest per `Category` × jurisdiction; can be deterministic (no AI needed) initially, with AI classification of uploaded docs as a Phase 2.
- **Data dependency:** A required-document manifest (per category + jurisdiction) — **HEAVIX does not yet have this**; `CompanyDocument` exists but `ListingDocument` does not; documents are currently attached to `Company` not `Listing`.
- **Risk:** **Operational** — false positives blocking legitimate submissions; **Legal** — manifest must reflect actual regulatory requirements per jurisdiction (e.g., Iran vs. export).
- **Success measurement method:** Submission-rejection rate (target ↓); time-to-publish for new listings (target ↓); seller NPS for the missing-doc UX.
- **Classification:** **Needs more data** — required-document manifest does not exist; `ListingDocument` model does not exist.

### CAP-08 · Duplicate / Irrelevant Image Detection
- **Credible source:** Velebit AI duplicate detection — https://www.velebit.ai/duplicate-detection ; Cloudinary Duplicate Image Detection Add-on — https://cloudinary.com/documentation/cloudinary_duplicate_image_detection_addon ; AWS media deduplication — https://aws.amazon.com/blogs/media/using-computer-vision-to-automate-media-content-deduplication-workflows ; Vecstore primer on perceptual hashing vs. embedding similarity — https://vecstore.app/blog/duplicate-image-detection
- **Real-world example:** Velebit AI (marketplace dedup); Cloudinary add-on (image-similarity moderation queue); AWS frame-level dedup.
- **Value for HEAVIX:** Sellers often re-upload the same photo of a previous machine, or photos of a *different* machine. Dedup cuts moderator load; irrelevance detection catches "stock photo of a Cat 320 when the listing is for a Komatsu PC200."
- **Complexity:** Low for perceptual-hash dedup (pHash on upload, O(1) lookup per listing); Medium for irrelevance classification (needs CLIP-style embedding + labeled in-domain training data).
- **Data dependency:** For dedup: `ListingImage.phash` column (does NOT exist today). For irrelevance: a labeled set of "wrong machine" image pairs (does NOT exist).
- **Risk:** **Operational** — false positives on legitimately similar units (e.g., same model, different serial — visually near-identical); **UX** — must let seller override with a reason.
- **Success measurement method:** Moderator-action rate per 100 uploads (target ↓); duplicate-flag precision/recall on a labeled holdout; false-positive override rate.
- **Classification:** **MVP-ready** for perceptual-hash dedup (Low complexity, no third-party dependency). **Needs more data** for irrelevance classification (labeled training set).

### CAP-09 · Lead Scoring & Seller CRM
- **Credible source:** Salesforce Automotive Cloud Lead Conversion Score — https://help.salesforce.com/s/articleView?id=ind.auto_scoring_framework_lead_and_opportunity_conversion.htm ; Driftrock lead-scoring criteria — https://www.driftrock.com/blog/lead-scoring-criteria-for-the-automotive-industry ; LeadLocate 4-stage funnel benchmark — https://leadlocate.com/sales-leads/automotive-lead-conversion-benchmarks ; Numa lead-scoring model — https://numa.com/blog/lead-scoring-model-dealership
- **Real-world example:** Salesforce Einstein Lead Scoring in Automotive Cloud; Numa dealership lead-scoring model.
- **Value for HEAVIX:** Sellers prioritize the leads most likely to convert; HEAVIX can charge for `priorityLeads` (already a flag on `PremiumSubscription`).
- **Complexity:** Medium — schema additions (Lead `status` enum, `score`, `source`, `assignedTo`); scoring model (rules-based first, ML later); CRM UI in Store Center.
- **Data dependency:** **Lead.status enum (gap noted in ADR-005 #3 and STEP 11.27 worklog)**; behavioral signals (favorites, views, message-thread length, offer history); seller response time.
- **Risk:** **Privacy/GDPR-equivalent** (PII handling of `viewerPhone`); **Bias** (scoring may systematically downgrade legitimate buyers); **Legal** — must not become regulated credit advice.
- **Success measurement method:** Lead→offer conversion rate (per lead-score decile, target monotonic); seller response time (target ↓); churn rate of premium sellers.
- **Classification:** **Needs more data** — `Lead.status` schema gap (ADR-005 #3) must be closed first; behavioral signals not yet captured.

### CAP-10 · Buyer Assistant (Conversational, Advisory Only)
- **Credible source:** Impel AI agentic automotive retail — https://impel.ai/blog/agentic-ai-automotive-retail-buyer-agent ; Strolid conversational AI — https://strolid.com/learn/conversational-ai-for-dealerships-chatbots-that-convert ; InsiderOne AI shopping assistants — https://insiderone.com/ai-shopping-assistants
- **Real-world example:** Impel AI (automotive retail conversational AI); Strolid (dealership chatbots).
- **Value for HEAVIX:** Buyers ask "what's the best 5-ton forklift under X toman?" and get grounded answers from real listings (RAG). Reduces zero-result-search churn.
- **Complexity:** High — RAG over listings, Persian LLM, safety classifier, must respect ADR-005 #8 (**advisory only — no mutations**: the assistant cannot place an offer, send a message, or commit the buyer).
- **Data dependency:** Structured listing data + `AttributeDefinition` catalog; safety policy; conversation log (`Conversation` model exists).
- **Risk:** **Reputational** — hallucinated machine specs; **Legal** — must NOT make commercial commitments or recommend financing (financing is GATED); **Operational** — Persian LLM cost/latency.
- **Success measurement method:** Conversation → listing-view rate; downstream lead submission rate; hallucination rate on a red-team eval set; cost per conversation.
- **Classification:** **MVP-ready** for advisory Q&A (RAG over catalog, no mutations). Transactional/agentic actions (placing offers, booking inspections) are out of scope under ADR-005 #8 and remain **Needs more data + policy**.

### CAP-11 · Seller Assistant (Commercial Copilot, Advisory Only)
- **Credible source:** Microsoft Copilot for Sales — https://learn.microsoft.com/en-us/microsoft-sales-copilot/introduction ; AutomotiveAI Sales Co-Pilot — https://automotiveai.com/agents/copilot ; AutoRaptor AI Sales Assistant — https://www.autoraptor.com/ai-sales-assistant-for-dealerships ; Salestarget.ai copilot use cases — https://salestarget.ai/blogs/ai-sales-copilot-how-it-works-and-use-cases
- **Real-world example:** Microsoft Copilot for Sales; AutomotiveAI Sales Co-Pilot (CRM+DMS+inventory+scheduler in one chat).
- **Value for HEAVIX:** Sellers ask "which of my listings have stale leads?" or "draft a reply to this buyer in English" — the assistant pulls context from the Store Center and drafts responses (still subject to human send-off).
- **Complexity:** High — cross-resource context (Lead + Listing + Company + Inventory + Conversation); must respect ADR-005 #8 (no mutations) — drafts only; needs `SalesTeamMember` (ADR-005 #4, not yet implemented) for team-scoped access.
- **Data dependency:** `SalesTeamMember` model (NOT yet implemented); `Lead.status` enum (gap, ADR-005 #3); `Conversation` history; listing freshness signals.
- **Risk:** **Legal** — must not produce regulated advice (pricing guarantees, financing recommendations); **Reputational** — drafts sent without review could misrepresent a machine; **Privacy** — PII access controls.
- **Success measurement method:** Draft adoption rate by sellers; seller response time (target ↓); lead→offer conversion lift for sellers using the assistant; policy-violation rate (target 0).
- **Classification:** **Needs more data** — `SalesTeamMember` not implemented; `Lead.status` gap; behavioral data not yet collected.

### CAP-12 · OEM Certified Used Programs
- **Credible source:** Cat Certified Used — https://www.quinncompany.com/used ("enforces rigorous quality and performance standards for its used equipment") ; Cat Used marketplace — https://catused.cat.com
- **Real-world example:** Cat Certified Used (OEM-backed certification + extended warranty).
- **Value for HEAVIX:** OEM partnerships give HEAVIX certified-used inventory and OEM warranty pass-through — a strong trust signal.
- **Complexity:** High — bilateral OEM partnership agreements; technical integration with OEM dealer feeds; warranty pass-through legal framework.
- **Data dependency:** OEM-partner linkage on `Company` (does not exist); per-listing certification chain with OEM-issued certificate ID.
- **Risk:** **Legal** — trademark/IP usage; warranty liability; misrepresentation; **Commercial** — exclusivity clauses may conflict with multi-OEM marketplace positioning.
- **Success measurement method:** Number of OEM partnerships signed; certified-used listing share; conversion premium of certified vs. non-certified listings.
- **Classification:** **Needs partner or legal clearance** — requires OEM partnership contracts + IP review.

### CAP-13 · Multi-Channel Remarketing (Auction + Make Offer + Buy Now)
- **Credible source:** Ritchie Bros. Marketplace-E — https://www.ironplanet.com/marketplace-e ; "6 things you didn't know about Marketplace-E" — https://blog.ritchiebros.com/6-things-you-didnt-know-about-marketplace-e ; RockToRoad introduction — https://www.rocktoroad.com/ritchie-bros-introduces-marketplace-e-a-new-way-to-buy-and-sell-equipment-5808
- **Real-world example:** Ritchie Bros. Marketplace-E (Make Offer / Buy Now formats alongside auctions).
- **Value for HEAVIX:** Sellers choose the right channel per machine (auction for time-pressured disposals; Buy Now for stock units; Make Offer for negotiation). HEAVIX already has `Listing.listingType`, `Auction`, `ListingOffer` models.
- **Complexity:** Medium — models exist; remaining work = unified seller flow + status machine + settlement wiring (settlement is payment-legal gated).
- **Data dependency:** Listing statuses across listing types; auction settlement logic; payment integration.
- **Risk:** **Legal** — auction settlement + payment handling (regulated in many jurisdictions); **Operational** — status-machine bugs cause double-sale.
- **Success measurement method:** Channel mix (auction / buy-now / make-offer); time-to-sell per channel; seller repeat-use rate.
- **Classification:** **MVP-ready** for listing + Make Offer + Buy Now flows (no auction settlement required). Auction **settlement** is **Needs partner or legal clearance** (payment-handling legal).

### CAP-14 · Digital Dealership Management & Showroom (Store Center)
- **Credible source:** CDK Global DMS guide — https://www.cdkglobal.com/insights/dealer-management-systems-guide ; CDK Vehicle Inventory Suite (service history + reconditioning visibility) — https://www.cdkglobal.com/product-updates/vehicle-inventory-suite/connected-dms-intelligence ; DealerBuilt DMS — https://dealerbuilt.com/home ; Gartner DMS category — https://www.gartner.com/reviews/market/dealer-management-systems
- **Real-world example:** CDK Global DMS (sales + service + parts + accounting); CDK Vehicle Inventory Suite (recon cost visibility); DealerBuilt.
- **Value for HEAVIX:** Store Center (per ADR-005 + `docs/product/PRODUCT-ADMIN-STORE-CENTER-SPEC.md`) turns HEAVIX from a classifieds board into a dealer operating system — increasing stickiness and per-seller revenue.
- **Complexity:** High — most of ADR-005 (Store Identity, VIP Showroom, Sales Team, Smart Inventory Score, Machine Passport integration, Business Assistant onboarding, Lead Intelligence, VIP enforcement) is **specified but not yet implemented** (per STEP 11.28 stage summary: "NO implementation code started").
- **Data dependency:** `SalesTeamMember`, `Showroom`, Smart Inventory Score model, per-section `MachinePassport` verification fields — none exist. `Lead.status` gap.
- **Risk:** **Operational** — scope creep; **Technical** — coupling marketplace + store-DB transactions (documented TOCTOU limitation per STEP 11.26 H-critic); **Strategic** — competing with CDK/DealerBuilt is a different business than running a marketplace.
- **Success measurement method:** Active stores per month; listings per store; store-side GMV; seller NPS; time-to-onboard a new store.
- **Classification:** **Needs more data** — most components of ADR-005 are unimplemented; existing store-domain resources (Inventory, Orders, Payments, Returns, Customers, Suppliers, Procurement, Shipments) are reusable but the dealer-grade layer is not yet built.

### CAP-15 · Cross-Market Equipment History ("Carfax for Machines")
- **Credible source:** Machinetrail (confirms Carfax does NOT cover heavy equipment) — https://machinetrail.com/blog/best-tractor-check-2026 ; Quora (industry recommends EquipmentWatch for valuation, not history) — https://www.quora.com/Is-there-something-like-CarFax-for-heavy-equipment-e-g-construction-agriculture-mining ; Fast Track Iron for year verification only — https://www.tractorhouse.com/blog/how-to-and-tips/2025/12/simplify-your-business-operations-with-the-sandhills-cloud
- **Real-world example:** **No unified "Carfax for heavy equipment" exists.** The market is fragmented: Fast Track Iron / IronGuides for model-year verification; EquipmentWatch for valuation; OEM telematics (Cat Product Link, Komtrax, Volvo CE CareTrack) for in-fleet history only — no cross-owner registry exists at scale.
- **Value for HEAVIX:** A buyer-facing history report (ownership changes, major events, inspection results, hours trajectory) would be a category-defining differentiator — *if* HEAVIX can source the events.
- **Complexity:** High — no industry-wide registry exists; would require OEM telematics partnerships + dealer-reported events + HEAVIX's own `PassportEvent` log.
- **Data dependency:** `PassportEvent[]` (exists) — but only HEAVIX-recorded events; cross-market events require partner feeds; serial-number identity (CAP-02) required to stitch events.
- **Risk:** **Legal** (data-sharing agreements with OEMs/dealers; competition law if HEAVIX becomes a registry); **Reputational** (incomplete history is misleading — a partial report can be worse than none); **Operational** (data freshness).
- **Success measurement method:** Coverage = % of HEAVIX listings with a history report containing ≥ N events; buyer-trust lift; willingness-to-pay for history report.
- **Classification:** **Needs partner or legal clearance** — OEM telematics + dealer-network data-sharing agreements required. HEAVIX's own `PassportEvent` log can support a HEAVIX-internal history view as an MVP-ready sub-capability, but it is not a "Carfax for machines" until partner data is wired.

### CAP-16 · AI-Powered Visual Content Moderation
- **Credible source:** Visua Visual-AI content moderation — https://visua.com/use-case/content-moderation-with-computer-vision ; Cloudinary moderation API — https://cloudinary.com/documentation/cloudinary_duplicate_image_detection_addon ; AWS media dedup — https://aws.amazon.com/blogs/media/using-computer-vision-to-automate-media-content-deduplication-workflows
- **Real-world example:** Visua Visual-AI (visual moderation across platforms); Cloudinary moderation queue.
- **Value for HEAVIX:** Auto-flag listings with off-topic imagery, watermarked stock photos, or unsafe content before they reach buyers. HEAVIX already has `ModerationLog` model.
- **Complexity:** Medium — pre-trained classifiers (NSFW, watermark, OCR for phone-number extraction) + custom classifier for "wrong machine category."
- **Data dependency:** `ListingImage` moderation status field (does not exist); labeled examples of policy-violating images for the custom classifier.
- **Risk:** **Reputational** — false negatives let bad listings through; **UX** — false positives delay legitimate sellers.
- **Success measurement method:** Moderator-action rate per 100 listings (target ↓); time-to-moderate (target ↓); policy-violation escape rate to public (target 0).
- **Classification:** **MVP-ready** — `ModerationLog` exists; pre-trained classifiers available; deterministic first cut.

### CAP-17 · Predictive Residual Value (Financing/Leasing Support)
- **Credible source:** Equipment Finance News — https://equipmentfinancenews.com/news/lender-operations/ai-paves-way-for-equipment-lenders-to-predict-residual-values
- **Real-world example:** Equipment-finance lenders using AI residual-value models for lease underwriting.
- **Value for HEAVIX:** A residual-value projection would enable lease-pricing partnerships — **BUT** this is a financing/leasing capability.
- **Complexity:** High — forward-curve modeling; macro-economic features; time-series of observations.
- **Data dependency:** Multi-year `PriceObservation` time series; macro factors; depreciation curves per category.
- **Risk:** **Legal** — financing/leasing is **GATED** per worklog STEP 11.28 stage summary ("Investment/financing GATED — legal review required"). HEAVIX is positioned as a facilitator, not a lender (per `docs/product/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md`).
- **Success measurement method:** N/A while GATED.
- **Classification:** **Needs partner or legal clearance** — explicitly GATED. This research does NOT propose de-gating.

### CAP-18 · Smart Inventory Score (Inventory Health)
- **Credible source:** CDK Vehicle Inventory Suite (reconditioning + service-history visibility into dealer inventory) — https://www.cdkglobal.com/product-updates/vehicle-inventory-suite/connected-dms-intelligence ; DealerBuilt analytics — https://dealerbuilt.com/home ; ADR-005 decision #5 (Smart Inventory Score: deterministic, versioned, cached).
- **Real-world example:** CDK Vehicle Inventory Suite; DealerBuilt analytics.
- **Value for HEAVIX:** Sellers see which listings are "stale," "under-priced vs. estimate," "missing inspection," "low-view" — a single score per listing drives action.
- **Complexity:** Medium — deterministic rules over existing signals (views, favorites, leads, days-listed, price-vs-estimate delta, document completeness). ADR-005 #5 specifies "deterministic, versioned, cached" — no ML required for V1.
- **Data dependency:** `Listing.viewCount`, `favoriteCount`, `Lead[]`, `PriceEstimate`, `ListingImage[]`, days-since-publish — **all exist** except the score itself + the versioning cache table.
- **Risk:** **Operational** — scoring rules must be transparent (sellers will game opaque scores); **Technical** — recomputation cost (mitigated by caching per ADR-005 #5).
- **Success measurement method:** Distribution of scores across inventory; seller-action rate after a low-score notification; listing-quality lift over time (e.g., % listings with full photo set + inspection).
- **Classification:** **Needs more data** — all input signals exist, but the scoring rules + cache table + seller-facing UX are not yet implemented (per STEP 11.28: "NO implementation code started").

---

## 4. Classification Buckets

### 4.1 MVP-ready (HEAVIX has the data + legal clearance today) — 7 capabilities

| # | Capability | Why MVP-ready | Caveat |
|---|---|---|---|
| CAP-01 | Inspection-Backed Equipment Condition Disclosure | `Inspection` model exists with checklist/score/photos/reportUrl | Must use "disclosure" language, not "certification" (legal). |
| CAP-04 | Multi-Machine Comparison with Auto-Extracted Specs | `ComparisonSession` + `ListingAttributeValue` provenance exist | MVP scope = catalog attributes only; PDF auto-extract is Phase 2. |
| CAP-06 | Multi-Language Listing Draft Generation | `ListingAttributeValue` provenance + `labelFa`/`labelEn` exist | Must label drafts `AI_INFERENCE` + "draft, not certified" badge. |
| CAP-08 | Duplicate / Irrelevant Image Detection (dedup portion) | Perceptual hashing is Low complexity; no third-party dependency | Irlevance classification is Needs-data (separate sub-capability). |
| CAP-10 | Buyer Assistant (Advisory Q&A) | `Conversation` + AI Gateway + RAG over catalog | Strictly advisory per ADR-005 #8; no mutations, no financing. |
| CAP-13 | Multi-Channel Remarketing (Make Offer / Buy Now) | `Listing.listingType`, `ListingOffer`, `Auction` models exist | Auction *settlement* (payment-handling) is GATED. |
| CAP-16 | AI-Powered Visual Content Moderation | `ModerationLog` exists; pre-trained classifiers available | Deterministic first cut; custom classifier is Phase 2. |

### 4.2 Needs more data (requires data HEAVIX doesn't yet collect) — 7 capabilities

| # | Capability | Specific data gap |
|---|---|---|
| CAP-03 | Data-Driven Price Suggestion (Range + Confidence) | Volume of `PriceObservation` rows per (brand, category, year, market) — confidence is `INSUFFICIENT` for most IRAN-market buckets today. |
| CAP-05 | Semantic / Natural-Language Machine Search | No embedding index; Persian-capable embedding model not selected; offline eval set not built. |
| CAP-07 | Missing-Document Detection | Required-document manifest per `Category` × jurisdiction does not exist; `ListingDocument` model does not exist. |
| CAP-09 | Lead Scoring & Seller CRM | `Lead.status` enum gap (ADR-005 #3); behavioral signals (favorites→offers→messages funnel) not yet captured. |
| CAP-11 | Seller Assistant (Commercial Copilot) | `SalesTeamMember` not implemented (ADR-005 #4); `Lead.status` gap; conversation history not yet wired to a copilot. |
| CAP-14 | Digital Dealership Management & Showroom (Store Center) | Most of ADR-005 is specified but not implemented (`Showroom`, `SalesTeamMember`, Smart Inventory Score, per-section `MachinePassport` verification). |
| CAP-18 | Smart Inventory Score | Input signals exist; scoring rules + cache table + UX not implemented. |

### 4.3 Needs partner or legal clearance — 4 capabilities

| # | Capability | Why gated |
|---|---|---|
| CAP-02 | Serial-Number / Model-Year Verification | Requires licensed serial-number reference DB (IronGuides or equivalent) — redistribution/legal terms. |
| CAP-12 | OEM Certified Used Programs | OEM partnership contracts + trademark/IP review. |
| CAP-15 | Cross-Market Equipment History ("Carfax for Machines") | OEM telematics + dealer-network data-sharing agreements; no industry-wide registry exists today. |
| CAP-17 | Predictive Residual Value (Financing/Leasing) | **Explicitly GATED** per worklog STEP 11.28 — financing/leasing legal review required. This research does NOT propose de-gating. |

**Sub-capability note:** CAP-08-irrelevance, CAP-10-transactional, CAP-13-auction-settlement, and CAP-15-internal-history are sub-scopes of the above capabilities that fall into a different bucket than their parent. They are noted in the "Classification" line of each capability.

**Total: 18 capabilities** — 7 MVP-ready, 7 Needs-data, 4 Needs-partner/legal.

---

## 5. Key Findings & Recommendations

1. **The inspection substrate already exists; the gap is disclosure + policy copy, not data.** `Inspection` (schema L1351–L1371) has checklist, score, photos, reportUrl, inspectorId — this is more than what many classifieds offer. CAP-01 (MVP-ready) is the lowest-cost trust differentiator. The only blocker is legal wording: IronPlanet/Ritchie Bros' own IronClad Assurance policy explicitly disclaims detection of "latent or hidden defects" — HEAVIX must mirror that discipline to avoid warranty-style liability.

2. **The price engine schema is complete; the production blocker is observation volume, not engineering.** CAP-03 is the highest-value "Needs-data" capability: `PriceEstimate` already has `priceLower`/`priceUpper`/`confidence`/`comparableCount`/`modelVersion` (L2096–L2111). The path to high-confidence public estimates is to grow `PriceObservation` rows per (brand, category, year) bucket — HEAVIX should instrument every closed deal and every external-market observation before showing estimates to buyers.

3. **There is no "Carfax for heavy equipment" — and HEAVIX should not pretend there is.** CAP-15 is gated on OEM telematics + dealer-network data-sharing agreements that don't exist today. The honest path is (a) MVP-ready internal history via `PassportEvent[]` (HEAVIX-recorded events only, clearly labeled), (b) partner-gated cross-market history as a future capability. Marketing anything stronger would be misleading.

4. **Two ADR-005 schema migrations are on the critical path for 4 of the 7 "Needs-data" capabilities.** `Lead.status` enum (ADR-005 #3) blocks CAP-09 and CAP-11. `SalesTeamMember` (ADR-005 #4) blocks CAP-11. Per-section `MachinePassport` verification fields (ADR-005 #6) block the trust upgrade of CAP-01 → true per-section verification. These migrations are additive (no data loss per STEP 11.28 Phase C) and should be sequenced first.

5. **Financing / leasing / residual-value capabilities remain GATED — this research does not propose de-gating them.** CAP-17 is documented here only because it appears in the competitive landscape (Equipment Finance News, equipment lenders using AI residuals). HEAVIX's stated position is facilitator-not-lender (`docs/product/PRODUCT-FINANCING-LEASING-PARTNERSHIPS.md`), and STEP 11.28's stage summary explicitly says "Investment/financing GATED — legal review required." Any residual-value feature requires legal sign-off before scoping.

6. **Multilingual draft generation (CAP-06) is the most under-exploited MVP-ready capability.** HEAVIX is Persian-primary but cross-border (English + Arabic) is where price premiums live. The provenance-aware attribute substrate (`ListingAttributeValue.sourceType` already includes `AI_INFERENCE`, schema L378) means HEAVIX can ship grounded multilingual drafts *without* a new schema migration — the only blockers are an LLM call, a prompt template, and a "draft, not certified" badge.

7. **Persian semantic search (CAP-05) is the highest-impact, highest-risk "Needs-data" capability.** Persian keyword search is brittle; a buyer typing "بیل مکانیکی ۲۰ تن" should match listings titled "کمبین ۲۰ تنی". But Persian embedding quality, eval infrastructure, and cost must be validated before public launch. Recommendation: build the offline eval set (query → relevant listing pairs) *first*, then choose the embedding model — not the other way around.

---

## 6. Sources Index (all URLs cited above)

1. https://www.ironplanet.com
2. https://www.ironplanet.com/marketplace-e
3. https://www.rbauction.com
4. https://www.rbauction.com/buying/ironclad-assurance
5. https://www.rbauction.com/legal-policies/ironclad-assurance-policy
6. https://www.ironplanet.com/DEKRA
7. https://www.mascus.com
8. https://highways.today/2026/09/25/mascus-at-25
9. https://www.plantandequipment.com
10. https://www.plantandequipment.news/news/middle-east-news/pe-launches-app-to-redefine-machinery-buying-experience
11. https://www.machinerytrader.com/blog/how-to-and-tips/2025/12/serial-number-guide-gives-fast-track-iron-users-fast-free-sn-vin-lookups
12. https://www.tractorhouse.com/blog/how-to-and-tips/2025/12/simplify-your-business-operations-with-the-sandhills-cloud
13. https://www.truckpaper.com/blog/how-to-and-tips/2026/06/truck-vin-guide-offers-fast-free-lookup-for-fast-track-iron-members
14. https://www.ironmartonline.com/10-steps-determine-excavator-value-by-serial-number
15. https://www.boomandbucket.com/blog/introducing-boom-bucket-the-first-trusted-marketplace-for-heavy-equipment
16. https://www.boomandbucket.com/blog/online-marketplaces-for-heavy-equipment-expanding-reach--access
17. https://catused.cat.com
18. https://www.quinncompany.com/used
19. https://www.mordorintelligence.com/industry-reports/used-construction-equipment-market
20. https://www.strategicmarketresearch.com/market-report/used-construction-equipment-market
21. https://www.cdkglobal.com/insights/dealer-management-systems-guide
22. https://www.cdkglobal.com/dms
23. https://www.cdkglobal.com/product-updates/vehicle-inventory-suite/connected-dms-intelligence
24. https://dealerbuilt.com/home
25. https://dealerbuilt.com/next-gen-dms
26. https://www.gartner.com/reviews/market/dealer-management-systems
27. https://equipmentwatch.com
28. https://equipmentwatch.com/values-market-data
29. https://equipmentwatch.com/market-activity-data
30. https://www.equipmentworld.com/equipment-calculator
31. https://machinetrail.com/blog/best-tractor-check-2026
32. https://www.quora.com/Is-there-something-like-CarFax-for-heavy-equipment-e-g-construction-agriculture-mining
33. https://help.salesforce.com/s/articleView?id=ind.auto_scoring_framework_lead_and_opportunity_conversion.htm
34. https://www.driftrock.com/blog/lead-scoring-criteria-for-the-automotive-industry
35. https://strolid.com/learn/hub/automotive-lead-management-complete-guide-to-converting-more-leads
36. https://leadlocate.com/sales-leads/automotive-lead-conversion-benchmarks
37. https://numa.com/blog/lead-scoring-model-dealership
38. https://www.stilltide.us/equipment/construction
39. https://www.emerald.com/ecam/article/32/5/3453/1274746/Predicting-construction-equipment-resale-price
40. https://www.researchgate.net/publication/378261904
41. https://equipmentfinancenews.com/news/lender-operations/ai-paves-way-for-equipment-lenders-to-predict-residual-values
42. https://www.equipmentappraisal.com/blog/the-pros-and-cons-of-using-ai-in-equipment-valuation
43. https://impel.ai/blog/agentic-ai-automotive-retail-buyer-agent
44. https://strolid.com/learn/conversational-ai-for-dealerships-chatbots-that-convert
45. https://insiderone.com/ai-shopping-assistants
46. https://learn.microsoft.com/en-us/microsoft-sales-copilot/introduction
47. https://automotiveai.com/agents/copilot
48. https://www.autoraptor.com/ai-sales-assistant-for-dealerships
49. https://salestarget.ai/blogs/ai-sales-copilot-how-it-works-and-use-cases
50. https://www.salesforce.com/commerce/ecommerce-site-search/semantic
51. https://oneuptime.com/blog/post/2026-02-17-how-to-implement-semantic-search-for-e-commerce-with-vertex-ai-vector-search/view
52. https://arxiv.org/html/2601.16492v1
53. https://www.bloomreach.com/en/blog/semantic-search-explained-in-5-minutes
54. https://www.speclens.ai
55. https://perci.ai/listing-translation
56. https://linguin.app/blog/ai-translation-multilingual-e-commerce-product-listings
57. https://listapro.ai/multiple-languages
58. https://qualixsolutions.com/insights/enterprise-ai-multilingual-content-generation-marketing-platforms
59. https://www.v7labs.com/agents/missing-document-detection
60. https://www.abbyy.com/blog/document-ai-aml-kyc-compliance
61. https://www.uptiq.ai/blogs/kyc-compliance-requirements-checklist
62. https://www.velebit.ai/duplicate-detection
63. https://cloudinary.com/documentation/cloudinary_duplicate_image_detection_addon
64. https://aws.amazon.com/blogs/media/using-computer-vision-to-automate-media-content-deduplication-workflows
65. https://vecstore.app/blog/duplicate-image-detection
66. https://visua.com/use-case/content-moderation-with-computer-vision
67. https://b2b.kbb.com/dealership-resources/why-kbb
68. https://blog.ritchiebros.com/6-things-you-didnt-know-about-marketplace-e
69. https://www.rocktoroad.com/ritchie-bros-introduces-marketplace-e-a-new-way-to-buy-and-sell-equipment-5808
70. https://www.makana.com/en/used-equipment-value-calculator

---

## 7. Research Integrity Notes

- **No fabricated statistics.** Where two market-size sources disagreed (Mordor USD 132.67B vs. Strategic Market Research USD 22.5B), both are cited with the discrepancy flagged and HEAVIX explicitly told not to commit to either as a TAM.
- **No claim that HEAVIX already has a capability that it does not.** Every "EXISTS" claim above is tied to a schema line number verified directly in `/home/z/heavix/prisma/schema.prisma`. Every "DOES NOT EXIST" claim is tied to ADR-005 (which proposes the missing model/field).
- **Critic findings B1/B2/H1/H2/H3 re-verified against schema, not just worklog.** `Company.logoUrl` (L1182), `MachinePassport` field shape (L1149–L1159), `PremiumSubscription.userId @unique` (L1128) all confirmed.
- **Financing / leasing / investment capabilities remain GATED.** CAP-17 is documented for completeness; classification = Needs partner or legal clearance; **no de-gating proposed.**
- **Research-only mode.** No code, schema, migration, or PR was modified. No merge was performed.
