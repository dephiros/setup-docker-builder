import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { checkPreviousStepFailures, hasAnyStepFailed } from "./step-checker";

// Mock fs module
vi.mock("fs", () => ({
  promises: {
    access: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
}));

describe("Step failure checker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns no failures when _diag directory doesn't exist", async () => {
    // Mock container detection to return false
    vi.mocked(fs.access).mockRejectedValue(new Error("Directory not found"));
    vi.mocked(fs.readFile).mockImplementation((path) => {
      if (path === "/proc/1/cgroup") {
        return Promise.resolve("0::/\n"); // cgroup v2, non-container
      }
      return Promise.reject(new Error("File not found"));
    });

    const result = await checkPreviousStepFailures();

    expect(result.hasFailures).toBe(false);
    expect(result.failedCount).toBe(0);
    expect(result.error).toContain("_diag directory not found at");
  });

  it("returns no failures when no Worker log files exist", async () => {
    vi.mocked(fs.access).mockImplementation((path) => {
      if (path === "/.dockerenv") {
        return Promise.reject(new Error("Not found"));
      }
      return Promise.resolve(undefined);
    });
    vi.mocked(fs.readFile).mockImplementation((path) => {
      if (path === "/proc/1/cgroup") {
        return Promise.resolve("0::/\n"); // cgroup v2, non-container
      }
      return Promise.reject(new Error("File not found"));
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readdir).mockResolvedValue(["some-other-file.txt"] as any);

    const result = await checkPreviousStepFailures();

    expect(result.hasFailures).toBe(false);
    expect(result.failedCount).toBe(0);
    expect(result.error).toBe("No Worker log files found");
  });

  it("detects failed steps in JSON format", async () => {
    vi.mocked(fs.access).mockImplementation((path) => {
      if (path === "/.dockerenv") {
        return Promise.reject(new Error("Not found"));
      }
      return Promise.resolve(undefined);
    });
    const mockLogContent = `
    {"timestamp":"2024-01-01T12:00:00Z","result":"success","action":"setup"}
    {"timestamp":"2024-01-01T12:01:00Z","result":"failed","action":"build","stepName":"Build Docker image"}
    {"timestamp":"2024-01-01T12:02:00Z","result":"cancelled","action":"test"}
    `;
    vi.mocked(fs.readFile).mockImplementation((path) => {
      if (path === "/proc/1/cgroup") {
        return Promise.resolve("0::/\n");
      }
      return Promise.resolve(mockLogContent);
    });
    vi.mocked(fs.readdir).mockResolvedValue([
      "Worker_20240101-120000-utc.log",
      "Worker_20240101-110000-utc.log",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const result = await checkPreviousStepFailures();

    expect(result.hasFailures).toBe(true);
    expect(result.failedCount).toBe(2); // 1 failed + 1 cancelled
    expect(result.error).toBeUndefined();
  });

  it("detects failed steps in text format", async () => {
    vi.mocked(fs.access).mockImplementation((path) => {
      if (path === "/.dockerenv") {
        return Promise.reject(new Error("Not found"));
      }
      return Promise.resolve(undefined);
    });
    const mockLogContent = `
    [2024-01-01 12:00:00Z] Step result: Success
    [2024-01-01 12:01:00Z] Step result: Failed
    [2024-01-01 12:02:00Z] Step result: Cancelled
    `;
    vi.mocked(fs.readFile).mockImplementation((path) => {
      if (path === "/proc/1/cgroup") {
        return Promise.resolve("0::/\n");
      }
      return Promise.resolve(mockLogContent);
    });
    vi.mocked(fs.readdir).mockResolvedValue([
      "Worker_20240101-120000-utc.log",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const result = await checkPreviousStepFailures();

    expect(result.hasFailures).toBe(true);
    expect(result.failedCount).toBe(2); // 1 Failed + 1 Cancelled
  });

  it("returns no failures when all steps succeeded", async () => {
    vi.mocked(fs.access).mockImplementation((path) => {
      if (path === "/.dockerenv") {
        return Promise.reject(new Error("Not found"));
      }
      return Promise.resolve(undefined);
    });
    const mockLogContent = `
    {"timestamp":"2024-01-01T12:00:00Z","result":"success","action":"setup"}
    {"timestamp":"2024-01-01T12:01:00Z","result":"success","action":"build"}
    [2024-01-01 12:02:00Z] Step result: Success
    `;
    vi.mocked(fs.readFile).mockImplementation((path) => {
      if (path === "/proc/1/cgroup") {
        return Promise.resolve("0::/\n");
      }
      return Promise.resolve(mockLogContent);
    });
    vi.mocked(fs.readdir).mockResolvedValue([
      "Worker_20240101-120000-utc.log",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const result = await checkPreviousStepFailures();

    expect(result.hasFailures).toBe(false);
    expect(result.failedCount).toBe(0);
    expect(result.failedSteps).toBeUndefined();
  });

  it("handles file read errors gracefully", async () => {
    vi.mocked(fs.access).mockImplementation((path) => {
      if (path === "/.dockerenv") {
        return Promise.reject(new Error("Not found"));
      }
      return Promise.resolve(undefined);
    });
    vi.mocked(fs.readFile).mockImplementation((path) => {
      if (path === "/proc/1/cgroup") {
        return Promise.resolve("0::/\n");
      }
      return Promise.reject(new Error("Permission denied"));
    });
    vi.mocked(fs.readdir).mockResolvedValue([
      "Worker_20240101-120000-utc.log",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const result = await checkPreviousStepFailures();

    expect(result.hasFailures).toBe(false);
    expect(result.failedCount).toBe(0);
    expect(result.error).toContain("Error reading logs: Permission denied");
  });

  it("hasAnyStepFailed returns correct boolean", async () => {
    vi.mocked(fs.access).mockImplementation((path) => {
      if (path === "/.dockerenv") {
        return Promise.reject(new Error("Not found"));
      }
      return Promise.resolve(undefined);
    });
    vi.mocked(fs.readdir).mockResolvedValue([
      "Worker_20240101-120000-utc.log",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    // First test - with failures
    vi.mocked(fs.readFile).mockImplementation((path) => {
      if (path === "/proc/1/cgroup") {
        return Promise.resolve("0::/\n");
      }
      return Promise.resolve('{"result":"failed"}');
    });
    expect(await hasAnyStepFailed()).toBe(true);

    // Second test - without failures
    vi.clearAllMocks();
    vi.mocked(fs.access).mockImplementation((path) => {
      if (path === "/.dockerenv") {
        return Promise.reject(new Error("Not found"));
      }
      return Promise.resolve(undefined);
    });
    vi.mocked(fs.readFile).mockImplementation((path) => {
      if (path === "/proc/1/cgroup") {
        return Promise.resolve("0::/\n");
      }
      return Promise.resolve('{"result":"success"}');
    });
    vi.mocked(fs.readdir).mockResolvedValue([
      "Worker_20240101-120000-utc.log",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    expect(await hasAnyStepFailed()).toBe(false);
  });
});
