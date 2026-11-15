/** Textos del Dashboard. La interfaz va en inglés (apps/web/ARCHITECTURE.md). */

export const copy = {
  alert: {
    allGood: (n: number) => (n === 1 ? "The mission meets its requirements." : `All ${n} missions meet their requirements.`),
    some: (bad: number, n: number) => `${bad} of ${n} ${n === 1 ? "mission" : "missions"} ${bad === 1 ? "does" : "do"} not meet ${bad === 1 ? "its" : "their"} requirements.`,
    none: "No missions yet. Add one to see its Sun and Earth windows.",
    review: (name: string) => `Review ${name}`,
    undo: "Undo",
  },
  list: {
    title: "Upcoming missions",
    add: "New mission",
    open: "View detail",
    restore: "Restore examples",
    example: "Example",
    lands: (text: string) => `Lands in ${text}`,
    landed: "Landing date passed",
    wait: "Calculating…",
  },
  link: {
    title: "Sun and link",
    sun: "Sun (power)",
    earth: "Earth (link)",
    both: "Both at once",
    ofStay: (days: number) => `${days}-day stay`,
    sunSet: "Sunset in",
    sunRise: "Sunrise in",
    sunAlways: "Sun",
    earthSet: "Earthset in",
    earthRise: "Earthrise in",
    earthAlways: "Earth",
    fromLanding: "from landing",
    noChange: (visible: boolean) => (visible ? "In view, no set in 60 days" : "Hidden, no rise in 60 days"),
    empty: "Select a mission to read its Sun and Earth time.",
  },
}
