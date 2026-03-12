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

I ran a simple experiment: text search vs AI embeddings on 1,862 hydrogeology documents.

Search "SMS" — you'd expect the Sparse Matrix Solver docs.
→ Text search found it instantly.
→ Embeddings returned "MF6BUD2SMP.md" — a completely unrelated budget utility. The correct doc isn't even in the top 10.

Search "unsaturated zone flow" — a natural language query.
→ Embeddings nailed it. Richards' equation, UZF docs, all right there.
→ Text search also found it, but through exact keyword matching.

The pattern is clear: embeddings fail on domain-specific acronyms (SMS, UZF, WEL) but shine on conceptual queries. Raw cosine similarity has no idea what "SMS" means in groundwater modeling.

This is raw OpenAI text-embedding-3-small vs raw PostgreSQL full-text search. No tricks, no optimization, no preprocessing.

In MODFLOW AI — a system I built solo — I layer acronym expansion, metadata weighting, repository pre-filtering, and domain-specific curation on top. I built a CI/CD pipeline that auto-ingests FloPy source code whenever it changes. I indexed tutorials with semantic search. I talk to MODFLOW and PEST documentation through my own AI agents, every day.

This wasn't a weekend project. It's been years of ingesting, curating, and weighting everything myself — and it paid off.

But here's the thing: I only discovered what works by testing on my own data. Not by reading blog posts. Not by copying what everyone else does with RAG.

**The only way to know what works is to try it on your own data.**

Try it yourself: modflow.ai/embeddings-suck
(Interactive demo — 3D embedding space visualization, side-by-side comparison, zero API cost)

---

## Notes for revision

- [ ] Decide on exact URL once deployed
- [ ] Add screenshot/video of the 3D viz for the post image — something that stops the scroll
- [ ] Consider shorter version — LinkedIn optimal is ~1300 chars
- [ ] "I built solo" angle — civil engineer with hydrogeology masters, not a ML team
- [ ] Mention: "I ingested, curated, and weighted everything myself — acronym expansion, domain-specific ranking, the works"
- [ ] CI/CD pipeline: auto-ingests FloPy source code on changes
- [ ] Tutorials indexed with semantic search
- [ ] Years of solo work (literal years) — emphasize this paid off
- [ ] "I talk to MODFLOW and PEST through my own AI agents" — daily use, not theoretical
- [ ] Frame as invitation to explore, not arrogance
- [ ] The demo is raw/unoptimized on purpose — to show the baseline

## Visual ideas

- Screenshot of 3D viz with SMS labels (red query, green text, blue embedding — all spread apart)
- Animated GIF cycling through all 6 queries — showing embeddings fail then succeed
- Side-by-side still: SMS (embeddings fail) vs "groundwater recharge" (embeddings win)
- The 3D point cloud itself is eye-catching — 1,616 colored dots in space
- Video: screen recording clicking through chips, 3D viz animating between queries
