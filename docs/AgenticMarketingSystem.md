1. High-Level Architecture (text + flow)

- Multi-tenant SaaS with strict tenant scoping via `tenant_id` across all data, APIs, queues, caches, and events. Row-Level Security enforces isolation in PostgreSQL. Redis namespaces and Vector DB collections are per-tenant.
- Orchestrator agents coordinate stateless worker agents. All inter-agent communication uses JSON contracts and event topics keyed by `tenant_id`.
- Primary data in PostgreSQL; high-throughput queues, rate limits, and transient state in Redis; brand and content memory in Vector DB (Qdrant/Weaviate); append-only `events` table for analytics and attribution with partitioning for scale.
- Human-in-the-loop checkpoints pause orchestrations at strategic stages; approvals recorded and auditable.

- Funnel Flow (mandatory):
  - Branding Agent → Content Strategy + Visual Guidelines → Content Creation (blogs, reels, carousels, ads) → Platforms + Community Distribution → Landing Pages → Traffic (Organic + Paid) → Tracking (Visitors, Retargeting Pixels) → Forms / Meeting Scheduling → CRM → Email & WhatsApp Automation → Purchase → Feedback + Retention → Affiliate / Referral Loop

2. Agent-by-Agent Breakdown

- Branding Agent
  - Function: Derive brand positioning, tone, guidelines, personas foundation.
  - Worker Agents: MarketResearchWorker, PositioningSynthesizer, ToneGuidelineWriter, PersonaBuilder, VectorMemoryWriter.
  - Inputs: tenant_id, goals, industry, competitors, seed materials.
  - Outputs: brand_core, personas, visual and tone guidelines, embeddings refs.
  - Execution: research → synthesize → propose → human approval → persist → embed.
  - Feedback: Consume analytics_snapshots and content performance to refine positioning.

- Content Creation Agent
  - Function: Create multi-format assets aligned to strategy and personas.
  - Worker Agents: StrategyPlanner, TopicMapper, AssetGenerator (blog/reel/carousel/ad), AssetQA, VariantGenerator, EmbeddingIndexer.
  - Inputs: tenant_id, brand_core, personas, goals, channels, cadence.
  - Outputs: content_assets with variants, tags, storage references, embeddings.
  - Execution: strategy → topic plan → asset generation → QA → varianting → publish-ready.
  - Feedback: CTR, dwell time, shares, comments drive topic refinement and variant weights.

- Community & Engagement Agent
  - Function: Distribute content to platforms, manage replies, trigger community growth loops.
  - Worker Agents: PublisherWorker, CommentResponder, CommunityScheduler, AudienceSegmenter.
  - Inputs: content_assets, platform credentials, schedules.
  - Outputs: distribution events, engagement tasks, community metrics.
  - Feedback: Platform engagement -> update audience segments and posting windows.

- Ad Campaign Manager Agent
  - Function: Create and optimize paid ads across Google/Meta with retargeting.
  - Worker Agents: CampaignCreator, BudgetAllocator, CreativeVariantTester, RetargetingListBuilder, BidOptimizer.
  - Inputs: tenant_id, brand_core, assets, audiences, budget, goals.
  - Outputs: campaigns, ad sets, pixels, retargeting rules, ad_performance.
  - Execution: plan → launch → monitor → optimize → scale → pause.
  - Feedback: CPA/ROAS/CTR feed bid and budget adjustments; poor segments excluded.

- Website & Landing Page Agent
  - Function: Generate tenant-branded sites and conversion-optimized landing pages with instrumented tracking.
  - Worker Agents: PageSchemaDesigner, CopyWriter, ComponentAssembler, A/B VariantGenerator, TrackingInjector.
  - Inputs: brand_core, conversion_goal, offer, assets.
  - Outputs: landing_pages with variants, tracking tags and forms.
  - Feedback: Conversion rates per variant drive future auto-selection and content changes.

- SEO Agent
  - Function: Technical and content SEO across site and articles.
  - Worker Agents: KeywordMiner, InternalLinker, MetaTagger, SchemaMarkupWriter, SitemapUpdater.
  - Inputs: brand_core, topics, site map.
  - Outputs: on-page SEO updates, content briefs, link structures.
  - Feedback: Rankings, clicks, dwell time inform keyword focus and interlink rules.

- Email Marketing Agent
  - Function: Nurture and convert with Email/WhatsApp sequences.
  - Worker Agents: SequenceDesigner, TemplateRenderer, DeliverabilityGuard, SendScheduler, ReminderBot.
  - Inputs: leads, personas, campaigns, triggers.
  - Outputs: emails, sends, follow-up tasks, events (opens, clicks, replies), WhatsApp messages.
  - Feedback: Open/click/reply rates drive variant selection, send windows, and content tone.

- Influencer Collaboration Agent
  - Function: Source influencers, propose contracts, track deliverables and outcomes.
  - Worker Agents: InfluencerFinder, ContractGenerator, DeliverableTracker, PerformanceAnalyzer.
  - Inputs: audience criteria, budget, campaigns.
  - Outputs: influencer_campaigns, contracts, deliverables, tracked performance.
  - Feedback: Cost per lift and attributable conversions inform future picks and rates.

- Affiliate Marketing Agent (Company Side)
  - Function: Manage affiliates, links, commissions, and payouts.
  - Worker Agents: AffiliateRegistrar, LinkGenerator, CommissionCalculator, PayoutScheduler.
  - Inputs: affiliate applications, campaign mapping, commission rules.
  - Outputs: affiliates, affiliate_events, payouts.
  - Feedback: Conversion quality and fraud checks refine commission tiers.

- Affiliate Assistant Agent (User Side)
  - Function: Help affiliates with content, links, tracking, and optimization.
  - Worker Agents: ContentCoPilot, LinkPersonalizer, PerformanceExplainer.
  - Inputs: affiliate_id, brand_core, assets.
  - Outputs: recommended content, links, optimization guidance.
  - Feedback: Performance loops inform personalized advice.

- Analytics & Feedback Orchestrator
  - Function: Aggregate events into analytics_snapshots and feed insights back to all agents.
  - Worker Agents: EventIngestor, AttributionModeler, SnapshotBuilder, InsightBroadcaster.
  - Inputs: events, ad_performance, emails, affiliate_events.
  - Outputs: analytics_snapshots, optimization recommendations.
  - Feedback: Closed-loop to Branding, Content, Ads, Email, SEO, Influencer, Affiliate agents.

3. Database Design (schemas + justification)

- Primary DB: PostgreSQL
  - Reasons: Relational integrity, RLS for multi-tenancy, strong indexing, partitioning, JSONB flexibility, analytics-friendly.
- Secondary: Redis
  - Reasons: Queues, ephemeral agent state, rate limits, caching, streams for ingestion.
- Secondary: Vector DB (Qdrant/Weaviate)
  - Reasons: Brand memory, content similarity, retrieval personalization; tenant-scoped collections.
- Event table: Append-only in PostgreSQL, partitioned by time for scale; supports attribution and retro analyses.

- Minimum Tables and Key Fields
  - `tenants`: id, name, slug, status, created_at, updated_at.
  - `users`: id, tenant_id, email, name, role, status, created_at, updated_at.
  - `brand_core`: id, tenant_id, positioning, tone, guidelines jsonb, embedding_ref, created_at, updated_at.
  - `personas`: id, tenant_id, name, description, attributes jsonb, embedding_ref, created_at, updated_at.
  - `content_assets`: id, tenant_id, type, title, status, data jsonb, storage_url, tags text[], embedding_ref, campaign_id, created_at, updated_at.
  - `campaigns`: id, tenant_id, name, strategy jsonb, budget numeric, currency, start_date, end_date, channels text[], status, created_at, updated_at.
  - `landing_pages`: id, tenant_id, name, url_path, page_schema jsonb, variant, status, campaign_id, created_at, updated_at.
  - `leads`: id, tenant_id, email, phone, name, source, status, attributes jsonb, landing_page_id, campaign_id, affiliate_id, user_id, created_at, updated_at.
  - `events`: id, tenant_id, event_type, source, occurred_at, session_id, visitor_id, lead_id, campaign_id, landing_page_id, email_id, ad_id, meta jsonb.
  - `emails`: id, tenant_id, type, template_id, subject, body, channel, schedule_at, status, campaign_id, lead_id, metrics jsonb, created_at, updated_at.
  - `ad_performance`: id, tenant_id, date, network, campaign_id, ad_group_id, ad_id, impressions, clicks, cost, conversions, revenue.
  - `influencer_campaigns`: id, tenant_id, influencer_id, name, campaign_id, contract jsonb, budget, status, start_date, end_date, performance jsonb.
  - `affiliates`: id, tenant_id, user_id, name, referral_code, commission_rate, status, payout_info jsonb, created_at, updated_at.
  - `affiliate_events`: id, tenant_id, affiliate_id, occurred_at, event_type, lead_id, campaign_id, amount, meta jsonb.
  - `analytics_snapshots`: id, tenant_id, date, dimension, dimension_id, metrics jsonb, computed_at.

- Indexes and Performance
  - Btree on `(tenant_id, id)` per table.
  - Time-based indexes `(tenant_id, occurred_at)` on `events` and `(tenant_id, date)` on `ad_performance` and `analytics_snapshots`.
  - GIN on JSONB fields like `guidelines`, `strategy`, `data`, `attributes`, `meta`, `metrics`.
  - GIN on `content_assets.tags` for fast tagging queries.
  - `events` partitioned by month on `occurred_at`.
  - RLS enabled and policies per tenant_id.

4. API / Event Contracts (JSON)

- All endpoints require `tenant_id` and enforce scoping server-side. Responses return structured JSON with ids and timestamps.
- Key contracts provided in `contracts/api/*.json` and events in `contracts/events/event.schema.json`.

5. Human-in-the-Loop Flow

- Required approvals with pause states:
  - Brand positioning & tone: Branding Agent proposes → approval required.
  - Campaign strategy: Content + Ads plan → approval required.
  - Ad budget scaling: BudgetAllocator proposes scale-up/down → approval required.
  - Influencer contracts: ContractGenerator proposes → approval required.
  - Affiliate commission changes: CommissionCalculator proposes → approval required.
- Overrides: Human can force accept/reject, edit artifacts, or change policies. All approvals logged.

6. Feedback & Optimization Loops

- Continuous insights from `analytics_snapshots` broadcast to agents:
  - Branding: Repositioning when perception metrics drift.
  - Content: Topic selection and variant weighting by engagement.
  - Ads: Bid/budget optimization by CPA/ROAS.
  - SEO: Keyword focus by rankings and CTR.
  - Email: Send window and template selection by open/click/reply.
  - Influencer/Affiliate: Commission tiers by quality-adjusted conversions.

7. Scaling & Future Extensions

- Scaling: Partitioned events, batched writes, queue backpressure, idempotent processors, horizontal workers per tenant namespace, read replicas for analytics.
- Extensions: Add new agents by registering JSON contracts and topic handlers; multi-region tenancy; differential privacy analytics; LLM fine-tuned per-tenant brand memory.

