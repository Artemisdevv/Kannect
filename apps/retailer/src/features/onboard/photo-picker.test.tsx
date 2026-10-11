import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MAX_PHOTOS, PhotoPicker } from "./photo-picker";

const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });

describe("PhotoPicker", () => {
  it("offers the camera on its own input: capture set, not multiple (multiple turns capture off on Android)", () => {
    render(<PhotoPicker files={[]} onChange={vi.fn()} />);
    const camera = screen.getByTestId("camera-input") as HTMLInputElement;
    expect(camera.getAttribute("capture")).toBe("environment");
    expect(camera.multiple).toBe(false);
    expect(camera.accept).toBe("image/*");
  });

  it("offers the gallery on a separate input that allows several photos", () => {
    render(<PhotoPicker files={[]} onChange={vi.fn()} />);
    const gallery = screen.getByTestId("gallery-input") as HTMLInputElement;
    expect(gallery.multiple).toBe(true);
    expect(gallery.hasAttribute("capture")).toBe(false);
  });

  it("adds a camera photo to the ones already chosen", () => {
    const onChange = vi.fn();
    const a = photo("a.jpg");
    render(<PhotoPicker files={[a]} onChange={onChange} />);
    const b = photo("b.jpg");
    fireEvent.change(screen.getByTestId("camera-input"), { target: { files: [b] } });
    expect(onChange).toHaveBeenCalledWith([a, b]);
  });

  it("never keeps more than the maximum", () => {
    const onChange = vi.fn();
    const existing = Array.from({ length: MAX_PHOTOS - 1 }, (_, i) => photo(`e${i}.jpg`));
    render(<PhotoPicker files={existing} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("gallery-input"), { target: { files: [photo("x.jpg"), photo("y.jpg")] } });
    const next = onChange.mock.calls[0]![0] as File[];
    expect(next).toHaveLength(MAX_PHOTOS);
    expect(next.at(-1)!.name).toBe("x.jpg");
  });

  it("shows how many photos are chosen and lets one be removed", () => {
    const onChange = vi.fn();
    const a = photo("a.jpg");
    const b = photo("b.jpg");
    render(<PhotoPicker files={[a, b]} onChange={onChange} />);
    expect(screen.getByText("2 photos selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove a.jpg" }));
    expect(onChange).toHaveBeenCalledWith([b]);
  });
});
