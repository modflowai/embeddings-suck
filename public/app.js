import { init3D, highlightSearch, resetViz } from "./viz3d.js";

const ftsContainer = document.getElementById("ftsResults");
const semContainer = document.getElementById("semanticResults");
const ftsTiming = document.getElementById("ftsTiming");
const semTiming = document.getElementById("semanticTiming");
const vizCaption = document.getElementById("vizCaption");
const activeQueryEl = document.getElementById("activeQuery");
const chips = document.querySelectorAll(".chip");

// Load stats
fetch("/api/stats")
  .then((r) => r.json())
  .then((s) => {
    document.getElementById("footer").innerHTML =
      `${s.total_docs.toLocaleString()} docs &middot; ${s.total_repos} repos &middot; ` +
      `${s.with_embeddings.toLocaleString()} embeddings &middot; ` +
      `PostgreSQL 17 + pgvector &middot; text-embedding-3-small`;
  });

// What you'd expect to find for each query
const expectedAnswer = {
  "SMS": { file: "sparse_matrix_solver_sms_package.md", label: "the Sparse Matrix Solver docs" },
  "UZF": { file: "uzf", label: "the Unsaturated Zone Flow package docs" },
  "WEL package": { file: "wel", label: "the Well (WEL) package docs" },
  "groundwater recharge": { file: "rch", label: "recharge-related docs" },
  "unsaturated zone flow": { file: "uzf", label: "the UZF (Unsaturated Zone Flow) docs" },
  "PEST calibration": { file: "pest", label: "PEST calibration docs" },
};

// Init 3D viz
init3D("viz3d");

chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    chips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    search(chip.dataset.query);
  });
});

async function search(query) {
  activeQueryEl.textContent = `Searching: "${query}"`;

  ftsContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Searching...</div>';
  semContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Searching...</div>';
  ftsTiming.textContent = "";
  semTiming.textContent = "";

  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();

    renderFts(data.fts);

    if (data.semantic) {
      renderSemantic(data.semantic);
      semTiming.innerHTML =
        `<span>${data.semantic.timeMs}ms</span> ` +
        `&middot; scanned ${data.semantic.totalScanned.toLocaleString()}`;

      // Update 3D viz
      highlightSearch(data.fts.results, data.semantic.results, query);

      // Caption — tell the story: what you'd expect vs what happened
      const sem1 = data.semantic.results[0]?.filepath?.split("/").pop();
      const expected = expectedAnswer[query];
      const semFoundExpected = expected && data.semantic.results.some(r =>
        r.filepath.toLowerCase().includes(expected.file.toLowerCase())
      );
      const ftsFoundExpected = expected && data.fts.results.some(r =>
        r.filepath.toLowerCase().includes(expected.file.toLowerCase())
      );
      const semRank = expected && data.semantic.results.findIndex(r =>
        r.filepath.toLowerCase().includes(expected.file.toLowerCase())
      );

      if (expected && ftsFoundExpected && !semFoundExpected) {
        // FTS wins — embeddings missed the obvious answer
        vizCaption.innerHTML =
          `You searched "<strong>${query}</strong>". You'd expect to find ${expected.label}. ` +
          `<span style="color:#22c55e">Text search</span> found it instantly. ` +
          `<span style="color:#3b82f6">Embeddings</span> returned "${sem1}" instead &mdash; ` +
          `<strong>the correct doc isn't even in the top 10.</strong>`;
      } else if (expected && semFoundExpected && ftsFoundExpected) {
        // Both found it
        const rankNote = semRank === 0 ? "as #1" : `at #${semRank + 1}`;
        vizCaption.innerHTML =
          `You searched "<strong>${query}</strong>". You'd expect to find ${expected.label}. ` +
          `<span style="color:#22c55e">Text search</span> found it. ` +
          `<span style="color:#3b82f6">Embeddings</span> also found it ${rankNote}. ` +
          `<strong>Both methods work for natural language queries.</strong>`;
      } else if (expected && semFoundExpected && !ftsFoundExpected) {
        // Semantic wins
        vizCaption.innerHTML =
          `You searched "<strong>${query}</strong>". You'd expect to find ${expected.label}. ` +
          `<span style="color:#3b82f6">Embeddings</span> found it! ` +
          `<span style="color:#22c55e">Text search</span> missed it &mdash; the exact words aren't in the doc. ` +
          `<strong>Embeddings shine when the meaning matters more than the words.</strong>`;
      } else {
        // Fallback
        vizCaption.innerHTML =
          `You searched "<strong>${query}</strong>". ` +
          `<span style="color:#22c55e">Green dots</span> = text search results. ` +
          `<span style="color:#3b82f6">Blue dots</span> = embedding results. ` +
          `See how close (or far) each method's results are from your query.`;
      }
    } else {
      semContainer.innerHTML =
        '<div class="no-results">No cached embedding for this query</div>';
      semTiming.innerHTML = "";
      resetViz();
    }

    ftsTiming.innerHTML = `<span class="fast">${data.fts.timeMs}ms</span> &middot; ${data.fts.totalMatches} matches`;
    activeQueryEl.textContent = `"${query}"`;
  } catch (err) {
    ftsContainer.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    semContainer.innerHTML = "";
  }
}

function renderFts(fts) {
  if (!fts.results.length) {
    ftsContainer.innerHTML = '<div class="no-results">No matches found</div>';
    return;
  }
  ftsContainer.innerHTML = fts.results.map((r, i) => resultCard(r, i + 1, true)).join("");
}

function renderSemantic(sem) {
  if (!sem.results.length) {
    semContainer.innerHTML = '<div class="no-results">No results</div>';
    return;
  }
  semContainer.innerHTML = sem.results.map((r, i) => resultCard(r, i + 1, false)).join("");
}

function resultCard(r, rank, isFts) {
  const snippet = isFts ? r.snippet : escapeHtml(r.snippet);

  return `
    <div class="result-card">
      <div class="card-header">
        <span class="card-rank">#${rank}</span>
        <span class="card-filepath">${escapeHtml(r.filepath)}</span>
        <span class="repo-badge">${escapeHtml(r.repo)}</span>
      </div>
      <div class="card-snippet">${snippet}</div>
    </div>`;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}
