import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { JournalMediaDto } from "@kidcom/shared";

import { GalleryThumb } from "./MediaGalleryPage";

// Post-launch backlog Phase J, revisited — the Android "can't select in
// Media" bug. The first attempt (preventDefault on pointerdown) didn't
// actually fix it: Android Chrome's native long-press-on-image menu (save/
// open/copy) is tied to the presence of a real <img> element at the touch
// point, not to pointer-events CSS or to how our own JS handlers are
// wired — a real <img> is "an image the user might want to save" to
// Chrome's UI shell regardless of preventDefault. The actual fix is
// rendering the thumbnail as a background-image on a plain <div> instead,
// which has no such native affordance on any platform. jsdom can't
// reproduce Android's native menu itself, so this proves both that no
// <img> exists to trigger it and that ordinary tap-to-select/open still
// works — regression coverage for the surrounding logic this fix touches.
vi.mock("../lib/media", () => ({
  fetchMediaUrl: vi.fn().mockResolvedValue("blob:mock-url"),
}));

const mockItem: JournalMediaDto = {
  id: "m1",
  type: "IMAGE",
  status: "READY",
  width: 800,
  height: 600,
  postId: "p1",
  postCreatedAt: "2026-01-01T00:00:00.000Z",
  childIds: ["c1"],
};

describe("GalleryThumb — Android long-press fix (Phase J)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the thumbnail as a background-image, not a real <img> — the actual fix, since Android's native long-press menu targets <img> elements regardless of preventDefault", async () => {
    const onToggleSelect = vi.fn();
    const onOpen = vi.fn();
    const { container } = render(
      <GalleryThumb item={mockItem} selected={false} hasSelection={false} onToggleSelect={onToggleSelect} onOpen={onOpen} />
    );

    await waitFor(() => {
      const thumb = container.querySelector('[role="img"]') as HTMLElement | null;
      expect(thumb?.style.backgroundImage).toContain("blob:mock-url");
    });
    expect(container.querySelector("img")).toBeNull();
  });

  it("calls preventDefault on pointerdown, suppressing the browser's native long-press handling", () => {
    const onToggleSelect = vi.fn();
    const onOpen = vi.fn();
    const { getByRole } = render(
      <GalleryThumb item={mockItem} selected={false} hasSelection={false} onToggleSelect={onToggleSelect} onOpen={onOpen} />
    );
    const thumb = getByRole("button");

    const event = new Event("pointerdown", { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    fireEvent(thumb, event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it("a plain tap (no long-press) still opens the item when nothing is selected", () => {
    const onToggleSelect = vi.fn();
    const onOpen = vi.fn();
    const { getByRole } = render(
      <GalleryThumb item={mockItem} selected={false} hasSelection={false} onToggleSelect={onToggleSelect} onOpen={onOpen} />
    );
    const thumb = getByRole("button");

    fireEvent.pointerDown(thumb);
    fireEvent.pointerUp(thumb);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it("a plain tap toggles selection instead of opening once a selection is already active", () => {
    const onToggleSelect = vi.fn();
    const onOpen = vi.fn();
    const { getByRole } = render(
      <GalleryThumb item={mockItem} selected={false} hasSelection={true} onToggleSelect={onToggleSelect} onOpen={onOpen} />
    );
    const thumb = getByRole("button");

    fireEvent.pointerDown(thumb);
    fireEvent.pointerUp(thumb);

    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
