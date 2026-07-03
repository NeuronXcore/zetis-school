import { describe, expect, it } from "vitest";
import { type ChapterSource, type ChapterValidationStatus } from "@zetis/types";
import { chapterActions } from "./chapterActions";

// Test-verrou de l'UI : la règle ADR-0009 §3 « quelles actions pour quel état »,
// couverte exhaustivement (2 sources × 3 statuts de validation).

const SOURCES: ChapterSource[] = ["generated", "manual"];
const STATUSES: ChapterValidationStatus[] = ["pending", "validated", "rejected"];

describe("chapterActions", () => {
  it("Valider / Rejeter uniquement sur pending", () => {
    for (const source of SOURCES) {
      for (const status of STATUSES) {
        const a = chapterActions(source, status);
        expect(a.canValidate).toBe(status === "pending");
        expect(a.canReject).toBe(status === "pending");
      }
    }
  });

  it("Régénérer uniquement sur un chapitre IA rejeté", () => {
    for (const source of SOURCES) {
      for (const status of STATUSES) {
        const a = chapterActions(source, status);
        expect(a.canRegenerate).toBe(source === "generated" && status === "rejected");
      }
    }
  });

  it("édition et suppression partout", () => {
    for (const source of SOURCES) {
      for (const status of STATUSES) {
        const a = chapterActions(source, status);
        expect(a.canEdit).toBe(true);
        expect(a.canDelete).toBe(true);
      }
    }
  });

  it("manuel ou validé = intouchable par la régénération", () => {
    for (const source of SOURCES) {
      for (const status of STATUSES) {
        const a = chapterActions(source, status);
        expect(a.untouchedByRegeneration).toBe(source === "manual" || status === "validated");
      }
    }
  });
});
