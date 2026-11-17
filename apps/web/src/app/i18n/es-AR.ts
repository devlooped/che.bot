// Every visible text of the interface, in rioplatense Spanish (voseo, plain words). Another
// language is a second file with the same shape (`Messages`); components read the texts through
// `t` (./index.ts) and hold none of their own. Event types, ids and code stay in English.
import type { ModelId } from "@chebot/protocol";
import type { ChartLocale } from "../chart/spec.ts";

const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/** "$ 10.000" for ARS; another currency keeps its code. */
function money(amount: number, currency: string): string {
  if (currency === "ARS") return ars.format(amount);
  return `${new Intl.NumberFormat("es-AR").format(amount)} ${currency}`;
}

/** "Grok", "Grok y Claude", "Grok, Claude y Gemini". */
function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const MODEL_NAMES: Record<ModelId, string> = {
  grok: "Grok",
  claude: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
};

const names = (models: readonly ModelId[]) => list(models.map((m) => MODEL_NAMES[m]));

export const esAR = {
  locale: "es-AR",
  appName: "che.bot",
  money,
  list,
  date: formatDate,
  models: MODEL_NAMES,
  modelNames: names,

  nav: {
    home: "che.bot, ir al inicio",
    ask: "Preguntar",
    signIn: "Entrar",
    signOut: "Salir",
    signedInAs: (name: string) => `Entraste como ${name}`,
    menu: "Navegación",
    myRuns: "Mis preguntas",
    admin: "Administración",
  },

  common: {
    loading: "Cargando…",
    close: "Cerrar",
    cancel: "Cancelar",
    retry: "Probar de nuevo",
    copyLink: "Copiar el link",
    linkCopied: "Link copiado",
  },

  errors: {
    notSignedIn: "Para preguntar tenés que entrar con tu cuenta.",
    noAccess:
      "Tu cuenta todavía no puede preguntar: por ahora la usan solo quienes están en la prueba privada.",
    tooMany: "Hiciste muchas preguntas seguidas. Esperá un minuto y probá de nuevo.",
    tooLong: (max: string) => `La pregunta es muy larga: puede tener hasta ${max} caracteres.`,
    empty: "Escribí una pregunta.",
    dailyLimit: "Hoy ya se llegó al límite de preguntas del día. Probá de nuevo mañana.",
    notYours: "Esta pregunta es de otra cuenta.",
    notAdmin: "Esta página es solo para quienes administran che.bot.",
    cannotRerun: "Esta pregunta ya no se puede volver a intentar.",
    invalid: "No se guardó: revisá los valores marcados.",
    network: "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.",
    generic: "Algo salió mal. Probá de nuevo en un rato.",
    runNotFound: "No encontramos esta pregunta. Puede que la hayan borrado.",
    signInFailed: "No pudimos hacerte entrar. Probá de nuevo.",
    noFile: "Elegí el archivo con tus datos.",
    /** Why a CSV file is refused, by the code of the refusal (CsvError of the protocol). */
    file: {
      too_large: "El archivo pesa más de 64 KB. Sacale filas o columnas que no hagan falta.",
      too_many_rows: "El archivo tiene más de 500 filas. Dejá solo las que necesita el gráfico.",
      too_many_columns:
        "El archivo tiene más de 12 columnas. Dejá solo las que necesita el gráfico.",
      ragged:
        "Algunas filas tienen más o menos columnas que la primera. Revisá que todas tengan las mismas.",
      unterminated_quote: "Hay unas comillas que se abren y no se cierran. Revisá el archivo.",
      empty: "El archivo está vacío.",
      no_rows: "El archivo tiene la fila de los nombres y ninguna fila de datos.",
      unreadable:
        "No pudimos leer el archivo. Tiene que ser un CSV: texto con columnas separadas por comas o por punto y coma.",
    } as Record<string, string>,
  },

  ask: {
    title: "Preguntar",
    headline: "Cuatro modelos de IA piensan tu pregunta y escriben una sola respuesta.",
    lede: "Cada uno responde por su cuenta. Después comparan, proponen cambios y votan. Vos ves en qué coinciden, qué quedó en discusión y quién sostuvo qué.",
    label: "Tu pregunta",
    placeholder: "Por ejemplo: ¿conviene alquilar o comprar un departamento en Córdoba hoy?",
    counter: (used: string, max: string) => `${used} de ${max}`,
    submit: "Ver el precio",
    submitting: "Calculando el precio…",
    publicNote: "Cualquiera que tenga el link de la respuesta la va a poder leer.",
    signInToAsk: "Entrá para preguntar",
    signInLede: "Para preguntar necesitás una cuenta. Leer respuestas compartidas no.",
    chart: {
      toggle: "Quiero un gráfico",
      toggleHint:
        "Los cuatro arman un gráfico juntos. Cada número va con su fuente, y si no coinciden lo resuelven con las fuentes, no votando.",
      dataLegend: "¿De dónde salen los datos?",
      web: "Que los busquen en internet",
      webHint: "Cada número va con el link de donde sale y las palabras que lo dicen.",
      file: "De mi tabla (un archivo CSV)",
      fileHint:
        "Los números salen solo de tu tabla: los cuatro acuerdan cómo graficarla, pero no escriben ningún número.",
      fileLabel: "Tu archivo",
      choose: "Elegir el archivo",
      noneChosen: "Todavía no elegiste ninguno.",
      fileLimits:
        "Hasta 64 KB, 500 filas y 12 columnas. La primera fila lleva los nombres de las columnas, separadas por comas o por punto y coma.",
      fileReady: (name: string, rows: number, columns: number) =>
        `${name}: ${rows} ${plural(rows, "fila", "filas")} y ${columns} ${plural(columns, "columna", "columnas")}.`,
      reading: "Leyendo el archivo…",
      samePrice: "El precio es el mismo que el de una respuesta en texto.",
    },
    howTitle: "Cómo funciona",
    how: [
      "Escribís tu pregunta y ves cuánto cuesta.",
      "Pagás con un QR de Mercado Pago.",
      "Grok, Claude, ChatGPT y Gemini responden por separado y después discuten hasta armar una sola respuesta.",
    ],
  },

  quote: {
    classes: { simple: "simple", complex: "compleja" },
    yourQuestion: (cls: string) => `Tu pregunta es ${cls}.`,
    classWhy: {
      simple: "Tiene una respuesta directa, sin mucho para discutir.",
      complex: "Hay que comparar fuentes, razonar en varios pasos o tiene puntos discutibles.",
    },
    sameProcess:
      "El precio depende solo de eso: en los dos casos los cuatro siguen el mismo proceso.",
    pay: (price: string) => `Pagar ${price} con QR`,
    paying: "Preparando el pago…",
    adminRun: "Empezar sin pagar",
    adminNote: "Tenés permiso de administración: esta pregunta no se cobra.",
    notPaidYet: "Esta pregunta todavía no se pagó, así que no tiene respuesta.",
    chart: {
      web: "Pediste la respuesta como gráfico, con datos de internet.",
      user: "Pediste la respuesta como gráfico de tu tabla.",
    },
  },

  payment: {
    title: "Pagá con el QR",
    scan: "Escaneá el código con Mercado Pago o con la app de tu banco.",
    total: (price: string) => `Total: ${price}`,
    qrLabel: (price: string) => `Código QR para pagar ${price}`,
    preparing: "Preparando el QR…",
    waiting: "Esperando el pago…",
    afterPay:
      "Cuando se acredite, los cuatro empiezan solos. Podés cerrar esta pestaña y volver por el link.",
    expiresNote: "El QR vence a los 15 minutos.",
    waitingOther: "Esta pregunta está esperando el pago.",
    expired: "El pago no llegó a tiempo y esta pregunta quedó sin responder.",
    askAgain: "Preguntar de nuevo",
    askingAgain: "Calculando el precio…",
    askAgainNote: "Vas a ver el precio otra vez antes de pagar.",
    confirmed: "Pago recibido.",
  },

  status: {
    waiting: "esperando",
    thinking: "pensando",
    done: "listo",
    abstained: "no contestó",
  },

  /** The chip of a model that answered the drafts but not a later step. */
  abstainedLater: {
    round1: "no llegó a proponer",
    votes: "no llegó a votar",
  },

  seats: {
    title: "Los cuatro",
    seat: (name: string, status: string) => `${name}: ${status}`,
  },

  stage: {
    quoted: "Falta confirmar la pregunta.",
    awaiting_payment: "Esperando el pago.",
    expired: "El pago venció.",
    starting: "Arrancando…",
    drafting: "Cada uno escribe su respuesta por separado…",
    merging: "Juntando las cuatro respuestas en un solo texto…",
    round1: (open: number) =>
      open > 0
        ? `Comparando respuestas… ${open} ${plural(open, "punto", "puntos")} en discusión`
        : "Comparando respuestas…",
    round2: (open: number) =>
      open > 0
        ? `Votando los cambios… ${open} ${plural(open, "punto", "puntos")} en discusión`
        : "Votando los cambios…",
    round3: (open: number) =>
      open > 0
        ? `Última vuelta de votos… ${open} ${plural(open, "punto", "puntos")} en discusión`
        : "Última vuelta de votos…",
    editing: "Puliendo la redacción final…",
    done: (agreed: number, total: number, dissent: number) =>
      dissent > 0
        ? `Listo. Los cuatro coinciden en ${agreed} de ${total} ${plural(total, "parte", "partes")}; ${dissent} ${plural(dissent, "punto quedó", "puntos quedaron")} sin acuerdo.`
        : `Listo. Los cuatro coinciden en ${agreed} de ${total} ${plural(total, "parte", "partes")}.`,
    failed: "No pudimos armar una respuesta esta vez.",
    chart: {
      drafting: {
        web: "Cada uno busca los datos por su cuenta, con la fuente de cada número…",
        user: "Cada uno piensa por su cuenta cómo graficar tu tabla…",
      },
      merging: "Juntando los datos en un solo gráfico…",
      round1: (open: number) =>
        open > 0
          ? `Revisando el gráfico y las fuentes… ${open} ${plural(open, "punto", "puntos")} en discusión`
          : "Revisando el gráfico y las fuentes…",
      round2: (open: number) =>
        open > 0
          ? `Votando los cambios al gráfico… ${open} ${plural(open, "punto", "puntos")} en discusión`
          : "Votando los cambios al gráfico…",
      done: (c: {
        rows: number;
        agreed: number;
        settled: number;
        ranges: number;
        lone: number;
      }) => {
        const parts = [
          c.agreed > 0 ? `coinciden en ${c.agreed}` : "",
          c.settled > 0
            ? `${c.settled} ${plural(c.settled, "lo resolvió su fuente", "los resolvieron sus fuentes")}`
            : "",
          c.ranges > 0 ? `${c.ranges} ${plural(c.ranges, "quedó", "quedaron")} sin acuerdo` : "",
          c.lone > 0 ? `${c.lone} sin confirmar` : "",
        ].filter(Boolean);
        const rows = `${c.rows} ${plural(c.rows, "dato", "datos")}`;
        return parts.length > 0
          ? `Listo. De ${rows}, ${list(parts)}.`
          : `Listo. El gráfico tiene ${rows}.`;
      },
      doneUser: (dissent: number) =>
        dissent > 0
          ? `Listo. El gráfico está calculado con tu tabla; ${dissent} ${plural(dissent, "punto quedó", "puntos quedaron")} sin acuerdo.`
          : "Listo. El gráfico está calculado con tu tabla.",
    },
  },

  connection: {
    reconnecting: "Se cortó la conexión. Reconectando…",
    polling: "La conexión está lenta: actualizamos cada pocos segundos.",
  },

  moments: {
    title: "Lo que va pasando",
    titleDone: "Cómo se armó la respuesta",
    empty: "Todavía no pasó nada.",
    showAll: (n: number) => `Ver ${n} más`,
    showLess: "Ver menos",
  },

  answer: {
    title: "La respuesta",
    draftNote: "Todavía se está escribiendo: lo que ves puede cambiar.",
    legend:
      "Las marcas al margen señalan lo que no fue unánime o se discutió. Tocá una para ver quién sostuvo qué.",
    badge: (n: number, of: number) => `${n} de ${of}`,
    markLabel: (n: number, of: number, status: string) =>
      `${status}: lo sostienen ${n} de ${of}. Ver la discusión`,
    statusName: {
      agreed: "Los cuatro coinciden",
      majority: "Coinciden tres de cuatro",
      contested: "En discusión",
    },
    noDocument: "La respuesta aparece acá cuando los cuatro terminen de escribir.",
  },

  dissent: {
    title: "Sin acuerdo",
    note: (author: string, action: string) => `${author} propone ${action}`,
    actions: {
      replace: "cambiar este párrafo por:",
      insert_after: "agregar después:",
      delete: "borrar este párrafo.",
      patch: "cambiar este gráfico.",
    },
    holders: (who: string, n: number) => `${plural(n, "Lo apoya", "Lo apoyan")} ${who}.`,
    against: (who: string, n: number) =>
      `${plural(n, "Prefiere", "Prefieren")} dejarlo como está ${who}.`,
    silent: (who: string) => `${who} no votó.`,
    open: "Todavía se está votando.",
  },

  discussion: {
    title: "Cómo se discutió este párrafo",
    supportedBy: (who: string, n: number) => `${plural(n, "Lo sostiene", "Lo sostienen")} ${who}.`,
    notSupportedBy: (who: string, n: number) => `${plural(n, "No lo dice", "No lo dicen")} ${who}.`,
    before: "Antes decía:",
    noThreads: "Nadie propuso cambios a este párrafo.",
    proposal: (author: string, action: string) => `${author} propuso ${action}`,
    actions: {
      replace: "cambiarlo por:",
      insert_after: "agregar después:",
      delete: "borrarlo.",
      patch: "cambiar el gráfico.",
    },
    addedBy: (author: string) => `Este párrafo lo agregó ${author}:`,
    alsoProposed: (who: string, n: number) =>
      `${who} ${plural(n, "propuso lo mismo y sumó su apoyo", "propusieron lo mismo y sumaron su apoyo")}.`,
    why: "Por qué:",
    positions: "Quién apoyó qué",
    keep: "dejarlo como estaba",
    holds: (choice: string) => `apoya ${choice}`,
    proposalOf: (author: string) => `la propuesta de ${author}`,
    noVote: "no votó",
    changed: "Cambió de opinión",
    outcome: {
      accepted: (n: number) => `Se aceptó, con el apoyo de ${n} de 4.`,
      rejected: "No consiguió apoyo: quedó como estaba.",
      unresolved: "No hubo acuerdo: queda anotado al margen.",
      open: "Todavía se está votando.",
    },
  },

  sources: {
    title: "Fuentes",
    foundBy: (who: string) => `La encontró ${who}`,
    none: "Ningún párrafo cita fuentes.",
  },

  panel: {
    title: "Quién participó",
    utility: "Asistente",
    utilityRole: "Juntó las respuestas y escribió los resúmenes.",
    effort: (effort: string) => `esfuerzo ${effortName(effort)}`,
  },

  flags: {
    title: "Para tener en cuenta",
    fewDrafts: (n: number) =>
      `Llegaron solo ${n} ${plural(n, "respuesta", "respuestas")} de cuatro, así que no hubo discusión ni votos: el texto junta lo que dijeron, sin que los demás lo revisaran.`,
    /** What a cut left out: the discussion of the text, or only the last part. */
    budgetReached: {
      discussion:
        "Se terminó el presupuesto de la pregunta antes de que los cuatro discutieran el texto: lo marcado al margen quedó sin votar.",
      final:
        "Se terminó el presupuesto de la pregunta antes del último repaso: la respuesta es la que quedó después de los votos.",
    },
    deadlineReached: {
      discussion:
        "Se acabó el tiempo previsto antes de que los cuatro discutieran el texto: lo marcado al margen quedó sin votar.",
      final:
        "Se acabó el tiempo previsto antes del último repaso: la respuesta es la que quedó después de los votos.",
    },
    quorumLost: "En una vuelta contestaron menos de tres, así que se cortó la discusión ahí.",
    mergeFallback:
      "Algunas partes se acomodaron sin el asistente; el contenido es el de los cuatro.",
    abstained: {
      drafting: (who: string, n: number) =>
        `${who} no ${plural(n, "contestó", "contestaron")}, así que la respuesta se armó con los demás.`,
      round1: (who: string, n: number) =>
        `${who} no ${plural(n, "llegó", "llegaron")} a proponer cambios a tiempo; siguieron los demás.`,
      votes: (who: string, n: number) =>
        `${who} no ${plural(n, "llegó", "llegaron")} a votar en una vuelta; decidieron los demás.`,
    },
  },

  failure: {
    title: "No se pudo armar la respuesta",
    reasons: {
      no_drafts: "Ninguno de los cuatro llegó a contestar.",
      error: "Hubo una falla de nuestro lado mientras los cuatro trabajaban.",
      budget: "Se terminó el presupuesto antes de que alguno contestara.",
      deadline: "Se acabó el tiempo antes de que alguno contestara.",
    },
    rerunOffer:
      "Como ya pagaste, podés volver a intentarlo sin cargo: los cuatro empiezan de nuevo con la misma pregunta.",
    rerun: "Volver a intentar sin cargo",
    rerunning: "Empezando de nuevo…",
    noRerunLeft: "Ya se volvió a intentar una vez sin cargo y tampoco salió.",
    askAgain: "Podés hacer la pregunta de nuevo.",
    reader: "Quien hizo la pregunta puede volver a intentarlo.",
    secondAttempt: "Segundo intento, sin cargo.",
  },

  chart: {
    /** The label of the drawing: the table under it is its text. */
    label: (title: string) =>
      `Gráfico: ${title}. Los datos y sus fuentes están en la tabla de abajo.`,
    untitled: "Gráfico sin título",
    drawing: "Dibujando el gráfico…",
    failed:
      "No pudimos dibujar el gráfico en este navegador. Los datos están en la tabla de abajo.",
    legend:
      "Un número sobre un punto lleva a su nota, abajo del gráfico. Una línea vertical roja con dos topes es un rango: las dos cifras que no se pudieron resolver.",
    dataTitle: "Los datos del gráfico",
    dataLede: "Cada número con su fuente y las palabras de la fuente que lo dicen.",
    valueColumn: "Valor",
    sourceColumn: "De dónde sale",
    range: (low: string, high: string) => `de ${low} a ${high}`,
    givenBy: (who: string, n: number) => `Lo ${plural(n, "dio", "dieron")} ${who}.`,
    note: (n: number) => `Nota ${n}`,
    kinds: {
      agreed: "Coinciden",
      confirmed: "Confirmado con su fuente",
      corrected: "Corregido con su fuente",
      range: "Sin acuerdo",
      lone: "Sin confirmar",
      checking: "En revisión",
      upload: "De tu tabla",
    },
    notes: {
      corrected: (was: string, now: string) => `Se corrigió: decía ${was} y ahora dice ${now}.`,
      settled: (now: string) => `Los cuatro dieron cifras distintas y quedó ${now}.`,
      settledBy: "Lo resolvió la fuente:",
      range: (low: string, high: string) =>
        `Los cuatro no coincidieron y ninguna fuente lo resolvió, así que el gráfico muestra las dos cifras: ${low} y ${high}.`,
      loneUnverified: (who: string) =>
        `Este dato lo trajo solo ${who} y ninguna fuente lo confirmó: los demás revisaron la fuente y no dice ese número.`,
      loneUnchecked: (who: string) => `Este dato lo trajo solo ${who} y nadie más lo pudo revisar.`,
      loneChecking: (who: string) =>
        `Este dato lo trajo solo ${who}; los demás están revisando su fuente.`,
      checking: "Los cuatro dieron cifras distintas y las están revisando con las fuentes.",
      said: (who: string, n: number, value: string) =>
        `${who} ${plural(n, "dijo", "dijeron")} ${value}, según`,
      verdict: {
        held: "Su fuente lo confirma.",
        failed: "Los demás no encontraron ese número en esa fuente.",
        partial: (holds: number, checkers: number) =>
          `${holds} de ${checkers} lo ${plural(holds, "encontró", "encontraron")} en la fuente; no alcanzó.`,
        unchecked: "Nadie más lo revisó.",
        checking: "Se está revisando.",
      },
    },
    user: {
      fromTable:
        "Cada número de este gráfico sale de tu tabla: lo calculó che.bot, y ninguna de las IA escribió un número.",
      calculation: (text: string) => `El cálculo que acordaron: ${text}.`,
      table: (rows: number, columns: number) =>
        `Tu tabla tiene ${rows} ${plural(rows, "fila", "filas")} y ${columns} ${plural(columns, "columna", "columnas")}.`,
      drawnTitle: "Lo que muestra el gráfico",
      drawnLede: "Los números que dibuja el gráfico, calculados con tu tabla.",
      showUpload: (n: number) => `Ver tu tabla (${n} ${plural(n, "fila", "filas")})`,
    },
    calc: {
      none: "las filas de tu tabla tal como están, sin cálculos",
      ops: {
        sum: "la suma",
        mean: "el promedio",
        average: "el promedio",
        median: "la mediana",
        min: "el mínimo",
        max: "el máximo",
        count: "la cantidad de filas",
        valid: "la cantidad de valores",
        distinct: "la cantidad de valores distintos",
      } as Record<string, string>,
      otherOp: "un resumen",
      aggregate: (summary: string, field: string | null, by: string) =>
        `${summary}${field ? ` de «${field}»` : ""}${by ? ` por ${by}` : ""}`,
      filter: "deja afuera algunas filas con una condición",
      calculate: (as: string) => `calcula «${as}» a partir de otras columnas`,
      timeUnit: (field: string, unit: string) => `agrupa las fechas de «${field}» por ${unit}`,
      units: {
        year: "año",
        yearquarter: "trimestre",
        quarter: "trimestre",
        yearmonth: "mes",
        month: "mes",
        yearweek: "semana",
        week: "semana",
        yearmonthdate: "día",
        date: "día",
        day: "día de la semana",
      } as Record<string, string>,
      otherUnit: "período",
      bin: (field: string) => `agrupa «${field}» en rangos`,
      cumulative: (field: string) => `acumula «${field}» fila tras fila`,
      window: (as: string) => `calcula «${as}» con las filas vecinas`,
      joinaggregate: (summary: string, field: string) =>
        `agrega a cada fila ${summary} de «${field}»`,
      fold: (fields: string) => `pone ${fields} en una sola columna`,
      pivot: (field: string) => `convierte los valores de «${field}» en columnas`,
      stack: (field: string) => `apila «${field}»`,
      trend: (y: string, x: string) => `calcula una tendencia de «${y}» según «${x}»`,
      other: "otro cálculo",
      quoted: (field: string) => `«${field}»`,
      sequence: (steps: readonly string[]) => steps.join("; después, "),
    },
    layers: {
      title: "Lo que se votó del gráfico",
      lede: "Tocá cada parte para ver quién propuso qué, por qué, y quién apoyó cada propuesta.",
      names: {
        encoding: "El tipo de gráfico",
        title: "El título",
        caption: "La explicación",
        transform: "El cálculo",
        data: "Los datos",
      },
      sheetTitle: {
        encoding: "Cómo se discutió el tipo de gráfico",
        title: "Cómo se discutió el título",
        caption: "Cómo se discutió la explicación",
        transform: "Cómo se discutió el cálculo",
        data: "Cómo se discutieron los datos",
      },
      open: "Ver la discusión",
      outcome: {
        accepted: (n: number) => `se cambió, con el apoyo de ${n} de 4`,
        rejected: "quedó como estaba",
        unresolved: "sin acuerdo",
        open: "se está votando",
      },
      now: "Ahora:",
      empty: "(vacío)",
    },
    kind: (mark: string) => `Gráfico ${mark}.`,
    axis: (which: string, title: string) => `${which}: ${title}.`,
    axes: { x: "Eje horizontal", y: "Eje vertical" } as Record<string, string>,
    marks: {
      bar: "de barras",
      line: "de líneas",
      area: "de área",
      point: "de puntos",
      circle: "de puntos",
      square: "de puntos",
      arc: "de torta",
      rect: "de cuadrícula",
      tick: "de marcas",
      rule: "de líneas rectas",
      text: "de textos",
      boxplot: "de cajas",
      errorbar: "con márgenes de error",
      errorband: "con márgenes de error",
      trail: "de líneas",
    } as Record<string, string>,
    otherMark: "de otro tipo",
    /** What a proposal changes, in plain words: the action, and the new text when there is one. */
    patch: {
      title: "cambiar el título por:",
      caption: "cambiar la explicación por:",
      mark: (kind: string) => `dibujarlo como gráfico ${kind}.`,
      axisTitle: (axis: string) => `cambiar el nombre del ${axis} por:`,
      channel: (part: string) => `cambiar ${part}.`,
      encoding: "cambiar cómo se dibuja el gráfico.",
      transform: "cambiar el cálculo:",
      data: (key: string) => `cambiar el dato de ${key} por:`,
      axisNames: { x: "eje horizontal", y: "eje vertical" } as Record<string, string>,
      parts: {
        x: "el eje horizontal",
        y: "el eje vertical",
        color: "los colores",
        xOffset: "la separación de las barras",
        size: "el tamaño de las marcas",
        shape: "la forma de las marcas",
        opacity: "la transparencia",
        tooltip: "lo que aparece al pasar el dedo",
        text: "los textos",
        theta: "las porciones",
      } as Record<string, string>,
      otherPart: "una parte del dibujo",
    },
    history: {
      title: "Cómo cambió el gráfico",
      show: "Ver cómo cambió el gráfico",
      hide: "Ocultar cómo cambió el gráfico",
      lede: "Mové la barra para ver el gráfico en cada momento: los puntos se mueven a sus valores de ese paso.",
      slider: "Momento del gráfico",
      changesTitle: "Qué cambió en este paso",
      steps: {
        sources: "Después de revisar las fuentes",
        render: "La última versión que se pudo dibujar",
      },
      what: {
        merge: (n: number) =>
          n === 4
            ? "Los datos de los cuatro, juntos en un solo gráfico."
            : `Los datos de los ${n} que contestaron, juntos en un solo gráfico.`,
        sources: (n: number) => `Las fuentes resolvieron ${n} ${plural(n, "dato", "datos")}.`,
        both: (n: number, who: string, changes: number) =>
          `Las fuentes resolvieron ${n} ${plural(n, "dato", "datos")} y ${plural(changes, "entró el cambio que propuso", "entraron los cambios que propusieron")} ${who}.`,
        render: "Un cambio no se pudo dibujar, así que volvió la última versión que sí.",
        none: "En este paso no cambió nada que se vea.",
      },
      row: {
        added: (label: string, value: string) => `${label}: se agregó, ${value}.`,
        removed: (label: string) => `${label}: salió del gráfico.`,
        corrected: (label: string, was: string, now: string) =>
          `${label}: pasó de ${was} a ${now}, como dice su fuente.`,
        confirmed: (label: string, value: string) => `${label}: su fuente confirmó ${value}.`,
        range: (label: string, low: string, high: string) =>
          `${label}: sin acuerdo, ahora muestra las dos cifras, ${low} y ${high}.`,
        lone: (label: string) => `${label}: nadie pudo confirmarlo con su fuente.`,
        changed: (label: string, was: string, now: string) => `${label}: pasó de ${was} a ${now}.`,
      },
      layerBy: (name: string, who: string) => `${name}, que propuso ${who}:`,
      layer: (name: string) => `${name}:`,
    },
    /** How the drawing writes numbers and dates (d3's format and time format locales). */
    locale: {
      number: { decimal: ",", thousands: ".", grouping: [3], currency: ["$ ", ""] },
      time: {
        dateTime: "%A, %e de %B de %Y, %X",
        date: "%d/%m/%Y",
        time: "%H:%M:%S",
        periods: ["a. m.", "p. m."],
        days: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
        shortDays: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
        months: [
          "enero",
          "febrero",
          "marzo",
          "abril",
          "mayo",
          "junio",
          "julio",
          "agosto",
          "septiembre",
          "octubre",
          "noviembre",
          "diciembre",
        ],
        shortMonths: [
          "ene",
          "feb",
          "mar",
          "abr",
          "may",
          "jun",
          "jul",
          "ago",
          "sept",
          "oct",
          "nov",
          "dic",
        ],
      },
    } as ChartLocale,
  },

  history: {
    title: "Cómo cambió el texto",
    show: "Ver cómo cambió el texto",
    hide: "Ocultar cómo cambió el texto",
    lede: "Mové la barra para ver el texto en cada momento. Lo que entró en ese paso está subrayado y lo que salió, tachado.",
    slider: "Momento del texto",
    position: (i: number, n: number) => `Paso ${i} de ${n}`,
    previous: "Anterior",
    next: "Siguiente",
    steps: {
      merge: "Primera versión",
      round: (round: number | null) =>
        round === 2
          ? "Después de la primera ronda de votos"
          : round === 3
            ? "Después de la última ronda de votos"
            : "Con los cambios aceptados al final",
      edit: "Redacción final",
    },
    what: {
      merge: (n: number) =>
        n === 4
          ? "Las respuestas de los cuatro, juntas en un solo texto."
          : `Las respuestas de los ${n} que contestaron, juntas en un solo texto.`,
      round: (who: string, n: number) =>
        n === 1
          ? `Entró el cambio que propuso ${who}.`
          : `Entraron los cambios que propusieron ${who}.`,
      edit: "Un último repaso de la redacción, sin cambiar lo que dice.",
    },
    added: "agregado:",
    removed: "sacado:",
    newParagraph: "Párrafo nuevo",
    removedParagraph: "Párrafo que salió",
  },

  myRuns: {
    title: "Mis preguntas",
    lede: "Las preguntas que hiciste, de la más nueva a la más vieja. Cualquiera que tenga el link de una respuesta la puede leer.",
    empty: "Todavía no hiciste ninguna pregunta.",
    askFirst: "Hacer una pregunta",
    signIn: "Entrá para ver tus preguntas.",
    status: {
      quoted: "Sin pagar",
      awaiting_payment: "Esperando el pago",
      running: "Respondiendo",
      completed: "Respondida",
      failed: "No se pudo responder",
      expired: "El pago venció",
    },
    asked: (date: string) => `Preguntada el ${date}`,
    price: (price: string) => `Precio: ${price}`,
    remove: "Borrar",
    confirmTitle: "¿Borrar esta pregunta?",
    confirmBody:
      "La respuesta y su link van a dejar de funcionar: nadie la va a poder abrir, tampoco vos. No se puede deshacer.",
    confirm: "Sí, borrar",
    removing: "Borrando…",
    removed: "Borraste la pregunta.",
  },

  admin: {
    title: "Administración",
    lede: "Los modelos y los precios valen para las preguntas nuevas: las que ya empezaron siguen con lo que tenían.",
    signIn: "Entrá con una cuenta de administración.",
    modelsTitle: "Modelos",
    roles: {
      "panel.grok": "Grok",
      "panel.claude": "Claude",
      "panel.openai": "ChatGPT",
      "panel.gemini": "Gemini",
      utility: "Asistente",
      classifier: "Clasificador",
    } as Record<string, string>,
    roleWhat: {
      panel: "Escribe una de las cuatro respuestas, propone cambios y vota.",
      utility: "Junta las respuestas, busca propuestas repetidas y escribe los resúmenes.",
      classifier: "Decide si una pregunta es simple o compleja, y con eso el precio.",
    },
    family: "Modelo",
    effort: "Esfuerzo",
    byDefault: (what: string) => `Por defecto: ${what}`,
    noEffort: "Sin indicar",
    efforts: {
      minimal: "mínimo",
      low: "bajo",
      medium: "medio",
      high: "alto",
      xhigh: "máximo",
    } as Record<string, string>,
    today: (id: string) => `Hoy usa ${id}.`,
    usesDefault: "Usa el valor por defecto.",
    backToDefault: "Volver al valor por defecto",
    saveModels: "Guardar los modelos",
    savedModels: "Modelos guardados.",
    pricesTitle: "Precios",
    priceLabel: { simple: "Pregunta simple, en pesos", complex: "Pregunta compleja, en pesos" },
    savePrices: "Guardar los precios",
    savedPrices: "Precios guardados.",
    saving: "Guardando…",
    noChanges: "No hay cambios para guardar.",
    fieldErrors: {
      unknown: "Esto no existe.",
      family: "Ese modelo ya no está disponible: elegí otro.",
      effort: "Ese esfuerzo no está disponible para este modelo.",
      noEffort: "Este modelo no lleva esfuerzo.",
      amount: "El precio tiene que ser un número mayor que cero.",
      amountMax: "El precio es demasiado alto: revisá que no sobre un cero.",
      other: "Este valor no es válido.",
    },
  },

  run: {
    title: "Pregunta",
    shareNote: "Esta respuesta se puede leer con el link, sin cuenta.",
  },

  notFound: {
    title: "Esta página no existe.",
    back: "Volver al inicio",
  },

  local: {
    badge: "Modo local",
    title: "Elegí con quién entrar",
    lede: "Modo local: no hay cuentas reales. Elegí un usuario de prueba.",
    users: {
      contrib: "Ana, de la prueba privada",
      admin: "Admin",
      outsider: "Juan, sin acceso todavía",
    },
    pay: "Simular el pago",
    expire: "Simular que venció el QR",
  },
};

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "16 de noviembre de 2026, 14:30" (as Intl words it for es-AR). */
function formatDate(iso: string | number): string {
  return dateFormat.format(new Date(iso));
}

function effortName(effort: string): string {
  return (
    ({ low: "bajo", medium: "medio", high: "alto" } as Record<string, string>)[effort] ?? effort
  );
}

export type Messages = typeof esAR;
