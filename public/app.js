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
      `${s.total_docs.toLocaleString()} documents from ${s.total_repos} repositories &mdash; embedded, indexed, and compared` +
      `<span class="footer-stack">PostgreSQL 17 + pgvector &middot; OpenAI text-embedding-3-small</span>`;
  });

// What you'd expect to find for each query
const expectedAnswer = {
  "SMS": { files: ["sparse_matrix_solver_sms", "sms"], label: "the SMS (Sparse Matrix Solver) docs" },
  "UZF": { files: ["uzf"], label: "the UZF (Unsaturated Zone Flow) docs" },
  "NOPTMAX": { files: ["pest_control_file", "noptmax", "control_file"], label: "the PEST control file docs (NOPTMAX parameter)" },
  "MT3DMS": { files: ["mt3dms"], label: "the MT3DMS transport model docs" },
  "MODPATH": { files: ["modpath"], label: "the MODPATH particle tracking docs" },
  "PHIMLIM": { files: ["phimlim", "tikhonov", "regularis"], label: "the PHIMLIM regularisation docs" },
  "groundwater recharge": { files: ["rch", "recharge"], label: "recharge-related docs" },
  "unsaturated zone flow": { files: ["richards", "unsaturated_flow"], label: "Richards' equation / unsaturated flow docs" },
  "PESTPP-IES": { files: ["pestpp-ies", "pestpp_ies"], label: "the PESTPP-IES (Iterative Ensemble Smoother) docs" },
};

// Init 3D viz
init3D("viz3d");

chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    if (chip.classList.contains("active")) {
      // Deselect — reset everything
      chip.classList.remove("active");
      ftsContainer.innerHTML = '<div class="empty-state">Choose a query above to start the comparison</div>';
      semContainer.innerHTML = '<div class="empty-state">Choose a query above to start the comparison</div>';
      ftsTiming.textContent = "";
      semTiming.textContent = "";
      activeQueryEl.textContent = "";
      vizCaption.innerHTML = "Sometimes exact words beat AI. Sometimes they don't. Try a query to see which.";
      document.querySelector('.fts-column')?.classList.remove('dimmed');
      document.querySelector('.semantic-column')?.classList.remove('dimmed');
      resetViz();
      return;
    }
    chips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    search(chip.dataset.query);
  });
});

async function search(query) {
  activeQueryEl.textContent = "";

  // Clear previous state
  document.querySelector('.fts-column')?.classList.remove('dimmed');
  document.querySelector('.semantic-column')?.classList.remove('dimmed');

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

      // Caption — tell the story: what you'd expect vs what happened
      const sem1 = data.semantic.results[0]?.filepath?.split("/").pop();
      const expected = expectedAnswer[query];
      const matchesExpected = (filepath) =>
        expected.files.some(f => filepath.toLowerCase().includes(f.toLowerCase()));
      const semFoundExpected = expected && data.semantic.results.slice(0, 3).some(r => matchesExpected(r.filepath));
      const ftsFoundExpected = expected && data.fts.results.slice(0, 3).some(r => matchesExpected(r.filepath));

      // Determine winner for viz
      const vizWinner = (ftsFoundExpected && !semFoundExpected) ? "fts"
        : (semFoundExpected && !ftsFoundExpected) ? "sem"
        : (ftsFoundExpected && semFoundExpected) ? "both" : null;

      // Update 3D viz
      highlightSearch(data.fts.results, data.semantic.results, query, vizWinner);
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

    // Verdict line + dim losing column
    const ftsCol = document.querySelector('.fts-column');
    const semCol = document.querySelector('.semantic-column');
    ftsCol.classList.remove('dimmed');
    semCol.classList.remove('dimmed');

    const ex = expectedAnswer[query];
    if (ex && data.semantic) {
      const matchEx = (fp) => ex.files.some(f => fp.toLowerCase().includes(f.toLowerCase()));
      const ftsWon = data.fts.results.slice(0, 3).some(r => matchEx(r.filepath));
      const semWon = data.semantic.results.slice(0, 3).some(r => matchEx(r.filepath));

      if (ftsWon && !semWon) {
        activeQueryEl.textContent = "KEYWORD SEARCH WINS";
        semCol.classList.add('dimmed');
      } else if (semWon && !ftsWon) {
        activeQueryEl.textContent = "EMBEDDINGS WIN";
        ftsCol.classList.add('dimmed');
      } else if (ftsWon && semWon) {
        activeQueryEl.textContent = "BOTH FIND IT";
      } else {
        activeQueryEl.textContent = `"${query}"`;
      }
    } else {
      activeQueryEl.textContent = `"${query}"`;
    }
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
        <span class="row-rank">${rank}</span>
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
