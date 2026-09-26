/** The squad proposal (ADR-028): mix, rotation, borderline players, attendance. */
import { describe, expect, it } from "vitest";
import {
  belowAttendance,
  slotFill,
  suggestSquad,
  validateCallupSlots,
  type CallupCandidate,
} from "@fc-app/contracts";

// A scale with in-between steps, the way a team marks borderline players:
// 1 Extra lätt · 2 XL/L · 3 Lätt · 4 Lätt/Medel · 5 Medel
const XL = 1;
const LATT = 3;
const LM = 4;
const MEDEL = 5;

let seq = 0;
function player(
  firstName: string,
  level: number | null,
  extra: Partial<CallupCandidate> = {}
): CallupCandidate {
  seq += 1;
  return {
    memberId: `m${seq}-${firstName}`,
    firstName,
    lastName: "Testsson",
    level,
    attended: 8,
    marked: 10,
    attendanceRate: 80,
    matchesPlayed: 0,
    matchesAtThisLevel: 0,
    coachNames: [],
    ...extra,
  };
}

const names = (
  candidates: CallupCandidate[],
  ids: { memberId: string }[]
): string[] =>
  ids.map(
    (one) => candidates.find((c) => c.memberId === one.memberId)?.firstName ?? "?"
  );

describe("suggestSquad", () => {
  it("fills each slot from the levels it lists", () => {
    const squad = [
      player("Astrid", LATT),
      player("Bo", LATT),
      player("Cleo", MEDEL),
      player("Dan", XL),
    ];
    const result = suggestSquad(
      squad,
      [
        { count: 2, levels: [LATT] },
        { count: 1, levels: [MEDEL] },
        { count: 1, levels: [XL] },
      ],
      null
    );
    expect(result.picked).toEqual([
      { memberId: squad[0]!.memberId, slotIndex: 0 },
      { memberId: squad[1]!.memberId, slotIndex: 0 },
      { memberId: squad[2]!.memberId, slotIndex: 1 },
      { memberId: squad[3]!.memberId, slotIndex: 2 },
    ]);
    expect(result.unfilled).toEqual([]);
  });

  it("rotates: the player with fewest matches goes first", () => {
    const squad = [
      player("Astrid", LATT, { matchesPlayed: 4 }),
      player("Bo", LATT, { matchesPlayed: 1 }),
      player("Cleo", LATT, { matchesPlayed: 2 }),
    ];
    const result = suggestSquad(squad, [{ count: 2, levels: [LATT] }], null);
    expect(names(squad, result.picked)).toEqual(["Bo", "Cleo"]);
  });

  it("moves a borderline player towards the level they have played less", () => {
    // Same number of matches overall; Ebba has already played two at this
    // level, Frans none, so Frans gets this one.
    const squad = [
      player("Ebba", LM, { matchesPlayed: 3, matchesAtThisLevel: 2 }),
      player("Frans", LM, { matchesPlayed: 3, matchesAtThisLevel: 0 }),
    ];
    const result = suggestSquad(
      squad,
      [{ count: 1, levels: [LATT, LM] }],
      null
    );
    expect(names(squad, result.picked)).toEqual(["Frans"]);
  });

  it("fills the tightest slot first so a wide slot does not take its only players", () => {
    // Listed first, the wide Lätt slot would grab the borderline Greta and
    // leave Medel one short. Filled tightest-first, both slots fill.
    const squad = [
      player("Greta", LM, { matchesPlayed: 0 }),
      player("Holger", LATT, { matchesPlayed: 1 }),
      player("Ines", MEDEL, { matchesPlayed: 1 }),
    ];
    const result = suggestSquad(
      squad,
      [
        { count: 1, levels: [LATT, LM] },
        { count: 2, levels: [LM, MEDEL] },
      ],
      null
    );
    expect(result.unfilled).toEqual([]);
    expect(
      result.picked.filter((one) => one.slotIndex === 1).map((one) => one.memberId)
    ).toEqual(expect.arrayContaining([squad[0]!.memberId, squad[2]!.memberId]));
    expect(result.picked).toContainEqual({
      memberId: squad[1]!.memberId,
      slotIndex: 0,
    });
  });

  it("leaves out players below the attendance threshold, and says why", () => {
    const squad = [
      player("Jon", LATT, { attended: 5, marked: 10, attendanceRate: 50 }),
      player("Kim", LATT, { attended: 7, marked: 10, attendanceRate: 70 }),
    ];
    const result = suggestSquad(squad, [{ count: 2, levels: [LATT] }], 60);
    expect(names(squad, result.picked)).toEqual(["Kim"]);
    expect(result.excluded).toEqual([
      { memberId: squad[0]!.memberId, reason: "lowAttendance" },
    ]);
    expect(result.unfilled).toEqual([{ slotIndex: 0, missing: 1 }]);
  });

  it("leaves out players with no level", () => {
    const squad = [player("Lo", null)];
    const result = suggestSquad(squad, [{ count: 1, levels: [LATT] }], null);
    expect(result.excluded).toEqual([
      { memberId: squad[0]!.memberId, reason: "noLevel" },
    ]);
  });

  it("never places one player in two slots", () => {
    const squad = [player("Mo", LM)];
    const result = suggestSquad(
      squad,
      [
        { count: 1, levels: [LM] },
        { count: 1, levels: [LM] },
      ],
      null
    );
    expect(result.picked).toHaveLength(1);
    expect(result.unfilled).toHaveLength(1);
  });
});

describe("suggestSquad — coach children", () => {
  const coach = (name: string) => ({ coachNames: [name] });

  it("takes a coach child even when rotation alone would not", () => {
    // Olle has played the most, so plain rotation would leave him out — but
    // he is the only coach child, and without him nobody coaches the match.
    const squad = [
      player("Astrid", LATT, { matchesPlayed: 0 }),
      player("Bo", LATT, { matchesPlayed: 0 }),
      player("Olle", LATT, { matchesPlayed: 9, ...coach("Karin") }),
    ];
    const result = suggestSquad(squad, [{ count: 2, levels: [LATT] }], null, 1);
    expect(names(squad, result.picked)).toContain("Olle");
    expect(result.picked).toHaveLength(2);
    expect(result.coachChildrenMissing).toBe(0);
  });

  it("rotates between coaching families", () => {
    const squad = [
      player("Astrid", LATT),
      player("Olle", LATT, { matchesPlayed: 5, ...coach("Karin") }),
      player("Pia", LATT, { matchesPlayed: 3, ...coach("Per") }),
    ];
    const result = suggestSquad(squad, [{ count: 2, levels: [LATT] }], null, 1);
    expect(names(squad, result.picked)).toEqual(
      expect.arrayContaining(["Pia", "Astrid"])
    );
  });

  it("still respects the mix and the attendance threshold", () => {
    const squad = [
      player("Olle", MEDEL, coach("Karin")),
      player("Pia", LATT, { ...coach("Per"), attendanceRate: 20, marked: 10 }),
      player("Astrid", LATT),
    ];
    // Olle's level has no slot, Pia trains too little: nobody can coach.
    const result = suggestSquad(squad, [{ count: 1, levels: [LATT] }], 60, 1);
    expect(names(squad, result.picked)).toEqual(["Astrid"]);
    expect(result.coachChildrenMissing).toBe(1);
  });

  it("changes nothing when rotation already brings a coach child", () => {
    // Pia is picked on her own merits, so Olle — the coach child at a level
    // with few places, and so few matches — is not dragged in as well.
    const squad = [
      player("Pia", LATT, { matchesPlayed: 2, ...coach("Per") }),
      player("Astrid", LATT, { matchesPlayed: 2 }),
      player("Olle", MEDEL, { matchesPlayed: 0, ...coach("Karin") }),
      player("Bo", MEDEL, { matchesPlayed: 1 }),
    ];
    const result = suggestSquad(
      squad,
      [
        { count: 2, levels: [LATT] },
        { count: 1, levels: [MEDEL] },
      ],
      null,
      1
    );
    expect(names(squad, result.picked).sort()).toEqual(["Astrid", "Olle", "Pia"]);
    const withBo = suggestSquad(
      [...squad.slice(0, 2), { ...squad[2]!, matchesPlayed: 5 }, squad[3]!],
      [
        { count: 2, levels: [LATT] },
        { count: 1, levels: [MEDEL] },
      ],
      null,
      1
    );
    expect(names(squad, withBo.picked).sort()).toEqual(["Astrid", "Bo", "Pia"]);
  });

  it("brings in the coach child closest to being picked, in place of the weakest claim", () => {
    const squad = [
      player("Astrid", LATT, { matchesPlayed: 1 }),
      player("Bo", LATT, { matchesPlayed: 2 }),
      player("Olle", LATT, { matchesPlayed: 3, ...coach("Karin") }),
      player("Pia", LATT, { matchesPlayed: 8, ...coach("Per") }),
    ];
    const result = suggestSquad(squad, [{ count: 2, levels: [LATT] }], null, 1);
    // Olle (3) is nearer the cut than Pia (8); he replaces Bo, the last in.
    expect(names(squad, result.picked).sort()).toEqual(["Astrid", "Olle"]);
  });

  it("uses a place nobody could fill before taking one from a player", () => {
    const squad = [
      player("Astrid", LATT),
      player("Olle", MEDEL, { matchesPlayed: 9, ...coach("Karin") }),
    ];
    const result = suggestSquad(
      squad,
      [
        { count: 1, levels: [LATT] },
        { count: 1, levels: [MEDEL, 99] },
      ],
      null,
      1
    );
    expect(names(squad, result.picked)).toEqual(["Astrid", "Olle"]);
    expect(result.unfilled).toEqual([]);
  });

  it("asks for nothing when the requirement is zero", () => {
    const squad = [player("Olle", LATT, coach("Karin")), player("Astrid", LATT)];
    const result = suggestSquad(squad, [{ count: 1, levels: [LATT] }], null);
    expect(result.coachChildrenMissing).toBe(0);
  });
});

describe("belowAttendance", () => {
  it("treats too few marked sessions as unknown, not low", () => {
    expect(
      belowAttendance({ attendanceRate: 0, marked: 2 }, 60)
    ).toBe(false);
    expect(
      belowAttendance({ attendanceRate: 50, marked: 3 }, 60)
    ).toBe(true);
    expect(belowAttendance({ attendanceRate: 50, marked: 10 }, null)).toBe(
      false
    );
  });
});

describe("slotFill", () => {
  it("counts a hand-picked squad against the mix, attendance aside", () => {
    const squad = [
      player("Nore", LATT, { attendanceRate: 10, marked: 10 }),
      player("Olle", MEDEL),
      player("Pia", XL),
    ];
    const result = slotFill(squad, [
      { count: 2, levels: [LATT] },
      { count: 1, levels: [MEDEL] },
    ]);
    expect(result.filled).toEqual([1, 1]);
    expect(result.unplaced).toEqual([squad[2]!.memberId]);
  });
});

describe("validateCallupSlots", () => {
  it("rejects a level outside the scale, and a repeated level", () => {
    const scale = { scaleMin: 1, scaleMax: 5 };
    expect(validateCallupSlots([{ count: 1, levels: [1, 5] }], scale)).toEqual({
      ok: true,
    });
    expect(validateCallupSlots([{ count: 1, levels: [6] }], scale).ok).toBe(
      false
    );
    expect(validateCallupSlots([{ count: 1, levels: [2, 2] }], scale).ok).toBe(
      false
    );
  });
});
