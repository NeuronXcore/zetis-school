import { describe, expect, it } from "vitest";
import {
  type ChapterSource,
  type ChapterValidationStatus,
  type LessonCreatedBy,
  type LessonStatus,
} from "@zetis/types";
import { chapterActions, lessonActions } from "./chapterActions";

// Test-verrou de l'UI : la règle ADR-0009 §3 « quelles actions pour quel état »,
// couverte exhaustivement (2 sources × 3 statuts côté chapitres,
// 3 created_by × 3 statuts côté leçons).

const SOURCES: ChapterSource[] = ["generated", "manual"];
const STATUSES: ChapterValidationStatus[] = ["pending", "validated", "rejected"];
const LESSON_CREATED_BY: LessonCreatedBy[] = ["parent", "ai", "imported"];
const LESSON_STATUSES: LessonStatus[] = ["draft", "validated", "archived"];

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

  it("Proposer des leçons uniquement si validé ou manuel (condition du 409 backend)", () => {
    for (const source of SOURCES) {
      for (const status of STATUSES) {
        const a = chapterActions(source, status);
        expect(a.canProposeLessons).toBe(source === "manual" || status === "validated");
      }
    }
  });
});

describe("lessonActions", () => {
  it("archived = invisible, toute autre leçon est affichée", () => {
    for (const createdBy of LESSON_CREATED_BY) {
      for (const status of LESSON_STATUSES) {
        const a = lessonActions(createdBy, status);
        expect(a.visible).toBe(status !== "archived");
      }
    }
  });

  it("Valider / Rejeter uniquement sur draft", () => {
    for (const createdBy of LESSON_CREATED_BY) {
      for (const status of LESSON_STATUSES) {
        const a = lessonActions(createdBy, status);
        expect(a.canValidate).toBe(status === "draft");
        expect(a.canReject).toBe(status === "draft");
      }
    }
  });

  it("édition et suppression sur toute leçon visible (donc jamais sur archived)", () => {
    for (const createdBy of LESSON_CREATED_BY) {
      for (const status of LESSON_STATUSES) {
        const a = lessonActions(createdBy, status);
        expect(a.canEdit).toBe(status !== "archived");
        expect(a.canDelete).toBe(status !== "archived");
      }
    }
  });
});
