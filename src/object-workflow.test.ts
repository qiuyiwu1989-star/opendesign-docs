import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { slideDemo } from "./demo";
import { inspectSlides, patchPlacement } from "./slides";
import {
  duplicateObject,
  removeObject,
  patchObjectTextStyle,
} from "./object-edit";
import { editHistory, historyOf, moveHistory } from "./history";
import { listDocuments, loadDraft, saveDocument, saveDraft } from "./store";

describe("spec017 editing persistence integration", () => {
  it("keeps each object operation reversible and saves exact source, not preview markup", async () => {
    const id = crypto.randomUUID();
    const original = {
      id,
      name: "QA object workflow.html",
      versions: [
        {
          id: "v1",
          source: slideDemo,
          createdAt: new Date().toISOString(),
          label: "Original",
        },
      ],
    };
    await saveDocument(original);
    let history = historyOf(slideDemo);
    const target = inspectSlides(history.present)[0]!.objects.find(
      (o) => o.tag === "h1",
    )!;
    const copy = duplicateObject(history.present, target);
    history = editHistory(history, copy.source);
    expect(moveHistory(history, "undo").present).toBe(slideDemo);
    const copied = inspectSlides(history.present)[0]!.objects.find(
      (o) => o.id === copy.objectId,
    )!;
    history = editHistory(
      history,
      patchObjectTextStyle(history.present, copied, {
        fontSize: 44,
        color: "#135790",
        align: "center",
      }),
    );
    const styled = history.present;
    const moved = inspectSlides(styled)[0]!.objects.find(
      (o) => o.id === copy.objectId,
    )!;
    history = editHistory(
      history,
      patchPlacement(styled, moved, { x: 0, y: 140, scale: 1 }),
    );
    const beforeDelete = history.present;
    history = editHistory(
      history,
      removeObject(
        history.present,
        inspectSlides(history.present)[0]!.objects.find(
          (o) => o.id === copy.objectId,
        )!,
      ),
    );
    expect(moveHistory(history, "undo").present).toBe(beforeDelete);
    expect(moveHistory(moveHistory(history, "undo"), "redo").present).toBe(
      history.present,
    );
    history = moveHistory(history, "undo");
    await saveDraft(
      {
        id,
        baseVersionId: "v1",
        source: history.present,
        revision: 1,
        updatedAt: new Date().toISOString(),
      },
      0,
    );
    expect((await loadDraft(id))?.source).toBe(beforeDelete);
    const next = {
      ...original,
      versions: [
        ...original.versions,
        { ...original.versions[0]!, id: "v2", source: history.present },
      ],
    };
    await saveDocument(next, "v1");
    expect(await loadDraft(id)).toBeNull();
    const reopened = (await listDocuments()).find((d) => d.id === id)!;
    expect(reopened.versions[0]!.source).toBe(slideDemo);
    expect(reopened.versions[1]!.source).toBe(beforeDelete);
    // Export uses this exact source string. Blob preparation is distinct from native download QA.
    expect(
      await new Blob([reopened.versions[1]!.source], {
        type: "text/html",
      }).text(),
    ).toBe(beforeDelete);
    expect(beforeDelete).not.toMatch(
      /data-doc-object|data-doc-slide|Content-Security-Policy/,
    );
    expect(inspectSlides(beforeDelete)).toHaveLength(2);
    expect(inspectSlides(beforeDelete)[0]!.objects).toHaveLength(5);
  });
});
