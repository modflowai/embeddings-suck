---
type: post
platform: linkedin
status: draft
date: 2026-03-12
tags:
  - embeddings
  - search
  - modflow-ai
  - linkedin
---

# Embeddings Suck (sometimes)

## Draft LinkedIn Post

---

Embeddings don't understand your domain.

I tested OpenAI text-embedding-3-small vs PostgreSQL full-text search on 1,862 hydrogeology documents. Raw, unoptimized, head to head.

Search "NOPTMAX" — a parameter that appears 66 times in the docs.
→ Text search: found it instantly.
→ Embeddings: returned pestpp-opt.md. Wrong doc. Not even close.

Search "MT3DMS" — a transport model mentioned 167 times.
→ Text search: nailed it.
→ Embeddings: returned MP3DU2MIF.md. What?

Search "PESTPP-IES" — the most popular tool in the PEST++ suite.
→ Text search: pestpp-ies.md, 28 matches.
→ Embeddings: README.md. It gave up and returned the README.

Now search "groundwater recharge" — natural language, no acronyms.
→ Embeddings found it. Recharge docs, RCH package, all right there.
→ Text search also found it. Both win.

I tested 30 terms. Embeddings failed on 24 of them. Won on zero.

The pattern: embeddings fail on domain-specific acronyms and jargon (SMS, UZF, PHIMLIM, MODPATH, MT3DMS) but work fine on natural language queries. Raw cosine similarity has no idea what "SMS" means in groundwater modeling — it thinks Short Message Service.

"But you should filter by metadata first!"

Yes. That's exactly the point. In production, you don't use raw embeddings alone. You layer acronym expansion, metadata pre-filtering, repository scoping, and domain-specific weighting on top. That's what I do in MODFLOW AI — a system I built solo as a civil engineer, not a ML team.

I built a CI/CD pipeline that auto-ingests FloPy source code when it changes. I indexed PEST and PEST++ manuals with full-text search AND semantic search. I talk to MODFLOW documentation through my own AI agents, every day. It took years of ingesting, curating, and weighting everything myself — and it paid off.

But I only discovered what works by testing on my own data. Not by reading blog posts about RAG. Not by copying what everyone else does.

**Benchmarks lie. Your data tells the truth.**

Try it yourself: gwlink.ai/fts-vs-embeddings
(Interactive demo — 3D embedding space visualization, side-by-side search, 10 test queries, zero API cost)

---

## Pre-emptive objections (addressed in post or ready as comments)

1. **"You should use metadata filtering"** — Yes, that's the point. Raw embeddings alone aren't enough. The demo shows the baseline intentionally. In production I use acronym expansion, repo pre-filtering, and domain weighting.

2. **"Use a better embedding model"** — text-embedding-3-small is one of the most popular. The issue isn't the model quality — it's domain ambiguity. "SMS" means something different in every domain.

3. **"Try HyDE or query expansion"** — Valid. Those help. But they add latency and complexity. FTS is 2ms. The question is whether the complexity is worth it for YOUR use case.

4. **"Your corpus is too small"** — 1,862 docs is realistic for a domain-specific application. Most teams don't have millions of documents.

5. **"Add fine-tuning"** — Sure, but that requires labeled data from domain experts. The whole point is that generic embeddings need domain adaptation. The question is HOW MUCH adaptation.

---

## Notes for revision

- [ ] URL: gwlink.ai/fts-vs-embeddings — need to set up redirect/hosting
- [ ] Add screenshot/video of the 3D viz for the post image
- [ ] Consider shorter version — LinkedIn optimal is ~1300 chars
- [ ] "I built solo" angle — civil engineer with hydrogeology masters, not a ML team
- [ ] Frame as invitation to explore, not arrogance
- [ ] Video: screen recording clicking through chips, 3D viz animating

## Visual ideas

- Screenshot of 3D viz with query labels (red query dot, green FTS, blue embedding — all spread apart)
- Animated GIF cycling through queries — showing embeddings fail then succeed
- Side-by-side still: NOPTMAX (embeddings fail) vs "groundwater recharge" (embeddings win)
- The 3D point cloud itself is eye-catching — 1,616 colored dots in space
- Video: screen recording clicking through chips, verdict labels appearing
