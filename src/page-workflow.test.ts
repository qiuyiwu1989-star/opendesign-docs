import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { editPage, getPageTarget, type PageAction } from "./page-edit";
import { inspectSlides, patchPlacement } from "./slides";
import { patchBackgroundImage } from "./background-image";
import { alignmentPlacement } from "./object-arrange";
import { editHistory, historyOf, moveHistory } from "./history";
import { listDocuments, loadDraft, saveDocument, saveDraft } from "./store";

const fixtureUrl = new URL(
  "../tests/fixtures/QA-page-workflow.html",
  import.meta.url,
);
const source = readFileSync(fixtureUrl, "utf8");
const image = {
  dataUrl: `data:image/png;base64,${readFileSync(new URL("../tests/assets/icon-192.png", import.meta.url)).toString("base64")}`,
  width: 192,
  height: 192,
  alt: "Public QA icon",
};

describe("spec018 page, background and alignment persistence integration", () => {
  it("keeps every operation atomic and round-trips exact HTML through drafts, versions and export", async () => {
    const id = crypto.randomUUID();
    const original = {
      id,
      name: "QA page workflow.html",
      versions: [
        {
          id: "v1",
          source,
          label: "Original",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    await saveDocument(original);
    let history = historyOf(source);
    const apply = (next: string) => {
      const before = history.present;
      history = editHistory(history, next);
      const undone = moveHistory(history, "undo");
      expect(undone.present).toBe(before);
      expect(moveHistory(undone, "redo").present).toBe(next);
    };
    const page = (pageId: string, action: PageAction) => {
      const result = editPage(
        history.present,
        pageId,
        action,
        getPageTarget(history.present, pageId),
      );
      apply(result.source);
      return result.pageId;
    };

    const copiedId = page("page-0", "duplicate");
    expect(copiedId).toBe("page-1");
    expect(inspectSlides(history.present)).toHaveLength(3);
    expect(page(copiedId, "down")).toBe("page-2");
    page("page-0", "remove");
    expect(inspectSlides(history.present).map((p) => p.title)).toEqual([
      "第二页：交付成果",
      "第一页：整理思路",
    ]);

    const poster = inspectSlides(history.present)[1]!.objects.find(
      (o) => o.title === "背景图",
    )!;
    const oldBackground = poster.style.slice("background-image:".length);
    apply(patchBackgroundImage(history.present, poster, image, oldBackground));
    const backgroundOnly = history.present;
    const firstDraft = await saveDraft(
      {
        id,
        baseVersionId: "v1",
        source: backgroundOnly,
        revision: 1,
        updatedAt: new Date().toISOString(),
      },
      0,
    );
    expect((await loadDraft(id))?.source).toBe(backgroundOnly);

    const refreshedPoster = inspectSlides(history.present)[1]!.objects.find(
      (o) => o.title === "背景图",
    )!;
    // Public fixture has an untransformed 260px box at left 860 in a 1280px page.
    // Browser measurement is a separate acceptance gate; this verifies the source/persistence path.
    const aligned = alignmentPlacement(
      { x: 0, y: 0, scale: 1 },
      {
        left: 860,
        top: 180,
        width: 260,
        height: 260,
        pageWidth: 1280,
        pageHeight: 720,
      },
      "center",
    );
    expect(aligned).toEqual({ x: -350, y: 0, scale: 1 });
    apply(patchPlacement(history.present, refreshedPoster, aligned));
    const edited = history.present;
    expect(edited).toContain(
      "translate:-350px 0px!important;scale:1!important;",
    );
    expect(edited).toContain(image.dataUrl);
    expect(edited).toContain(source.match(/<style>[\s\S]*?<\/style>/)![0]);
    expect(edited).not.toMatch(
      /data-doc-object|data-doc-slide|Content-Security-Policy/,
    );
    await saveDraft(
      { ...firstDraft, source: edited, revision: firstDraft.revision + 1 },
      firstDraft.revision,
    );
    expect((await loadDraft(id))?.source).toBe(edited);
    expect((await listDocuments()).find((d) => d.id === id)).toEqual(original);

    const next = {
      ...original,
      versions: [
        ...original.versions,
        { ...original.versions[0]!, id: "v2", source: edited, label: "Edited" },
      ],
    };
    await saveDocument(next, "v1");
    expect(await loadDraft(id)).toBeNull();
    const reopened = (await listDocuments()).find((d) => d.id === id)!;
    expect(reopened.versions[0]!.source).toBe(source);
    expect(reopened.versions[1]!.source).toBe(edited);
    // Real native download is tested separately. The prepared export is original HTML, not a preview DOM.
    const exported = await new Blob([reopened.versions[1]!.source], {
      type: "text/html;charset=utf-8",
    }).text();
    expect(exported).toBe(edited);
    expect(inspectSlides(exported)).toHaveLength(2);
    expect(
      inspectSlides(exported)[1]!.objects.find((o) => o.title === "背景图")!
        .style,
    ).toContain(image.dataUrl);

    // Restoration appends a version; it does not replace either immutable snapshot.
    const restored = {
      ...reopened,
      versions: [
        ...reopened.versions,
        { ...original.versions[0]!, id: "v3", label: "Restored" },
      ],
    };
    await saveDocument(restored, "v2");
    expect(
      (await listDocuments())
        .find((d) => d.id === id)!
        .versions.map((v) => v.source),
    ).toEqual([source, edited, source]);
    while (history.past.length) history = moveHistory(history, "undo");
    expect(history.present).toBe(source);
    while (history.future.length) history = moveHistory(history, "redo");
    expect(history.present).toBe(edited);
    expect(readFileSync(fixtureUrl, "utf8")).toBe(source);
  });

  it("rejects stale page/background targets without advancing history or the saved draft", async () => {
    const id = crypto.randomUUID();
    await saveDocument({
      id,
      name: "QA stale target.html",
      versions: [
        {
          id: "v1",
          source,
          label: "Original",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const snapshot = getPageTarget(source, "page-0");
    const poster = inspectSlides(source)[0]!.objects.find(
      (o) => o.title === "背景图",
    )!;
    const moved = editPage(source, "page-0", "down");
    const history = editHistory(historyOf(source), moved.source);
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
    expect(() =>
      editPage(history.present, "page-0", "duplicate", snapshot),
    ).toThrow("页面已变化");
    expect(() =>
      patchBackgroundImage(
        history.present,
        poster,
        image,
        poster.style.slice("background-image:".length),
      ),
    ).toThrow("对象已变化");
    expect(history.past).toEqual([source]);
    expect(history.present).toBe(moved.source);
    expect((await loadDraft(id))?.source).toBe(moved.source);
  });
});
