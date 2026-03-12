/**
 * Pre-compute 3D PCA projection of all document embeddings.
 * Run once: DATABASE_URL=postgresql://link:linkdev@localhost:5433/linkmemory node scripts/precompute-3d.js
 * Outputs: points-3d.json
 */
import pg from "pg";
import { PCA } from "ml-pca";
import { readFileSync, writeFileSync } from "fs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log("Fetching embeddings from DB...");
  const { rows } = await pool.query(`
    SELECT id, filepath, repo_name, embedding::text
    FROM mfai_repository_files
    WHERE embedding IS NOT NULL
    ORDER BY id
  `);
  console.log(`Got ${rows.length} docs with embeddings`);

  // Parse embedding vectors
  const ids = [];
  const filepaths = [];
  const repos = [];
  const matrix = [];

  for (const row of rows) {
    ids.push(row.id);
    filepaths.push(row.filepath);
    repos.push(row.repo_name);
    // embedding comes as "[0.1,0.2,...]" text
    const vec = JSON.parse(row.embedding);
    matrix.push(vec);
  }

  console.log(`Matrix: ${matrix.length} x ${matrix[0].length}`);
  console.log("Running PCA (this may take a moment)...");

  const pca = new PCA(matrix, { center: true, scale: false });
  const projected = pca.predict(matrix, { nComponents: 3 });
  const projData = projected.to2DArray();

  console.log("PCA done. Variance explained:",
    pca.getExplainedVariance().slice(0, 3).map(v => (v * 100).toFixed(1) + "%"));

  // Also project the cached query embeddings
  const cache = JSON.parse(readFileSync("embeddings-cache.json", "utf-8"));
  const queryPoints = {};
  for (const [queryText, embedding] of Object.entries(cache)) {
    const projected3d = pca.predict([embedding], { nComponents: 3 }).to2DArray()[0];
    queryPoints[queryText] = { x: projected3d[0], y: projected3d[1], z: projected3d[2] };
  }

  // Build compact output
  const output = {
    docs: projData.map((p, i) => ({
      x: Math.round(p[0] * 1000) / 1000,
      y: Math.round(p[1] * 1000) / 1000,
      z: Math.round(p[2] * 1000) / 1000,
      f: filepaths[i],  // filepath (short key for size)
      r: repos[i],      // repo
    })),
    queries: Object.fromEntries(
      Object.entries(queryPoints).map(([k, v]) => [
        k,
        { x: Math.round(v.x * 1000) / 1000, y: Math.round(v.y * 1000) / 1000, z: Math.round(v.z * 1000) / 1000 },
      ])
    ),
    variance: pca.getExplainedVariance().slice(0, 3).map(v => Math.round(v * 10000) / 100),
  };

  writeFileSync("public/points-3d.json", JSON.stringify(output));
  const sizeMB = (JSON.stringify(output).length / 1024 / 1024).toFixed(2);
  console.log(`Saved public/points-3d.json (${sizeMB} MB, ${output.docs.length} docs, ${Object.keys(output.queries).length} queries)`);

  await pool.end();
}

main().catch(console.error);
