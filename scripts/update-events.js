const fs = require("fs");
const cheerio = require("cheerio");

const MONTHS = {
  "gennaio": "01",
  "febbraio": "02",
  "marzo": "03",
  "aprile": "04",
  "maggio": "05",
  "giugno": "06",
  "luglio": "07",
  "agosto": "08",
  "settembre": "09",
  "ottobre": "10",
  "novembre": "11",
  "dicembre": "12"
};

const WEEKDAYS = [
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
  "domenica"
];

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function eventKey(item) {
  return [
    item.date,
    item.category,
    item.title,
    item.time,
    item.place
  ].join("|").toLowerCase();
}

function addEvent(events, item) {
  if (!item) {
    return;
  }

  if (!item.date) {
    return;
  }

  if (!item.title) {
    return;
  }

  const key = eventKey(item);

  for (let i = 0; i < events.length; i++) {
    if (eventKey(events[i]) === key) {
      return;
    }
  }

  events.push(item);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 LivingArenaEventsBot/1.0"
    }
  });

  if (!response.ok) {
    throw new Error("Errore fetch " + url + " status " + response.status);
  }

  return await response.text();
}

function parseArenaCalendar(html, events) {
  const $ = cheerio.load(html);
  const text = $("body").text();

  const lines = text
    .split("\n")
    .map(cleanText)
    .filter(Boolean);

  let currentMonth = "";
  let currentYear = "";

  function isMonthYear(value) {
    return cleanText(value)
      .toLowerCase()
      .match(/^(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(20\d{2})$/);
  }

  function isWeekdayDay(value) {
    const lower = cleanText(value).toLowerCase();

    for (let w = 0; w < WEEKDAYS.length; w++) {
      const dayMatch = lower.match(new RegExp("^" + WEEKDAYS[w] + "\\s+(\\d{1,2})$"));

      if (dayMatch) {
        return pad2(dayMatch[1]);
      }
    }

    return "";
  }

  function isCategory(value) {
    return /^(Opera|Concerto|Balletto)$/i.test(cleanText(value));
  }

  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();

    const monthYear = isMonthYear(lineLower);
    if (monthYear) {
      currentMonth = MONTHS[monthYear[1]];
      currentYear = monthYear[2];
      continue;
    }

    const time = lines[i];

    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      continue;
    }

    const place = lines[i - 1] || "";

    if (!/Arena di Verona/i.test(place)) {
      continue;
    }

    const title = lines[i - 2] || "";

    if (!title) {
      continue;
    }

    if (isCategory(title)) {
      continue;
    }

    let foundDay = "";
    let foundCategory = "";
    let foundMonth = currentMonth;
    let foundYear = currentYear;

    for (let j = i - 3; j >= Math.max(0, i - 28); j--) {
      const current = lines[j];
      const lower = current.toLowerCase();

      const my = isMonthYear(lower);
      if (my) {
        foundMonth = MONTHS[my[1]];
        foundYear = my[2];
      }

      const day = isWeekdayDay(current);
      if (day) {
        foundDay = day;
      }

      if (isCategory(current)) {
        foundCategory = current.toLowerCase();
      }

      if (foundDay) {
        if (foundMonth) {
          if (foundYear) {
            break;
          }
        }
      }
    }

    if (!foundDay) {
      for (let j = i + 1; j < Math.min(i + 28, lines.length); j++) {
        const current = lines[j];
        const lower = current.toLowerCase();

        const my = isMonthYear(lower);
        if (my) {
          foundMonth = MONTHS[my[1]];
          foundYear = my[2];
        }

        const day = isWeekdayDay(current);
        if (day) {
          foundDay = day;
        }

        if (isCategory(current)) {
          foundCategory = current.toLowerCase();
        }

        if (foundDay) {
          if (foundMonth) {
            if (foundYear) {
              break;
            }
          }
        }
      }
    }

    if (!foundDay) {
      continue;
    }

    if (!foundMonth) {
      continue;
    }

    if (!foundYear) {
      continue;
    }

    let category = "concert";

    if (foundCategory === "opera") {
      category = "opera";
    }

    if (foundCategory === "balletto") {
      category = "concert";
    }

    addEvent(events, {
      date: foundYear + "-" + foundMonth + "-" + foundDay,
      category: category,
      title: title,
      time: time,
      place: "Arena di Verona",
      url: "https://www.arena.it/calendario/"
    });
  }
}

function parseDateRange(value, year) {
  const cleaned = cleanText(value).toLowerCase();
  const match = cleaned.match(/(\d{1,2})(?:-(\d{1,2}))?\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)/);

  if (!match) {
    return [];
  }

  const startDay = parseInt(match[1], 10);
  let endDay = startDay;

  if (match[2]) {
    endDay = parseInt(match[2], 10);
  }

  const month = MONTHS[match[3]];
  const dates = [];

  for (let d = startDay; d <= endDay; d++) {
    dates.push(year + "-" + month + "-" + pad2(d));
  }

  return dates;
}

function parseVeronafiereCalendar(html, year, events) {
  const $ = cheerio.load(html);
  const bodyText = $("body").text();

  const lines = bodyText
    .split("\n")
    .map(cleanText)
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const dates = parseDateRange(lines[i], year);

    if (dates.length === 0) {
      continue;
    }

    const title = lines[i + 1] || "";
    const subtitle = lines[i + 2] || "";

    if (!title) {
      continue;
    }

    if (MONTHS[title.toLowerCase()]) {
      continue;
    }

    let fullTitle = title;

    if (subtitle) {
      if (!parseDateRange(subtitle, year).length) {
        if (!MONTHS[subtitle.toLowerCase()]) {
          fullTitle = title + " - " + subtitle;
        }
      }
    }

    for (let d = 0; d < dates.length; d++) {
      addEvent(events, {
        date: dates[d],
        category: "fair",
        title: fullTitle,
        time: "",
        place: "Veronafiere",
        url: "https://www.veronafiere.it/calendario-fiere/"
      });
    }
  }
}

async function main() {
  const events = [];

  const arenaUrls = [
    "https://www.arena.it/calendario/",
    "https://www.arena.it/arena-opera-festival/calendario/"
  ];

  for (let i = 0; i < arenaUrls.length; i++) {
    try {
      const html = await fetchText(arenaUrls[i]);
      parseArenaCalendar(html, events);
    } catch (error) {
      console.log("Errore Arena:", error.message);
    }
  }

  const years = [
    new Date().getFullYear(),
    new Date().getFullYear() + 1
  ];

  for (let i = 0; i < years.length; i++) {
    try {
      const url = "https://www.veronafiere.it/calendario-fiere/calendario-italia-" + years[i] + "/";
      const html = await fetchText(url);
      parseVeronafiereCalendar(html, years[i], events);
    } catch (error) {
      console.log("Errore Veronafiere:", error.message);
    }
  }

  events.sort(function (a, b) {
    if (a.date === b.date) {
      return String(a.time || "").localeCompare(String(b.time || ""));
    }

    return String(a.date).localeCompare(String(b.date));
  });

  const output = {
    updated_at: new Date().toISOString(),
    sources: [
      "https://www.arena.it/calendario/",
      "https://www.arena.it/arena-opera-festival/calendario/",
      "https://www.veronafiere.it/calendario-fiere/"
    ],
    events: events
  };

  fs.writeFileSync("events.json", JSON.stringify(output, null, 2), "utf8");

  console.log("events.json aggiornato. Eventi trovati:", events.length);
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
