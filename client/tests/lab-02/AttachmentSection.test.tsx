import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as attachmentsApi from "../../src/api/attachments.js";
import { ApiError } from "../../src/api/client.js";
import AttachmentSection from "../../src/components/AttachmentSection.js";

// UI-17 … UI-20 — docs/lab-02/tests.md §2.3

function attachment(overrides: Partial<attachmentsApi.Attachment> = {}): attachmentsApi.Attachment {
  return {
    id: 9,
    ticketId: 42,
    originalFilename: "battery-report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 184320,
    uploadedAt: "2026-08-12T04:20:10.004Z",
    uploadedBy: { id: 1, name: "Napat Srisai" },
    state: "ACTIVE",
    ...overrides,
  };
}

function pngFile(name = "screenshot.png", size = 1024) {
  const file = new File([new Uint8Array(size)], name, { type: "image/png" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

/** Renders the section with state, the way Ticket Detail owns it. */
function Harness({ initial }: { initial: attachmentsApi.Attachment[] }) {
  const [items, setItems] = useState(initial);
  return <AttachmentSection ticketId={42} attachments={items} onChange={setItems} />;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Attachment section", () => {
  // UI-17 / AC-27
  it("adds a successfully uploaded file to the list as Active", async () => {
    const uploaded = attachment({ id: 10, originalFilename: "screenshot.png", mimeType: "image/png" });
    const spy = vi.spyOn(attachmentsApi, "uploadAttachment").mockResolvedValue(uploaded);

    render(<Harness initial={[]} />);

    expect(screen.getByText(/no attachments yet/i)).toBeInTheDocument();

    await userEvent.upload(document.querySelector("#attachmentFile") as HTMLInputElement, pngFile());

    expect(await screen.findByText("screenshot.png")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText(/1 of 5 active attachments/i)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(42, expect.any(File));
  });

  // UI-17 / AC-14, BR-31 — client-side type rule before any request
  it("rejects a disallowed file type without calling the API", async () => {
    const spy = vi.spyOn(attachmentsApi, "uploadAttachment");

    render(<Harness initial={[]} />);

    // The accept attribute filters the picker, so a file chosen through "All
    // files" is simulated directly — that is what the guard has to catch.
    fireEvent.change(document.querySelector("#attachmentFile") as HTMLInputElement, {
      target: { files: [new File(["MZ"], "setup.exe", { type: "application/x-msdownload" })] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/only jpg, png, webp and pdf/i);
    expect(spy).not.toHaveBeenCalled();
  });

  // UI-17 / AC-14, BR-32 — client-side size rule before any request
  it("rejects a file larger than 5 MB without calling the API", async () => {
    const spy = vi.spyOn(attachmentsApi, "uploadAttachment");

    render(<Harness initial={[]} />);

    await userEvent.upload(
      document.querySelector("#attachmentFile") as HTMLInputElement,
      pngFile("huge.png", 6 * 1024 * 1024)
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/5 mb or smaller/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it("surfaces an upload failure from the API", async () => {
    vi.spyOn(attachmentsApi, "uploadAttachment").mockRejectedValue(
      new ApiError(409, "A ticket can have at most 5 active attachments")
    );

    render(<Harness initial={[]} />);
    await userEvent.upload(document.querySelector("#attachmentFile") as HTMLInputElement, pngFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(/at most 5 active attachments/i);
  });

  // UI-18 / AC-28
  it("disables Add and explains why once five attachments are active", () => {
    const five = Array.from({ length: 5 }, (_, i) =>
      attachment({ id: i + 1, originalFilename: `evidence-${i}.png` })
    );

    render(<Harness initial={five} />);

    expect(screen.getByRole("button", { name: /add attachment/i })).toBeDisabled();
    expect(screen.getByText(/already has 5 active attachments/i)).toBeInTheDocument();
    expect(screen.getByText(/5 of 5 active attachments/i)).toBeInTheDocument();
  });

  // UI-19 / AC-30, AC-34, BR-37
  it("requires a confirmation and a reason before removing", async () => {
    const removeSpy = vi.spyOn(attachmentsApi, "removeAttachment").mockResolvedValue(
      attachment({
        state: "REMOVED",
        removedAt: "2026-08-12T06:00:00.000Z",
        removalReason: "Uploaded the wrong file",
        removedBy: { id: 1, name: "Napat Srisai" },
      })
    );

    render(<Harness initial={[attachment()]} />);

    await userEvent.click(screen.getByRole("button", { name: /remove battery-report\.pdf/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/stays visible as metadata/i);

    // Too short: blocked before any request.
    await userEvent.type(screen.getByLabelText(/^Reason/), "ab");
    await userEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    expect(screen.getByText(/reason must be at least 3 characters/i)).toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText(/^Reason/));
    await userEvent.type(screen.getByLabelText(/^Reason/), "Uploaded the wrong file");
    await userEvent.click(screen.getByRole("button", { name: /^remove$/i }));

    await waitFor(() => expect(removeSpy).toHaveBeenCalledWith(9, "Uploaded the wrong file"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the removal dialog on Cancel without removing anything", async () => {
    const removeSpy = vi.spyOn(attachmentsApi, "removeAttachment");

    render(<Harness initial={[attachment()]} />);

    await userEvent.click(screen.getByRole("button", { name: /remove battery-report\.pdf/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  // UI-20 / AC-31, BR-39
  it("keeps a removed attachment visible with its reason and blocks its download", () => {
    render(
      <Harness
        initial={[
          attachment({
            state: "REMOVED",
            removedAt: "2026-08-12T06:00:00.000Z",
            removalReason: "Uploaded the wrong file",
            removedBy: { id: 1, name: "Napat Srisai" },
          }),
        ]}
      />
    );

    expect(screen.getByText("battery-report.pdf")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.getByText(/uploaded the wrong file/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download battery-report\.pdf/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /remove battery-report\.pdf/i })).toBeDisabled();
    expect(screen.getByText(/0 of 5 active attachments/i)).toBeInTheDocument();
  });

  // AC-29
  it("downloads an active attachment through the API layer", async () => {
    const spy = vi.spyOn(attachmentsApi, "downloadAttachment").mockResolvedValue(undefined);

    render(<Harness initial={[attachment()]} />);

    await userEvent.click(screen.getByRole("button", { name: /download battery-report\.pdf/i }));

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });

  it("reports a failed download without breaking the list", async () => {
    vi.spyOn(attachmentsApi, "downloadAttachment").mockRejectedValue(
      new ApiError(410, "This attachment has been removed")
    );

    render(<Harness initial={[attachment()]} />);
    await userEvent.click(screen.getByRole("button", { name: /download battery-report\.pdf/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/has been removed/i);
    expect(screen.getByText("battery-report.pdf")).toBeInTheDocument();
  });
});
