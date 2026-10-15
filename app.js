
"use strict";

/*
 * BeautyMatch
 * Comparación A/B + puntuación Elo + ranking + exportación CSV.
 * Los nombres incluidos son ejemplos genéricos.
 */

const CATALOG = {
  skincare: [
    "Limpiador facial suave",
    "Sérum hidratante",
    "Crema hidratante",
    "Protector solar facial",
    "Sérum de vitamina C",
    "Crema con ceramidas",
    "Agua micelar",
    "Mascarilla hidratante",
    "Bálsamo labial",
    "Exfoliante facial"
  ],

  maquillaje: [
    "Base de maquillaje",
    "Corrector",
    "Máscara de pestañas",
    "Rubor",
    "Labial hidratante",
    "Polvo compacto",
    "Delineador",
    "Iluminador",
    "Tinte de labios",
    "Fijador de maquillaje"
  ],

  cabello: [
    "Champú hidratante",
    "Acondicionador",
    "Mascarilla capilar",
    "Aceite capilar",
    "Crema para rizos",
    "Protector térmico",
    "Sérum antiencrespamiento",
    "Champú para cuero cabelludo",
    "Acondicionador sin enjuague",
    "Tratamiento reparador"
  ],

  rutinas: [
    "Rutina facial básica",
    "Rutina de hidratación",
    "Rutina de mañana",
    "Rutina de noche",
    "Rutina para cabello rizado",
    "Rutina de cuidado corporal",
    "Rutina minimalista",
    "Rutina de maquillaje diario",
    "Rutina de protección solar",
    "Rutina de cuidado de labios"
  ],

  servicios: [
    "Manicura",
    "Corte de cabello",
    "Peinado",
    "Limpieza facial estética",
    "Diseño de cejas",
    "Maquillaje social",
    "Barbería",
    "Tratamiento capilar",
    "Depilación con cera",
    "Peinado para evento"
  ]
};

const SEGMENTS = {
  general: "Preferencias generales",
  economico: "Presupuesto ajustado",
  premium: "Interés en opciones premium",
  sensible: "Suavidad y sencillez",
  practico: "Facilidad de uso"
};

const CONTEXTS = {
  precioCalidad: "¿Cuál prefieres por su relación precio-calidad?",
  favorita: "¿Cuál de estas opciones te gusta más?",
  usoDiario: "¿Cuál elegirías para tu rutina habitual?"
};

const INITIAL_RATING = 1000;
const K_FACTOR = 32;
const STORAGE_KEY = "beautymatch_state_v1";

const $ = (id) => document.getElementById(id);

const categorySelect = $("categorySelect");
const segmentSelect = $("segmentSelect");
const contextSelect = $("contextSelect");
const questionEl = $("question");
const labelA = $("labelA");
const labelB = $("labelB");
const btnA = $("btnA");
const btnB = $("btnB");
const btnNewPair = $("btnNewPair");
const btnReset = $("btnReset");
const btnExport = $("btnExport");
const btnShowTop = $("btnShowTop");
const voteStatus = $("voteStatus");
const rankingCaption = $("rankingCaption");
const topBox = $("topBox");

let currentA = null;
let currentB = null;

function makeBucketKey(category, segment, context) {
  return `${category}__${segment}__${context}`;
}

function createDefaultState() {
  const buckets = {};

  for (const category of Object.keys(CATALOG)) {
    for (const segment of Object.keys(SEGMENTS)) {
      for (const context of Object.keys(CONTEXTS)) {
        const key = makeBucketKey(category, segment, context);
        buckets[key] = {};

        for (const item of CATALOG[category]) {
          buckets[key][item] = INITIAL_RATING;
        }
      }
    }
  }

  return {
    buckets,
    votes: []
  };
}

function loadState() {
  const freshState = createDefaultState();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return freshState;
    }

    const saved = JSON.parse(raw);

    if (!saved || !saved.buckets || !Array.isArray(saved.votes)) {
      return freshState;
    }

    // Recupera puntuaciones válidas para los elementos conocidos.
    for (const key of Object.keys(freshState.buckets)) {
      const savedBucket = saved.buckets[key];

      if (!savedBucket || typeof savedBucket !== "object") {
        continue;
      }

      for (const item of Object.keys(freshState.buckets[key])) {
        const rating = savedBucket[item];

        if (Number.isFinite(rating)) {
          freshState.buckets[key][item] = rating;
        }
      }
    }

    freshState.votes = saved.votes.filter(
      (vote) => vote && typeof vote === "object"
    );

    return freshState;
  } catch (error) {
    console.error("No se pudieron recuperar los datos:", error);
    return freshState;
  }
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error("No se pudieron guardar los datos:", error);
    voteStatus.textContent =
      "No se pudieron guardar los datos. Exporta tus votos como CSV.";
    return false;
  }
}

function expectedScore(ratingA, ratingB) {
  return 1 / (
    1 + Math.pow(10, (ratingB - ratingA) / 400)
  );
}

function updateElo(bucket, itemA, itemB, winner) {
  const ratingA = bucket[itemA];
  const ratingB = bucket[itemB];

  // Probabilidad esperada de ganar para cada opción.
  const expectedA = expectedScore(ratingA, ratingB);
  const expectedB = expectedScore(ratingB, ratingA);

  // Resultado real: 1 para el ganador y 0 para el perdedor.
  const scoreA = winner === "A" ? 1 : 0;
  const scoreB = winner === "B" ? 1 : 0;

  // Calcular ambas puntuaciones con los valores anteriores.
  const newRatingA =
    ratingA + K_FACTOR * (scoreA - expectedA);

  const newRatingB =
    ratingB + K_FACTOR * (scoreB - expectedB);

  bucket[itemA] = newRatingA;
  bucket[itemB] = newRatingB;
}

function getCurrentBucket() {
  const key = makeBucketKey(
    categorySelect.value,
    segmentSelect.value,
    contextSelect.value
  );

  return state.buckets[key];
}

function getRandomPair() {
  const items = CATALOG[categorySelect.value];

  if (!items || items.length < 2) {
    return [null, null];
  }

  const indexA = Math.floor(Math.random() * items.length);
  let indexB = Math.floor(Math.random() * items.length);

  while (indexB === indexA) {
    indexB = Math.floor(Math.random() * items.length);
  }

  return [items[indexA], items[indexB]];
}

function updateQuestion() {
  questionEl.textContent = CONTEXTS[contextSelect.value];

  rankingCaption.textContent =
    `${categorySelect.options[categorySelect.selectedIndex].text} · ` +
    `${SEGMENTS[segmentSelect.value]} · ` +
    `${CONTEXTS[contextSelect.value]}`;
}

function newDuel() {
  [currentA, currentB] = getRandomPair();

  labelA.textContent = currentA || "Sin opciones";
  labelB.textContent = currentB || "Sin opciones";

  btnA.disabled = !currentA || !currentB;
  btnB.disabled = !currentA || !currentB;

  updateQuestion();
  voteStatus.textContent = "";
}

function getTopItems(bucket, limit = 10) {
  return Object.entries(bucket)
    .map(([name, rating]) => ({ name, rating }))
    .sort((a, b) => {
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }

      return a.name.localeCompare(b.name, "es");
    })
    .slice(0, limit);
}

function renderRanking() {
  const topItems = getTopItems(getCurrentBucket(), 10);

  topBox.replaceChildren();

  if (topItems.length === 0) {
    const message = document.createElement("p");
    message.className = "empty";
    message.textContent = "No hay opciones disponibles.";
    topBox.appendChild(message);
    return;
  }

  topItems.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "toprow";

    const position = document.createElement("span");
    position.className = "rank";
    position.textContent = `${index + 1}.`;

    const name = document.createElement("span");
    name.textContent = entry.name;

    const score = document.createElement("span");
    score.className = "rating";
    score.textContent = entry.rating.toFixed(1);

    row.append(position, name, score);
    topBox.appendChild(row);
  });
}

function registerVote(winner) {
  if (!currentA || !currentB || currentA === currentB) {
    return;
  }

  const bucket = getCurrentBucket();

  const categoryName =
    categorySelect.options[categorySelect.selectedIndex].text;

  const winnerName = winner === "A" ? currentA : currentB;
  const loserName = winner === "A" ? currentB : currentA;

  // Actualiza las puntuaciones Elo del perfil y contexto actuales.
  updateElo(bucket, currentA, currentB, winner);

  // Registra el voto para el historial y la exportación.
  state.votes.push({
    timestamp: new Date().toISOString(),
    category: categoryName,
    segment: SEGMENTS[segmentSelect.value],
    context: CONTEXTS[contextSelect.value],
    optionA: currentA,
    optionB: currentB,
    winner: winnerName,
    loser: loserName
  });

  saveState();
  renderRanking();

  voteStatus.textContent = `Voto registrado: preferiste "${winnerName}".`;

  newDuel();
}

function resetData() {
  const confirmed = window.confirm(
    "Se borrarán los rankings y votos de BeautyMatch guardados " +
    "en este navegador. ¿Quieres continuar?"
  );

  if (!confirmed) {
    return;
  }

  state = createDefaultState();
  saveState();
  renderRanking();
  newDuel();

  voteStatus.textContent = "Los rankings y votos se reiniciaron.";
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportVotes() {
  if (state.votes.length === 0) {
    window.alert("Todavía no hay votos para exportar.");
    return;
  }

  const columns = [
    "timestamp",
    "category",
    "segment",
    "context",
    "optionA",
    "optionB",
    "winner",
    "loser"
  ];

  const rows = [
    columns.map(csvEscape).join(",")
  ];

  for (const vote of state.votes) {
    rows.push(
      columns.map((column) => csvEscape(vote[column])).join(",")
    );
  }

  const csv = "\uFEFF" + rows.join("\r\n");
  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "beautymatch_votos.csv";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

// Eventos de la interfaz.
btnA.addEventListener("click", () => registerVote("A"));
btnB.addEventListener("click", () => registerVote("B"));

btnNewPair.addEventListener("click", newDuel);
btnReset.addEventListener("click", resetData);
btnExport.addEventListener("click", exportVotes);
btnShowTop.addEventListener("click", renderRanking);

categorySelect.addEventListener("change", () => {
  updateQuestion();
  renderRanking();
  newDuel();
});

segmentSelect.addEventListener("change", () => {
  updateQuestion();
  renderRanking();
});

contextSelect.addEventListener("change", () => {
  updateQuestion();
  renderRanking();
});

// Iniciar la aplicación.
updateQuestion();
newDuel();
renderRanking();
