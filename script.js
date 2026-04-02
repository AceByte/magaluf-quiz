const cardGrid = document.getElementById("cardGrid");
const chipRow = document.getElementById("chipRow");
const searchInput = document.getElementById("searchInput");
const categoryMeta = document.getElementById("categoryMeta");

const quizStart = document.getElementById("quizStart");
const quizPanel = document.getElementById("quizPanel");
const resultPanel = document.getElementById("resultPanel");
const startBtn = document.getElementById("startBtn");
const questionText = document.getElementById("questionText");
const answerList = document.getElementById("answerList");
const nextBtn = document.getElementById("nextBtn");
const explanation = document.getElementById("explanation");
const resultText = document.getElementById("resultText");
const restartBtn = document.getElementById("restartBtn");
const progressText = document.getElementById("progressText");
const scoreText = document.getElementById("scoreText");
const bestText = document.getElementById("bestText");
const progressFill = document.getElementById("progressFill");

let activeType = "alle";
let qIndex = 0;
let score = 0;
let answered = false;
let cards = [];
let quizQuestions = [];
let parsedData = null;

function bestScore() {
  return Number(localStorage.getItem("bartender-best-score") || 0);
}

function setBestScore(value) {
  localStorage.setItem("bartender-best-score", String(value));
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function switchPanel(panel) {
  [quizStart, quizPanel, resultPanel].forEach((el) => el.classList.remove("active"));
  panel.classList.add("active");
}

function cardMatches(card, query) {
  const all = [card.title, card.summary, card.type, card.parent || "", (card.bullets || []).join(" ")]
    .join(" ")
    .toLowerCase();
  return all.includes(query);
}

function buildAggregateMatches(query) {
  if (!parsedData || !query) return [];

  const matches = [];

  parsedData.sections.forEach((section) => {
    const inSection = [section.title, section.introText].join(" ").toLowerCase().includes(query);
    if (inSection) {
      matches.push({
        title: section.title,
        summary: (section.introText || "").slice(0, 220),
        link: `section.html?slug=${encodeURIComponent(section.slug)}`
      });
    }

    section.blocks.forEach((block) => {
      const text = [block.title, block.text || ""].join(" ").toLowerCase();
      if (text.includes(query)) {
        const summary = (block.text || "").replace(/\s+/g, " ").slice(0, 220);
        matches.push({
          title: `${block.title}${block.parent ? ` (${block.parent})` : ""}`,
          summary: summary,
          link: `section.html?slug=${encodeURIComponent(section.slug)}#${encodeURIComponent(block.slug)}`
        });
      }
    });
  });

  const seen = new Set();
  return matches.filter((m) => {
    const key = `${m.title}|${m.link}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderChips() {
  const types = ["alle", ...new Set(cards.map((c) => c.type))];
  chipRow.innerHTML = "";

  types.forEach((type) => {
    const btn = document.createElement("button");
    btn.className = `chip ${type === activeType ? "active" : ""}`;
    btn.textContent = capitalize(type);
    btn.addEventListener("click", () => {
      activeType = type;
      renderChips();
      renderCards();
    });
    chipRow.appendChild(btn);
  });
}

function renderCards() {
  const query = searchInput.value.trim().toLowerCase();

  if (query.length > 0) {
    const aggregateMatches = buildAggregateMatches(query);
    cardGrid.innerHTML = "";

    if (!aggregateMatches.length) {
      cardGrid.innerHTML = "<p>Ingen resultater. Prøv et andet søgeord.</p>";
      return;
    }

    const article = document.createElement("article");
    article.className = "card";

    const listHtml = aggregateMatches
      .map((m) => `<li><a class=\"card-link\" href=\"${m.link}\">${m.title}</a>${m.summary ? `<br><span class=\"mini\">${m.summary}...</span>` : ""}</li>`)
      .join("");

    article.innerHTML = `
      <h3><span>[Søgning]</span> Alt om: ${query}</h3>
      <p>Samlet visning af alt relevant indhold for søgningen.</p>
      <ul>${listHtml}</ul>
    `;

    cardGrid.appendChild(article);
    return;
  }

  const filtered = cards.filter((card) => {
    const typeOk = activeType === "alle" || card.type === activeType;
    const queryOk = query.length === 0 || cardMatches(card, query);
    return typeOk && queryOk;
  });

  cardGrid.innerHTML = "";

  if (!filtered.length) {
    cardGrid.innerHTML = "<p>Ingen resultater. Prøv et andet filter.</p>";
    return;
  }

  filtered.forEach((card, idx) => {
    const article = document.createElement("article");
    article.className = "card";
    article.style.animationDelay = `${idx * 40}ms`;

    const bullets = (card.bullets || []).slice(0, 4);
    const listHtml = bullets.length
      ? `<ul>${bullets.map((point) => `<li>${point}</li>`).join("")}</ul>`
      : "";

    article.innerHTML = `
      <h3><span>[${capitalize(card.type)}]</span> ${card.title}</h3>
      <p>${card.summary}</p>
      ${card.parent ? `<p class="mini">Fra: ${card.parent}</p>` : ""}
      ${listHtml}
      <p><a class="card-link" href="${card.link}">Åbn underside</a></p>
    `;

    cardGrid.appendChild(article);
  });
}

function updateQuizMeta() {
  if (!quizQuestions.length) {
    progressText.textContent = "Spørgsmål 0/0";
    scoreText.textContent = "Point: 0";
    bestText.textContent = `Bedste: ${bestScore()}`;
    progressFill.style.width = "0%";
    return;
  }

  progressText.textContent = `Spørgsmål ${Math.min(qIndex + 1, quizQuestions.length)}/${quizQuestions.length}`;
  scoreText.textContent = `Point: ${score}`;
  bestText.textContent = `Bedste: ${bestScore()}`;
  progressFill.style.width = `${(qIndex / quizQuestions.length) * 100}%`;
}

function showQuestion() {
  answered = false;
  nextBtn.disabled = true;
  explanation.textContent = "";

  const current = quizQuestions[qIndex];
  questionText.textContent = current.q;
  answerList.innerHTML = "";

  current.options.forEach((option, i) => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.textContent = option;
    btn.addEventListener("click", () => selectAnswer(i));
    answerList.appendChild(btn);
  });

  updateQuizMeta();
}

function selectAnswer(index) {
  if (answered) return;
  answered = true;

  const current = quizQuestions[qIndex];
  const buttons = [...answerList.querySelectorAll("button")];

  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (i === current.answer) btn.classList.add("correct");
    if (i === index && i !== current.answer) btn.classList.add("wrong");
  });

  if (index === current.answer) {
    score += 1;
    scoreText.textContent = `Point: ${score}`;
  }

  explanation.textContent = current.explanation;
  nextBtn.disabled = false;
}

function finishQuiz() {
  const prevBest = bestScore();
  if (score > prevBest) setBestScore(score);

  const pct = Math.round((score / quizQuestions.length) * 100);
  resultText.textContent = `Du fik ${score} / ${quizQuestions.length} (${pct}%).`;
  bestText.textContent = `Bedste: ${bestScore()}`;
  progressFill.style.width = "100%";
  progressText.textContent = `Spørgsmål ${quizQuestions.length}/${quizQuestions.length}`;
  switchPanel(resultPanel);
}

function startQuiz() {
  if (!quizQuestions.length) return;
  qIndex = 0;
  score = 0;
  switchPanel(quizPanel);
  showQuestion();
}

startBtn.addEventListener("click", startQuiz);
restartBtn.addEventListener("click", startQuiz);

nextBtn.addEventListener("click", () => {
  qIndex += 1;
  if (qIndex >= quizQuestions.length) {
    finishQuiz();
    return;
  }
  showQuestion();
});

searchInput.addEventListener("input", renderCards);

(async function init() {
  try {
    const text = await window.KompendiumApp.fetchKompendium("./kompendium.txt");
    parsedData = window.KompendiumApp.parseKompendium(text);
    cards = window.KompendiumApp.buildKnowledgeCards(parsedData);
    quizQuestions = window.KompendiumApp.generateDynamicQuiz(parsedData, 12);

    categoryMeta.textContent = `Automatisk fundet: ${cards.length} kategorikort på tværs af ${parsedData.sections.length} hovedsektioner.`;

    renderChips();
    renderCards();
    updateQuizMeta();

    if (!quizQuestions.length) {
      startBtn.disabled = true;
      startBtn.textContent = "Quiz utilgængelig";
    }
  } catch (err) {
    categoryMeta.textContent = `Fejl ved indlæsning: ${err.message}`;
    cardGrid.innerHTML = "<p>Kunne ikke indlæse kompendiet. Kontroller at du kører via lokal server.</p>";
    startBtn.disabled = true;
    updateQuizMeta();
  }
})();
