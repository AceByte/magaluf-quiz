(function () {
  const ALCOHOL_KEYWORDS = [
    "vodka", "gin", "rom", "whisky", "whiskey", "tequila", "mezcal",
    "cognac", "brandy", "armagnac", "grappa", "likor", "vermouth",
    "cachaca", "bourbon", "rye", "scotch"
  ];

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "sektion";
  }

  function firstSentence(text) {
    const t = (text || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    const m = t.match(/(.+?[.!?])\s/);
    return (m ? m[1] : t.slice(0, 180)).trim();
  }

  function sanitizeLine(line) {
    return line.replace(/[\u0000-\u001F]/g, "").trim();
  }

  function isUpperHeading(line) {
    if (!line || line.length > 80) return false;
    if (/[:.!?]$/.test(line)) return false;
    if (!/[A-Z]/.test(line)) return false;
    return /^[A-Z0-9 \-/&]+$/.test(line);
  }

  function isLikelySubHeading(line, prev, next) {
    if (!line || line.length > 96) return false;
    if (/[:.!?]$/.test(line)) return false;
    if (isUpperHeading(line)) return false;
    // Support Danish letters and common heading punctuation like commas/parentheses.
    if (!/^[\p{Lu}][\p{L}\p{N}\-\/ '&(),.+]+$/u.test(line)) return false;
    const words = line.split(/\s+/).length;
    if (words > 12) return false;

    // Cocktail category headings often appear without blank separators.
    if (/Cocktails?/i.test(line) && words <= 5) return true;

    return (!prev || prev.trim() === "") || (!next || next.trim() === "");
  }

  function ensureSection(sections, title) {
    let section = sections[sections.length - 1];
    if (!section || section.title !== title) {
      section = { title: title, slug: slugify(title), intro: [], blocks: [] };
      sections.push(section);
    }
    return section;
  }

  function parseKompendium(text) {
    const rawLines = String(text || "").split(/\r?\n/);
    const lines = rawLines.map(sanitizeLine);
    const sections = [];

    let currentSection = ensureSection(sections, "Intro");
    let currentBlock = null;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const prev = i > 0 ? lines[i - 1] : "";
      const next = i < lines.length - 1 ? lines[i + 1] : "";

      if (!line) {
        if (currentBlock) currentBlock.text += "\n\n";
        else currentSection.intro.push("");
        continue;
      }

      if (isUpperHeading(line)) {
        currentSection = ensureSection(sections, line);
        currentBlock = null;
        continue;
      }

      if (isLikelySubHeading(line, prev, next)) {
        currentBlock = {
          title: line,
          slug: slugify(line),
          text: "",
          parent: currentSection.title
        };
        currentSection.blocks.push(currentBlock);
        continue;
      }

      if (currentBlock) currentBlock.text += (currentBlock.text ? "\n" : "") + line;
      else currentSection.intro.push(line);
    }

    sections.forEach(function (section) {
      section.introText = section.intro.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      delete section.intro;
      section.blocks = section.blocks.map(function (b) {
        return {
          title: b.title,
          slug: b.slug,
          text: b.text
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim(),
          parent: b.parent
        };
      });
    });

    return { sections: sections, fullText: text };
  }

  function tagForItem(title, parent) {
    const t = (title + " " + parent).toLowerCase();
    if (t.indexOf("udstyr") >= 0) return "udstyr";
    if (t.indexOf("glas") >= 0) return "glas";
    if (t.indexOf("garnish") >= 0 || t.indexOf(" is") >= 0) return "garnish";
    if (t.indexOf("flair") >= 0) return "flair";
    if (t.indexOf("cocktail") >= 0) return "cocktails";
    for (let i = 0; i < ALCOHOL_KEYWORDS.length; i += 1) {
      if (t.indexOf(ALCOHOL_KEYWORDS[i]) >= 0) return ALCOHOL_KEYWORDS[i];
    }
    if (t.indexOf("spiritus") >= 0) return "spiritus";
    return "andet";
  }

  function buildKnowledgeCards(parsed) {
    const cards = [];
    parsed.sections.forEach(function (section) {
      cards.push({
        type: tagForItem(section.title, section.title),
        title: section.title,
        summary: firstSentence(section.introText) || "Hovedsektion fra kompendiet.",
        bullets: section.blocks.slice(0, 4).map(function (b) { return b.title; }),
        link: "section.html?slug=" + encodeURIComponent(section.slug),
        parent: ""
      });

      section.blocks.forEach(function (block) {
        cards.push({
          type: tagForItem(block.title, section.title),
          title: block.title,
          summary: firstSentence(block.text) || ("Undersektion under " + section.title + "."),
          bullets: [],
          link: "section.html?slug=" + encodeURIComponent(section.slug) + "#" + encodeURIComponent(block.slug),
          parent: section.title
        });
      });
    });
    return cards;
  }

  function sampleOptions(correct, pool, size) {
    const filtered = pool.filter(function (p) { return p !== correct; });
    const options = [];
    while (options.length < size - 1 && filtered.length) {
      const idx = Math.floor(Math.random() * filtered.length);
      options.push(filtered.splice(idx, 1)[0]);
    }
    options.push(correct);
    for (let i = options.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = options[i];
      options[i] = options[j];
      options[j] = tmp;
    }
    return options;
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function textMatchesQuery(text, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return false;

    const hay = String(text || "").toLowerCase();

    // Phrase queries use contains matching.
    if (q.indexOf(" ") >= 0) {
      return hay.indexOf(q) >= 0;
    }

    // Single-word queries use whole-word style matching to avoid false positives
    // like searching "gin" matching "branding".
    const rx = new RegExp("(^|[^\\p{L}\\p{N}])" + escapeRegExp(q) + "([^\\p{L}\\p{N}]|$)", "u");
    return rx.test(hay);
  }

  function searchParsedContent(parsed, query) {
    if (!parsed || !parsed.sections) return [];
    const result = [];

    parsed.sections.forEach(function (section) {
      const sectionText = [section.title, section.introText].join(" ");
      const sectionHit = textMatchesQuery(sectionText, query);

      const blockHits = section.blocks.filter(function (block) {
        const blockText = [block.title, block.text || ""].join(" ");
        return textMatchesQuery(blockText, query);
      });

      if (sectionHit || blockHits.length) {
        result.push({
          title: section.title,
          slug: section.slug,
          introText: sectionHit ? section.introText : "",
          blocks: blockHits
        });
      }
    });

    return result;
  }

  function buildSearchSuggestions(parsed, query, maxItems) {
    const grouped = searchParsedContent(parsed, query);
    const items = [];

    grouped.forEach(function (section) {
      if (section.introText) {
        items.push({
          title: section.title,
          summary: firstSentence(section.introText),
          link: "section.html?slug=" + encodeURIComponent(section.slug)
        });
      }

      section.blocks.forEach(function (block) {
        items.push({
          title: block.title + (block.parent ? " (" + block.parent + ")" : ""),
          summary: firstSentence(block.text),
          link: "section.html?slug=" + encodeURIComponent(section.slug) + "#" + encodeURIComponent(block.slug)
        });
      });
    });

    const seen = new Set();
    const deduped = items.filter(function (item) {
      const key = item.title + "|" + item.link;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (typeof maxItems === "number" && maxItems > 0) {
      return deduped.slice(0, maxItems);
    }
    return deduped;
  }

  function generateDynamicQuiz(parsed, questionCount) {
    const candidates = [];
    parsed.sections.forEach(function (section) {
      if (section.introText) {
        candidates.push({
          answer: section.title,
          clue: firstSentence(section.introText),
          explanation: "Beskrivelsen kommer fra sektionen " + section.title + "."
        });
      }
      section.blocks.forEach(function (block) {
        if (block.text) {
          candidates.push({
            answer: block.title,
            clue: firstSentence(block.text),
            explanation: "Beskrivelsen matcher undersektionen " + block.title + "."
          });
        }
      });
    });

    const allTitles = Array.from(new Set(candidates.map(function (c) { return c.answer; })));
    const wanted = Math.min(questionCount, candidates.length);
    const quiz = [];
    const used = new Set();

    while (quiz.length < wanted) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const key = pick.answer + "|" + pick.clue;
      if (used.has(key)) continue;
      used.add(key);

      const options = sampleOptions(pick.answer, allTitles, 4);
      quiz.push({
        q: "Hvilket emne passer bedst til denne beskrivelse? \"" + pick.clue + "\"",
        options: options,
        answer: options.indexOf(pick.answer),
        explanation: pick.explanation
      });
    }

    return quiz;
  }

  async function fetchKompendium(path) {
    const response = await fetch(path || "./kompendium.txt");
    if (!response.ok) throw new Error("Kunne ikke laese kompendium.txt");
    return response.text();
  }

  window.KompendiumApp = {
    slugify: slugify,
    parseKompendium: parseKompendium,
    fetchKompendium: fetchKompendium,
    buildKnowledgeCards: buildKnowledgeCards,
    generateDynamicQuiz: generateDynamicQuiz,
    textMatchesQuery: textMatchesQuery,
    searchParsedContent: searchParsedContent,
    buildSearchSuggestions: buildSearchSuggestions
  };
})();
