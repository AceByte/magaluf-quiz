const cardGrid = document.getElementById("cardGrid");
const chipRow = document.getElementById("chipRow");
const searchInput = document.getElementById("searchInput");
const categoryMeta = document.getElementById("categoryMeta");

const quizStart = document.getElementById("quizStart");
const quizPanel = document.getElementById("quizPanel");
const resultPanel = document.getElementById("resultPanel");
const startBtn = document.getElementById("startBtn");
const quizCategory = document.getElementById("quizCategory");
const quizDifficulty = document.getElementById("quizDifficulty");
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
let quizSettings = { topic: "alle", difficulty: "mix" };

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

function buildSuggestionMatches(query) {
  if (!query || !parsedData) return [];
  return window.KompendiumApp.buildSearchSuggestions(parsedData, query, 14);
}

function readQuizSettings() {
  return {
    topic: quizCategory ? quizCategory.value : "alle",
    difficulty: quizDifficulty ? quizDifficulty.value : "mix"
  };
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
    const suggestionMatches = buildSuggestionMatches(query);
    const aggregateSections = window.KompendiumApp.searchParsedContent(parsedData, query);
    cardGrid.innerHTML = "";

    if (!suggestionMatches.length && !aggregateSections.length) {
      cardGrid.innerHTML = "<p>Ingen resultater. Prøv et andet søgeord.</p>";
      return;
    }

    const suggestionsArticle = document.createElement("article");
    suggestionsArticle.className = "card";
    const suggestionListHtml = suggestionMatches
      .map((m) => `<li><a class=\"card-link\" href=\"${m.link}\">${m.title}</a>${m.summary ? `<br><span class=\"mini\">${m.summary}...</span>` : ""}</li>`)
      .join("");

    suggestionsArticle.innerHTML = `
      <h3><span>[Søgeforslag]</span> Resultater for: ${query}</h3>
      <p>Direkte forslag fra undersiderne.</p>
      <ul>${suggestionListHtml || "<li><span class=\"mini\">Ingen direkte forslag.</span></li>"}</ul>
    `;
    cardGrid.appendChild(suggestionsArticle);

    const allAboutArticle = document.createElement("article");
    allAboutArticle.className = "card";
    allAboutArticle.innerHTML = `
      <h3><span>[Alt om søgning]</span> Alt om: ${query}</h3>
      <p>Samlet side med alt relevant indhold for søgningen.</p>
      <p><a class="card-link" href="search.html?q=${encodeURIComponent(query)}">Åbn "Alt om søgning"</a></p>
      <p class="mini">Matcher i ${aggregateSections.length} hovedsektion(er).</p>
    `;
    cardGrid.appendChild(allAboutArticle);
    return;
  }

  const filtered = cards.filter((card) => {
    const typeOk = activeType === "alle" || card.type === activeType;
    const queryOk = query.length === 0 || cardMatches(card, query);
    return typeOk && queryOk;
  });

  // Calm default view: show only top-level categories until the user searches
  // or explicitly drills into a chip.
  const defaultView = query.length === 0 && activeType === "alle";
  const visibleCards = defaultView
    ? filtered.filter((card) => !card.parent).slice(0, 10)
    : filtered;

  cardGrid.innerHTML = "";

  if (!visibleCards.length) {
    cardGrid.innerHTML = "<p>Ingen resultater. Prøv et andet filter.</p>";
    return;
  }

  if (defaultView) {
    categoryMeta.textContent = `Viser ${visibleCards.length} hovedkategorier. Brug søgning for detaljer.`;
  } else {
    categoryMeta.textContent = `Viser ${visibleCards.length} resultater.`;
  }

  visibleCards.forEach((card, idx) => {
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

function refreshQuizQuestions() {
  if (!parsedData) return;
  quizSettings = readQuizSettings();
  quizQuestions = window.KompendiumApp.generateDynamicQuiz(parsedData, {
    count: 12,
    topic: quizSettings.topic,
    difficulty: quizSettings.difficulty
  });
  updateQuizMeta();

  if (!quizQuestions.length) {
    startBtn.disabled = true;
    startBtn.textContent = "Quiz utilgængelig";
  } else {
    startBtn.disabled = false;
    startBtn.textContent = "Start quiz";
  }
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
if (quizCategory) quizCategory.addEventListener("change", refreshQuizQuestions);
if (quizDifficulty) quizDifficulty.addEventListener("change", refreshQuizQuestions);

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

    categoryMeta.textContent = `Automatisk fundet: ${cards.length} kategorikort på tværs af ${parsedData.sections.length} hovedsektioner.`;

    renderChips();
    renderCards();
    refreshQuizQuestions();
  } catch (err) {
    categoryMeta.textContent = `Fejl ved indlæsning: ${err.message}`;
    cardGrid.innerHTML = "<p>Kunne ikke indlæse kompendiet. Kontroller at du kører via lokal server.</p>";
    startBtn.disabled = true;
    updateQuizMeta();
  }
})();
