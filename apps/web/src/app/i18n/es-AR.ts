// Every visible text of the interface, in rioplatense Spanish (voseo, plain words). Another
// language is a second file with the same shape (`Messages`); components read the texts through
// `t` (./index.ts) and hold none of their own. Event types, ids and code stay in English.
import type { ModelId } from "@chebot/protocol";

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
  models: MODEL_NAMES,
  modelNames: names,

  nav: {
    home: "Ir al inicio",
    ask: "Preguntar",
    signIn: "Entrar",
    signOut: "Salir",
    signedInAs: (name: string) => `Entraste como ${name}`,
    menu: "Navegación",
  },

  common: {
    loading: "Cargando…",
    close: "Cerrar",
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
    network: "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.",
    generic: "Algo salió mal. Probá de nuevo en un rato.",
    runNotFound: "No encontramos esta pregunta. Puede que la hayan borrado.",
    signInFailed: "No pudimos hacerte entrar. Probá de nuevo.",
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
    confirmed: "Pago recibido.",
  },

  status: {
    waiting: "esperando",
    thinking: "pensando",
    done: "listo",
    abstained: "no contestó",
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
    fewDrafts: "Llegaron menos de tres respuestas, así que no hubo discusión ni votos.",
    budgetReached: "Se terminó el presupuesto de la pregunta y se cerró con lo que había.",
    deadlineReached: "Se acabó el tiempo previsto y se cerró con lo que había.",
    quorumLost: "En una vuelta contestaron menos de tres, así que se cortó la discusión ahí.",
    mergeFallback:
      "Algunas partes se acomodaron sin el asistente; el contenido es el de los cuatro.",
    abstained: (who: string) => `${who} no contestó en alguna vuelta; siguieron los demás.`,
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
      beta: "Ana, de la prueba privada",
      admin: "Admin",
      outsider: "Juan, sin acceso todavía",
    },
    pay: "Simular el pago",
  },
};

function effortName(effort: string): string {
  return (
    ({ low: "bajo", medium: "medio", high: "alto" } as Record<string, string>)[effort] ?? effort
  );
}

export type Messages = typeof esAR;
