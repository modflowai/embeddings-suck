import express from "express";
import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Pre-cached embeddings — no OpenAI API calls at runtime
const embeddingsCache = JSON.parse(
  readFileSync(join(__dirname, "embeddings-cache.json"), "utf-8")
);
console.log(`Loaded ${Object.keys(embeddingsCache).length} cached embeddings`);

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

app.post("/api/search", async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "query required" });
  }

  const trimmed = query.trim().slice(0, 200);

  // FTS search — always works
  const ftsStart = performance.now();
  const ftsResult = await pool.query(
    `SELECT id, filepath, repo_name,
       ts_rank_cd(content_tsvector, plainto_tsquery('english', $1)) AS score,
       ts_headline('english', LEFT(content, 3000), plainto_tsquery('english', $1),
         'StartSel=<mark>, StopSel=</mark>, MaxFragments=1, MaxWords=35, MinWords=15') AS snippet
     FROM mfai_repository_files
     WHERE content_tsvector @@ plainto_tsquery('english', $1)
     ORDER BY score DESC, CASE WHEN filepath ILIKE '%' || $1 || '%' THEN 0 ELSE 1 END LIMIT 10`,
    [trimmed]
  );
  const ftsMs = performance.now() - ftsStart;

  const ftsCountResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM mfai_repository_files
     WHERE content_tsvector @@ plainto_tsquery('english', $1)`,
    [trimmed]
  );

  // Semantic search — only if we have a cached embedding
  const cachedEmbedding = embeddingsCache[trimmed];
  let semantic = null;

  if (cachedEmbedding) {
    const vecStr = `[${cachedEmbedding.join(",")}]`;

    const semStart = performance.now();
    const semResult = await pool.query(
      `SELECT id, filepath, repo_name,
         1 - (embedding <=> $1::vector) AS score,
         LEFT(content, 200) AS snippet
       FROM mfai_repository_files
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector LIMIT 10`,
      [vecStr]
    );
    const semMs = performance.now() - semStart;

    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM mfai_repository_files WHERE embedding IS NOT NULL`
    );

    semantic = {
      results: semResult.rows.map((r) => ({
        filepath: r.filepath,
        repo: r.repo_name,
        score: parseFloat(Number(r.score).toFixed(4)),
        snippet: r.snippet,
      })),
      totalScanned: totalResult.rows[0].total,
      timeMs: Math.round(semMs * 10) / 10,
      embeddingTimeMs: 0, // pre-cached, no API call
    };
  }

  res.json({
    query: trimmed,
    fts: {
      results: ftsResult.rows.map((r) => ({
        filepath: r.filepath,
        repo: r.repo_name,
        score: parseFloat(Number(r.score).toFixed(4)),
        snippet: r.snippet,
      })),
      totalMatches: ftsCountResult.rows[0].total,
      timeMs: Math.round(ftsMs * 10) / 10,
    },
    semantic,
  });
});

app.get("/api/stats", async (_req, res) => {
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total_docs,
      COUNT(DISTINCT repo_name)::int AS total_repos,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS with_embeddings,
      COUNT(*) FILTER (WHERE content_tsvector IS NOT NULL)::int AS with_fts
    FROM mfai_repository_files
  `);
  res.json({ ...result.rows[0], cachedQueries: Object.keys(embeddingsCache) });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`embeddings-suck running on :${PORT}`));
