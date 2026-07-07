import { describe, expect, test, mock, afterEach } from "bun:test";
import { checkFreeDiskSpace } from "./disk.ts";
import { JellyError } from "./errors.ts";

const mockStatfs = mock();
const mockT = mock((key: string, ...args: unknown[]) => {
  return `${key}: ${args.join(", ")}`;
});

mock.module("fs", () => ({
  promises: {
    statfs: mockStatfs,
  },
}));

mock.module("./i18n.ts", () => ({
  t: mockT,
}));

describe("utils/disk.ts", () => {
  afterEach(() => {
    mockStatfs.mockReset();
    mockT.mockClear();
  });

  test("should resolve when there is sufficient free disk space", async () => {
    mockStatfs.mockResolvedValue({
      bavail: BigInt(100),
      bsize: BigInt(1024),
    });

    await expect(
      checkFreeDiskSpace("/dummy/path", 50000),
    ).resolves.toBeUndefined();
    expect(mockStatfs).toHaveBeenCalledWith("/dummy/path");
  });

  test("should throw JellyError when free disk space is insufficient", async () => {
    mockStatfs.mockResolvedValue({
      bavail: BigInt(10),
      bsize: BigInt(1024),
    });

    await expect(checkFreeDiskSpace("/dummy/path", 50000)).rejects.toThrow(
      new JellyError(
        "errorDiskSpace: 0.05 MB, 0.01 MB",
        "INSUFFICIENT_DISK_SPACE",
      ),
    );
  });

  test("should throw JellyError with failure code when statfs fails", async () => {
    mockStatfs.mockRejectedValue(new Error("Permission denied"));

    await expect(checkFreeDiskSpace("/dummy/path", 50000)).rejects.toThrow(
      new JellyError(
        "Failed to verify disk space: Permission denied",
        "DISK_SPACE_CHECK_FAILED",
      ),
    );
  });
});
