/**
 * All user-facing copy in one place. Category labels are not duplicated here:
 * they come from `CATEGORY_LABELS_SR` in the contracts module.
 */
export const UI_SR = {
  appTitle: "Zanimljiva Geografija Live",
  displayName: "Tvoje ime",
  createRoom: "Napravi sobu",
  haveCode: "Imaš kod sobe?",
  joinInstead: "Pridruži se postojećoj sobi",
  backToLobby: "Nazad na početak",
  roomCode: "Kod sobe",
  join: "Pridruži se",
  waitingTitle: "Soba je napravljena",
  waitingForOpponent: "Čekamo drugog igrača. Podeli kod sobe.",
  synchronizing: "Oba igrača su tu. Pripremamo rundu…",
  countdownTitle: "Runda počinje",
  answeringTitle: "Upiši pojmove",
  letterIs: "Slovo",
  timeLeft: "Preostalo vreme",
  finish: "Završio sam",
  finishedTitle: "Tvoji odgovori su zaključani",
  waitingForOpponentFinish: "Čekamo da protivnik završi ili da istekne vreme.",
  opponentFinished: "Protivnik je završio.",
  opponentStillPlaying: "Protivnik još igra.",
  resultsTitle: "Rezultat",
  you: "Ti",
  opponent: "Protivnik",
  points: "Poeni",
  total: "Ukupno",
  player: "Igrač",
  round: "Runda",
  pointsFor: "poena",
  valid: "priznato",
  invalid: "nije priznato",
  noAnswer: "bez odgovora",
  outcomeWin: "Pobedio si!",
  outcomeLoss: "Protivnik je pobedio.",
  outcomeDraw: "Nerešeno.",
  connectionLost: "Veza sa serverom je prekinuta. Osveži stranicu da započneš novu igru.",
  statusEmpty: "prazno",
  statusPending: "čuva se…",
  statusSaved: "sačuvano",
  statusRejected: "nije sačuvano",
  reasons: {
    both_different: "Oba odgovora priznata i različita",
    same_answer: "Isti odgovor",
    only_player_1: "Samo prvi igrač",
    only_player_2: "Samo drugi igrač",
    neither: "Nijedan odgovor nije priznat",
  },
  /**
   * Required by `Plan.md` §7 on the results screen. The English sentence is the
   * wording the plan fixes; the Serbian line above it is the one players read.
   */
  honorSystemSr:
    "U ovoj verziji proveravamo samo početno slovo. Za tačnost pojmova odgovorni su igrači.",
  honorSystemEn:
    "Answers are checked only for the selected starting letter in this Week 3 version. Players are responsible for semantic correctness.",
} as const;
