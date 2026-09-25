// ================= Game registry & helpers =================
const GAMES = {
  kap: {
    key: "kap",
    module: null,
    title: { en: "Kings & Pawns", vi: "Vua & Tốt" },
    sideA: { key: "king", label: { en: "King", vi: "Vua" } },
    sideB: { key: "pawn", label: { en: "Pawn", vi: "Tốt" } },
    firstTurn: "king",
    boardMode: "lattice",
    bottomSide: "pawn",
    colors: { a: "var(--king)", aGlow: "var(--king-glow)", b: "var(--pawn)", bGlow: "var(--pawn-glow)" }
  },
  checkers: {
    key: "checkers",
    module: null,
    title: { en: "Checkers", vi: "Cờ Nhào" },
    sideA: { key: "white", label: { en: "White", vi: "Trắng" } },
    sideB: { key: "black", label: { en: "Black", vi: "Đen" } },
    firstTurn: "white",
    boardMode: "lattice",
    bottomSide: "black",
    colors: { a: "var(--white-pc)", aGlow: "var(--white-glow)", b: "var(--black-pc)", bGlow: "var(--black-glow)" }
  },
  cothu: {
    key: "cothu",
    module: null,
    title: { en: "Cờ Thú (Jungle Chess)", vi: "Cờ Thú" },
    sideA: { key: "top", label: { en: "Red", vi: "Đỏ" } },
    sideB: { key: "bottom", label: { en: "Yellow", vi: "Vàng" } },
    firstTurn: "top",
    boardMode: "cothu",
    bottomSide: "bottom",
    colors: { a: "var(--ct-red)", aGlow: "var(--ct-red-glow)", b: "var(--ct-yellow)", bGlow: "var(--ct-yellow-glow)" }
  },
  chess: {
    key: "chess",
    module: null,
    title: { en: "Chess", vi: "Cờ Vua" },
    sideA: { key: "white", label: { en: "White", vi: "Trắng" } },
    sideB: { key: "black", label: { en: "Black", vi: "Đen" } },
    firstTurn: "white",
    boardMode: "chess",
    bottomSide: "white",
    colors: { a: "var(--white-pc)", aGlow: "var(--white-glow)", b: "var(--black-pc)", bGlow: "var(--black-glow)" }
  }
};

let activeGame = "kap";

function G() { return GAMES[activeGame]; }
function currentModule() { return G().module; }
function otherSide(side) { return currentModule().other(side); }

function wireGameModules() {
  GAMES.kap.module = KAP;
  GAMES.checkers.module = CK;
  GAMES.cothu.module = CT;
  GAMES.chess.module = CHESS;
}
