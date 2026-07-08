import { describe, expect, test, mock, afterEach, spyOn, beforeAll, afterAll } from "bun:test";
import * as i18n from "./i18n.ts";
import { checkFreeDiskSpace } from "./disk.ts";
import { JellyError } from "./errors.ts";

const mockStatfs = mock();

mock.module("fs", () => ({
  promises: {
    statfs: mockStatfs,
  },
}));

describe("utils/disk.ts", () => {
  let spyT: any;

  beforeAll(() => {
    spyT = spyOn(i18n, "t").mockImplementation((key: string, ...args: unknown[]) => {
      return `${key}: ${args.join(", ")}`;
    });
  });

  afterAll(() => {
    spyT.mockRestore();
  });

  afterEach(() => {
    mockStatfs.mockReset();
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
