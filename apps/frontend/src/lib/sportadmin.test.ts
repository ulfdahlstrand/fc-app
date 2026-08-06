/**
 * Reading a SportAdmin export (#63), against the real header row and two real
 * sample rows. The header names are not unique, so every one of these would
 * pass with a parser that is quietly wrong — which is the point of pinning
 * them.
 */
import { describe, expect, it } from "vitest";
import {
  parseSheet,
  planColumns,
  toImportRow,
  toImportRows,
} from "./sportadmin";

/** Verbatim from an export, including the three `E-post` columns. */
const HEADER = [
  "Grupp",
  "Gruppkoppling",
  "Kommentar",
  "Personnummer",
  "Kön",
  "Förnamn",
  "Efternamn",
  "c/o",
  "Adress",
  "Postnummer",
  "Stad",
  "Land",
  "Mobiltelefon",
  "Telefon hem",
  "Telefon jobb",
  "E-post",
  "Målsman 1",
  "Relation",
  "E-post",
  "Telefon",
  "Målsman 2",
  "Relation",
  "E-post",
  "Telefon",
  "Skapad",
  "Uppdaterad",
  "Licens",
  "Grupprekommendation",
  "Övrigt",
  "Medlems Nr",
  "Start År",
  "Allergi",
];

const PLAYER = [
  "P 17:4",
  "Spelare",
  "Kläder: 152-152-31/33",
  "20170314-2412",
  "Man",
  "Ture",
  "Dahlstrand",
  "",
  "Oxelvägen 24",
  "14141",
  "HUDDINGE",
  "Sverige",
  "",
  "",
  "",
  "ulf.d.dahlstrand@gmail.com",
  "My Dahlstrand",
  "Mamma",
  "my.dahlstrand@gmail.com",
  "0761414220",
  "Ulf Dahlstrand",
  "Pappa",
  "ulf.d.dahlstrand@gmail.com",
  "0700838161",
  "2021-11-22 10:21:58",
  "2026-02-18 15:29:24",
  "",
  "",
  "",
  "",
  "",
  "",
];

const COACH = [
  "P 17:4",
  "Tränare",
  "",
  "19850822-3578",
  "Man",
  "Ulf",
  "Dahlstrand",
  "",
  "Oxelvägen 24",
  "14141",
  "HUDDINGE",
  "Sverige",
  "0700838161",
  "",
  "",
  "ulf.d.dahlstrand@gmail.com",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "2022-03-09 13:08:06",
  "2025-12-22 16:26:32",
  "",
  "",
  "",
  "",
  "",
  "",
];

const SHEET = [HEADER, PLAYER, COACH];

function planFor(header: string) {
  const plans = planColumns(HEADER, [PLAYER, COACH]);
  return plans.filter((plan) => plan.header === header);
}

describe("planColumns", () => {
  it("reads the three E-post columns as three different things", () => {
    const [member, first, second] = planFor("E-post");
    expect(member?.target).toEqual({ kind: "builtin", field: "email" });
    expect(first?.target).toEqual({
      kind: "contact",
      index: 1,
      field: "email",
    });
    expect(second?.target).toEqual({
      kind: "contact",
      index: 2,
      field: "email",
    });
  });

  it("assigns Relation and Telefon to the guardian block they follow", () => {
    const [firstRelation, secondRelation] = planFor("Relation");
    expect(firstRelation?.target).toEqual({
      kind: "contact",
      index: 1,
      field: "relation",
    });
    expect(secondRelation?.target).toEqual({
      kind: "contact",
      index: 2,
      field: "relation",
    });
  });

  it("closes the guardian block on the next unrelated header", () => {
    // Skapad follows Målsman 2's Telefon and must not be read as a guardian's.
    expect(planFor("Skapad")[0]?.target).toEqual({ kind: "skip" });
    expect(planFor("Medlems Nr")[0]?.target).toEqual({
      kind: "builtin",
      field: "externalRef",
    });
  });

  it("maps the member's own fields", () => {
    expect(planFor("Förnamn")[0]?.target).toEqual({
      kind: "builtin",
      field: "firstName",
    });
    expect(planFor("Personnummer")[0]?.target).toEqual({
      kind: "builtin",
      field: "personalId",
    });
    expect(planFor("Gruppkoppling")[0]?.target).toEqual({
      kind: "builtin",
      field: "group",
    });
  });

  it("turns unknown columns into custom fields", () => {
    expect(planFor("Kommentar")[0]?.target).toEqual({
      kind: "custom",
      name: "Kommentar",
    });
    expect(planFor("Kommentar")[0]?.enabled).toBe(true);
  });

  it("leaves addresses and Kön off until asked for", () => {
    expect(planFor("Adress")[0]?.enabled).toBe(false);
    expect(planFor("Kön")[0]?.enabled).toBe(false);
  });

  it("marks Allergi sensitive and off", () => {
    const allergi = planFor("Allergi")[0];
    expect(allergi?.sensitive).toBe(true);
    expect(allergi?.enabled).toBe(false);
  });

  it("notes columns that are blank in every row", () => {
    expect(planFor("Licens")[0]?.empty).toBe(true);
    expect(planFor("Förnamn")[0]?.empty).toBe(false);
  });
});

describe("toImportRow", () => {
  const plans = planColumns(HEADER, [PLAYER, COACH]);

  it("keeps the member's own e-mail, not a guardian's", () => {
    const row = toImportRow(PLAYER, plans, 2);
    expect(row?.email).toBe("ulf.d.dahlstrand@gmail.com");
    expect(row?.firstName).toBe("Ture");
    expect(row?.lastName).toBe("Dahlstrand");
    expect(row?.personalId).toBe("20170314-2412");
  });

  it("reads both guardians with their relations and numbers", () => {
    const row = toImportRow(PLAYER, plans, 2);
    expect(row?.contacts).toEqual([
      {
        name: "My Dahlstrand",
        relation: "Mamma",
        email: "my.dahlstrand@gmail.com",
        phone: "0761414220",
      },
      {
        name: "Ulf Dahlstrand",
        relation: "Pappa",
        email: "ulf.d.dahlstrand@gmail.com",
        phone: "0700838161",
      },
    ]);
  });

  it("gives a player with no phone of their own none", () => {
    expect(toImportRow(PLAYER, plans, 2)?.phone).toBeNull();
  });

  it("prefers the mobile number", () => {
    expect(toImportRow(COACH, plans, 3)?.phone).toBe("0700838161");
  });

  it("leaves an empty Målsman block out rather than inventing a contact", () => {
    expect(toImportRow(COACH, plans, 3)?.contacts).toEqual([]);
  });

  it("turns Gruppkoppling into a group", () => {
    expect(toImportRow(PLAYER, plans, 2)?.groups).toEqual(["Spelare"]);
    expect(toImportRow(COACH, plans, 3)?.groups).toEqual(["Tränare"]);
  });

  it("carries enabled custom fields and drops the rest", () => {
    const row = toImportRow(PLAYER, plans, 2);
    expect(row?.customFields).toEqual({ Kommentar: "Kläder: 152-152-31/33" });
    expect(row?.customFields["Adress"]).toBeUndefined();
    expect(row?.customFields["Allergi"]).toBeUndefined();
  });

  it("skips a row with no name at all", () => {
    const blank = HEADER.map(() => "");
    expect(toImportRow(blank, plans, 9)).toBeNull();
  });
});

describe("parseSheet / toImportRows", () => {
  it("collects the distinct Grupp values", () => {
    expect(parseSheet(SHEET).teamNames).toEqual(["P 17:4"]);
  });

  it("numbers rows the way the file does", () => {
    const sheet = parseSheet(SHEET);
    const rows = toImportRows(sheet, sheet.plans);
    expect(rows.map((row) => row.rowNumber)).toEqual([2, 3]);
  });
});

describe("SportAdmin's internal member id", () => {
  /**
   * A different namespace from `Medlems Nr` — the two do not join, so they
   * are recorded under different sources (#89). Deriving it into the export
   * is what lets the attendance import stop trusting names.
   */
  it("is read from its own column", () => {
    const sheet = parseSheet([
      ["Förnamn", "Efternamn", "Medlems Nr", "SportAdmin-id"],
      ["Ture", "Dahlstrand", "4711", "4214437"],
    ]);
    const row = toImportRow(sheet.rows[0]!, sheet.plans, 2);
    expect(row).toMatchObject({
      externalRef: "4711",
      sportAdminId: "4214437",
    });
  });

  it("is null when the export has no such column", () => {
    const sheet = parseSheet([
      ["Förnamn", "Efternamn"],
      ["Ture", "Dahlstrand"],
    ]);
    expect(
      toImportRow(sheet.rows[0]!, sheet.plans, 2)?.sportAdminId,
    ).toBeNull();
  });
});
