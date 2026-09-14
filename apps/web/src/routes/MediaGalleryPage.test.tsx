import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import type { JournalMediaDto } from "@kidcom/shared";

import { GalleryThumb } from "./MediaGalleryPage";

// Post-launch backlog Phase J — the Android "selected images automatically
// deselected" bug. Root cause: on Android Chrome, a touch-and-hold over an
// <img> can trigger the browser's own native long-press handling (image
// save/open/copy menu) concurrently with this component's own JS long-press
// timer — neither pointer-events:none on the <img> nor touch-action:
// manipulation on the container suppresses that native gesture specifically.
// jsdom can't reproduce the native Android menu itself, so this proves the
// actual fix (preventDefault on pointerdown, which is what suppresses it)
// is wired up, plus that ordinary tap-to-select/open still works —
// regression coverage for the surrounding logic this fix touches.
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
