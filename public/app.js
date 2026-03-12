import { init3D, highlightSearch, resetViz, updateThemeBg } from "./viz3d.js";

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
  "SMS": { files: ["sparse_matrix_solver_sms", "sms"], label: "the Sparse Matrix Solver docs" },
  "UZF": { files: ["uzf"], label: "the Unsaturated Zone Flow package docs" },
  "WEL package": { files: ["wel"], label: "the Well (WEL) package docs" },
  "groundwater recharge": { files: ["rch", "recharge"], label: "recharge-related docs" },
  "unsaturated zone flow": { files: ["uzf", "unsaturated"], label: "unsaturated zone flow docs" },
  "PEST calibration": { files: ["pest"], label: "PEST calibration docs" },
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
      const matchesExpected = (filepath) =>
        expected.files.some(f => filepath.toLowerCase().includes(f.toLowerCase()));
      const semFoundExpected = expected && data.semantic.results.some(r => matchesExpected(r.filepath));
      const ftsFoundExpected = expected && data.fts.results.some(r => matchesExpected(r.filepath));
      const semRank = expected && data.semantic.results.findIndex(r => matchesExpected(r.filepath));

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
  ftsContainer.innerHTML = fts.results.slice(0, 5).map((r, i) => resultRow(r, i + 1, true)).join("");
}

function renderSemantic(sem) {
  if (!sem.results.length) {
    semContainer.innerHTML = '<div class="no-results">No results</div>';
    return;
  }
  semContainer.innerHTML = sem.results.slice(0, 5).map((r, i) => resultRow(r, i + 1, false)).join("");
}

function resultRow(r, rank, isFts) {
  const snippet = isFts ? r.snippet : escapeHtml(r.snippet);
  const filename = r.filepath.split("/").pop();

  return `
    <div class="result-row">
      <div class="row-header">
        <span class="row-rank">#${rank}</span>
        <span class="row-filepath">${escapeHtml(filename)}</span>
        <span class="row-repo">${escapeHtml(r.repo)}</span>
      </div>
      <div class="row-snippet">${snippet}</div>
    </div>`;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

// Theme toggle
document.getElementById("themeToggle").addEventListener("click", () => {
  const isLight = document.documentElement.classList.toggle("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  updateThemeBg();
});
