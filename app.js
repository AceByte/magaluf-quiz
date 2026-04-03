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

  function textSnippet(text, query, fallbackLength) {
    const source = String(text || "").replace(/\s+/g, " ").trim();
    if (!source) return "";

    const q = String(query || "").trim();
    if (!q) return source.slice(0, fallbackLength || 180);

    const lowerSource = source.toLowerCase();
    const lowerQuery = q.toLowerCase();
    const idx = lowerSource.indexOf(lowerQuery);

    if (idx >= 0) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(source.length, idx + lowerQuery.length + 120);
      return (start > 0 ? "... " : "") + source.slice(start, end) + (end < source.length ? " ..." : "");
    }

    return source.slice(0, fallbackLength || 180) + (source.length > (fallbackLength || 180) ? " ..." : "");
  }

  function extractCocktailEntries(blockText) {
    const normalized = String(blockText || "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/([A-Z][A-Za-z0-9 '\/&-]{2,})\s+Glas:/g, "\n##$1\nGlas:");

    const chunks = normalized
      .split("\n##")
      .map(function (c) { return c.trim(); })
      .filter(Boolean);

    return chunks.map(function (chunk) {
      const firstLineBreak = chunk.indexOf("\n");
      const name = firstLineBreak >= 0 ? chunk.slice(0, firstLineBreak).trim() : chunk;
      const body = firstLineBreak >= 0 ? chunk.slice(firstLineBreak + 1).trim() : "";
      return {
        name: name,
        body: body,
        rawText: name + "\n" + body
      };
    });
  }

  function parseRecipeFields(body) {
    const labels = ["Glas", "Is", "Metode", "Garnish", "Ingredienser"];
    const re = /(Glas|Is|Metode|Garnish|Ingredienser):/g;
    const matches = [];
    let match;

    while ((match = re.exec(body || "")) !== null) {
      matches.push({ label: match[1], start: match.index, marker: match[0] });
    }

    if (!matches.length) return null;

    const fields = {};
    for (let i = 0; i < matches.length; i += 1) {
      const current = matches[i];
      const end = i < matches.length - 1 ? matches[i + 1].start : (body || "").length;
      fields[current.label] = (body || "")
        .slice(current.start + current.marker.length, end)
        .trim()
        .replace(/\s+/g, " ");
    }

    labels.forEach(function (label) {
      if (!fields[label]) fields[label] = "";
    });

    return fields;
  }

  function isCocktailRecipeBlock(block) {
    const txt = block && block.text ? block.text : "";
    return /Cocktails?/i.test(block && block.title ? block.title : "") && /Glas:/i.test(txt) && /Ingredienser:/i.test(txt);
  }

  function collectQuizTags(parts) {
    const text = parts
      .map(function (part) { return String(part || ""); })
      .join(" ")
      .toLowerCase();
    const tags = new Set();
    let alcoholMatch = false;

    if (/cocktail/i.test(text)) tags.add("cocktails");
    if (/udstyr/i.test(text)) tags.add("udstyr");
    if (/glas/i.test(text)) tags.add("glas");
    if (/garnish|garniture/i.test(text)) tags.add("garnish");
    if (/flair/i.test(text)) tags.add("flair");
    if (/spiritus/i.test(text)) tags.add("spiritus");

    ALCOHOL_KEYWORDS.forEach(function (keyword) {
      if (text.indexOf(keyword) >= 0) {
        tags.add(keyword);
        alcoholMatch = true;
      }
    });

    if (alcoholMatch) tags.add("spiritus");

    if (!tags.size) tags.add("andet");
    return Array.from(tags);
  }

  function normalizeQuizSettings(questionCountOrOptions) {
    if (typeof questionCountOrOptions === "number") {
      return { count: questionCountOrOptions, topic: "alle", difficulty: "mix" };
    }

    const options = questionCountOrOptions || {};
    return {
      count: Number(options.count || options.questionCount || 12),
      topic: String(options.topic || options.category || "alle").toLowerCase(),
      difficulty: String(options.difficulty || "mix").toLowerCase()
    };
  }

  function quizDifficultyLevel(name) {
    if (name === "let") return 1;
    if (name === "mellem") return 2;
    if (name === "svær") return 3;
    return 0;
  }

  function quizTopicMatches(question, topic) {
    if (!topic || topic === "alle" || topic === "mix") return true;
    if (!question || !question.tags) return false;
    return question.tags.indexOf(topic) >= 0;
  }

  function quizDifficultyMatches(question, difficulty) {
    const target = quizDifficultyLevel(difficulty);
    if (!target) return true;
    return question && question.difficulty === target;
  }

  function searchParsedContent(parsed, query) {
    if (!parsed || !parsed.sections) return [];
    const result = [];

    parsed.sections.forEach(function (section) {
      const sectionText = [section.title, section.introText].join(" ");
      const sectionHit = textMatchesQuery(sectionText, query);

      const blockHits = [];

      section.blocks.forEach(function (block) {
        if (isCocktailRecipeBlock(block)) {
          const entries = extractCocktailEntries(block.text);
          const matchedEntries = entries.filter(function (entry) {
            return textMatchesQuery(entry.name + " " + entry.body, query);
          });

          if (matchedEntries.length) {
            blockHits.push({
              title: block.title,
              slug: block.slug,
              parent: block.parent,
              matchedRecipes: matchedEntries,
              text: matchedEntries.map(function (e) { return e.rawText; }).join("\n\n"),
              snippet: textSnippet(matchedEntries.map(function (e) { return e.rawText; }).join("\n\n"), query, 220)
            });
          }
          return;
        }

        const blockText = [block.title, block.text || ""].join(" ");
        if (textMatchesQuery(blockText, query)) {
          blockHits.push({
            title: block.title,
            slug: block.slug,
            parent: block.parent,
            text: block.text,
            snippet: textSnippet(blockText, query, 220)
          });
        }
      });

      if (sectionHit || blockHits.length) {
        result.push({
          title: section.title,
          slug: section.slug,
          introText: sectionHit ? textSnippet(section.introText, query, 220) : "",
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
        if (block.matchedRecipes && block.matchedRecipes.length) {
          block.matchedRecipes.forEach(function (recipe) {
            items.push({
              title: recipe.name + " (" + block.title + ")",
              summary: firstSentence(recipe.body),
              link: "section.html?slug=" + encodeURIComponent(section.slug) + "#" + encodeURIComponent(block.slug)
            });
          });
          return;
        }

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

  function generateDynamicQuiz(parsed, questionCountOrOptions) {
    const settings = normalizeQuizSettings(questionCountOrOptions);
    const wanted = Math.max(6, Math.min(settings.count || 12, 20));
    const cocktailEntries = [];
    const questionBank = [];

    parsed.sections.forEach(function (section) {
      section.blocks.forEach(function (block) {
        if (!isCocktailRecipeBlock(block)) return;

        extractCocktailEntries(block.text).forEach(function (entry) {
          const fields = parseRecipeFields(entry.body);
          if (!fields) return;

          cocktailEntries.push({
            name: entry.name,
            title: block.title,
            section: section.title,
            fields: fields
          });
        });
      });
    });

    const allTitles = Array.from(new Set(parsed.sections.reduce(function (acc, section) {
      acc.push(section.title);
      section.blocks.forEach(function (block) { acc.push(block.title); });
      return acc;
    }, [])));
    const allNames = Array.from(new Set(cocktailEntries.map(function (e) { return e.name; })));
    const allMethods = Array.from(new Set(cocktailEntries.map(function (e) { return e.fields.Metode; }).filter(Boolean)));
    const allGlasses = Array.from(new Set(cocktailEntries.map(function (e) { return e.fields.Glas; }).filter(Boolean)));
    const allGarnishes = Array.from(new Set(cocktailEntries.map(function (e) { return e.fields.Garnish; }).filter(Boolean)));

    function addQuestion(question) {
      if (!question || !question.q || !question.options || question.options.length < 2) return;
      const normalizedOptions = Array.from(new Set(question.options)).filter(Boolean);
      if (normalizedOptions.length < 2) return;
      const answerIndex = normalizedOptions.indexOf(question.answerValue);
      if (answerIndex < 0) return;
      questionBank.push({
        q: question.q,
        options: normalizedOptions,
        answer: answerIndex,
        explanation: question.explanation,
        tags: Array.from(new Set(question.tags || [])),
        difficulty: question.difficulty || 1
      });
    }

    cocktailEntries.forEach(function (entry) {
      const tags = collectQuizTags([entry.name, entry.title, entry.section, entry.fields.Glas, entry.fields.Metode, entry.fields.Garnish, entry.fields.Ingredienser]);
      if (tags.indexOf("cocktails") < 0) tags.push("cocktails");

      if (entry.fields.Metode) {
        addQuestion({
          q: "Hvilken metode bruges til " + entry.name + "?",
          options: sampleOptions(entry.fields.Metode, allMethods, 4),
          answerValue: entry.fields.Metode,
          explanation: entry.name + " står i kompendiet med metoden: " + entry.fields.Metode + ".",
          tags: tags.slice(),
          difficulty: 1
        });
      }

      if (entry.fields.Glas) {
        addQuestion({
          q: "Hvilket glas bruges typisk til " + entry.name + "?",
          options: sampleOptions(entry.fields.Glas, allGlasses, 4),
          answerValue: entry.fields.Glas,
          explanation: entry.name + " står med glas: " + entry.fields.Glas + ".",
          tags: tags.slice(),
          difficulty: 1
        });
      }

      if (entry.fields.Ingredienser) {
        const ingredients = entry.fields.Ingredienser
          .split(/,\s*/)
          .map(function (i) { return i.trim(); })
          .filter(Boolean);

        const clue = ingredients.slice(0, 3).join(", ");
        if (clue) {
          addQuestion({
            q: "Hvilken cocktail passer bedst til disse ingredienser: " + clue + "?",
            options: sampleOptions(entry.name, allNames, 4),
            answerValue: entry.name,
            explanation: "Ingredienslisten matcher " + entry.name + ".",
            tags: tags.slice(),
            difficulty: ingredients.length > 4 ? 3 : 2
          });
        }
      }

      if (entry.fields.Garnish) {
        addQuestion({
          q: "Hvilken garnish passer til " + entry.name + "?",
          options: sampleOptions(entry.fields.Garnish, allGarnishes, 4),
          answerValue: entry.fields.Garnish,
          explanation: entry.name + " står med garnish: " + entry.fields.Garnish + ".",
          tags: tags.slice(),
          difficulty: 2
        });
      }
    });

    parsed.sections.forEach(function (section) {
      if (section.introText) {
        const sectionTags = collectQuizTags([section.title, section.introText]);
        sectionTags.push(tagForItem(section.title, section.title));

        addQuestion({
          q: "Hvilket emne passer bedst til denne beskrivelse? \"" + firstSentence(section.introText) + "\"",
          options: sampleOptions(section.title, allTitles, 4),
          answerValue: section.title,
          explanation: "Beskrivelsen kommer fra sektionen " + section.title + ".",
          tags: sectionTags,
          difficulty: 1
        });
      }

      section.blocks.forEach(function (block) {
        if (isCocktailRecipeBlock(block)) return;
        const blockTags = collectQuizTags([block.title, section.title, block.text]);
        blockTags.push(tagForItem(block.title, section.title));

        addQuestion({
          q: "Hvilken undersektion passer bedst til denne beskrivelse? \"" + firstSentence(block.text) + "\"",
          options: sampleOptions(block.title, allTitles, 4),
          answerValue: block.title,
          explanation: "Det er en undersektion under " + section.title + ".",
          tags: blockTags,
          difficulty: block.text.length > 220 ? 2 : 1
        });
      });
    });

    const exactPool = questionBank.filter(function (question) {
      return quizTopicMatches(question, settings.topic) && quizDifficultyMatches(question, settings.difficulty);
    });
    const topicPool = questionBank.filter(function (question) {
      return quizTopicMatches(question, settings.topic);
    });
    const difficultyPool = questionBank.filter(function (question) {
      return quizDifficultyMatches(question, settings.difficulty);
    });

    const pool = exactPool.length >= wanted ? exactPool : topicPool.length >= wanted ? topicPool : difficultyPool.length >= wanted ? difficultyPool : questionBank;
    const questions = pool.slice();

    // Shuffle and trim to requested size.
    for (let i = questions.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = questions[i];
      questions[i] = questions[j];
      questions[j] = tmp;
    }

    return questions.slice(0, wanted);
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
