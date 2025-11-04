import { describe, it, expect, vi, beforeEach } from "vitest";
import * as core from "@actions/core";
import { startBuildkitd } from "./setup_builder";
import { execa } from "execa";

vi.mock("@actions/core");
vi.mock("execa");
vi.mock("fs", () => ({
  promises: {
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
  createWriteStream: vi.fn().mockReturnValue({
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  }),
}));
vi.mock("child_process", () => ({
  exec: vi.fn((cmd, callback) => {
    // Mock pgrep to return a buildkitd PID
    if (cmd.includes("pgrep buildkitd")) {
      callback(null, { stdout: "12345\n", stderr: "" });
    } else {
      callback(null, { stdout: "", stderr: "" });
    }
  }),
}));

describe("buildkitd-env parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse and set environment variables from buildkitd-env", async () => {
    const mockExeca = vi.mocked(execa);
    mockExeca.mockReturnValue({
      on: vi.fn(),
      stdout: {
        pipe: vi.fn(),
      },
      stderr: {
        pipe: vi.fn(),
      },
    } as unknown as ReturnType<typeof execa>);

    const buildkitdEnv = [
      "OTEL_TRACES_EXPORTER=otlp",
      "OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf",
      "OTEL_EXPORTER_OTLP_ENDPOINT=https://example.com",
      "OTEL_SERVICE_NAME=buildkitd",
    ];

    await startBuildkitd(4, "tcp://127.0.0.1:1234", undefined, buildkitdEnv);

    // Verify that execa was called with the correct command
    expect(mockExeca).toHaveBeenCalledTimes(1);
    const commandCall = mockExeca.mock.calls[0][0] as string;

    // Check that environment variables are included in the command with sudo env
    expect(commandCall).toContain("sudo env");
    expect(commandCall).toContain("OTEL_TRACES_EXPORTER='otlp'");
    expect(commandCall).toContain(
      "OTEL_EXPORTER_OTLP_PROTOCOL='http/protobuf'",
    );
    expect(commandCall).toContain(
      "OTEL_EXPORTER_OTLP_ENDPOINT='https://example.com'",
    );
    expect(commandCall).toContain("OTEL_SERVICE_NAME='buildkitd'");
  });

  it("should warn about invalid environment variable format", async () => {
    const mockCoreWarning = vi.mocked(core.warning);
    const mockExeca = vi.mocked(execa);
    mockExeca.mockReturnValue({
      on: vi.fn(),
      stdout: {
        pipe: vi.fn(),
      },
      stderr: {
        pipe: vi.fn(),
      },
    } as unknown as ReturnType<typeof execa>);

    const buildkitdEnv = [
      "VALID_VAR=value",
      "INVALID_VAR", // Missing value
    ];

    await startBuildkitd(4, "tcp://127.0.0.1:1234", undefined, buildkitdEnv);

    // Check warnings were logged
    expect(mockCoreWarning).toHaveBeenCalledWith(
      expect.stringContaining(
        "Invalid environment variable format (missing value): INVALID_VAR",
      ),
    );
  });

  it("should handle empty buildkitd-env array", async () => {
    const mockExeca = vi.mocked(execa);
    mockExeca.mockReturnValue({
      on: vi.fn(),
      stdout: {
        pipe: vi.fn(),
      },
      stderr: {
        pipe: vi.fn(),
      },
    } as unknown as ReturnType<typeof execa>);

    await startBuildkitd(4, "tcp://127.0.0.1:1234", undefined, []);

    // Verify that execa was called without environment variables
    expect(mockExeca).toHaveBeenCalledTimes(1);
    const commandCall = mockExeca.mock.calls[0][0] as string;

    // Should not contain any environment variables, no env command
    expect(commandCall).not.toContain("OTEL_");
    expect(commandCall).not.toContain("sudo env");
    expect(commandCall).toContain("nohup sudo");
  });

  it("should handle undefined buildkitd-env", async () => {
    const mockExeca = vi.mocked(execa);
    mockExeca.mockReturnValue({
      on: vi.fn(),
      stdout: {
        pipe: vi.fn(),
      },
      stderr: {
        pipe: vi.fn(),
      },
    } as unknown as ReturnType<typeof execa>);

    await startBuildkitd(4, "tcp://127.0.0.1:1234", undefined, undefined);

    // Verify that execa was called without environment variables
    expect(mockExeca).toHaveBeenCalledTimes(1);
    const commandCall = mockExeca.mock.calls[0][0] as string;

    // Should not contain any environment variables, no env command
    expect(commandCall).not.toContain("OTEL_");
    expect(commandCall).not.toContain("sudo env");
    expect(commandCall).toContain("nohup sudo");
  });

  it("should handle buildkitd-env with special characters in values", async () => {
    const mockExeca = vi.mocked(execa);
    mockExeca.mockReturnValue({
      on: vi.fn(),
      stdout: {
        pipe: vi.fn(),
      },
      stderr: {
        pipe: vi.fn(),
      },
    } as unknown as ReturnType<typeof execa>);

    const buildkitdEnv = [
      "SPECIAL_CHARS=value with spaces",
      "QUOTES=value'with'quotes",
      "EQUALS=key=value",
    ];

    await startBuildkitd(4, "tcp://127.0.0.1:1234", undefined, buildkitdEnv);

    // Verify that execa was called with properly escaped values
    expect(mockExeca).toHaveBeenCalledTimes(1);
    const commandCall = mockExeca.mock.calls[0][0] as string;

    // Check that values are properly quoted
    expect(commandCall).toContain("SPECIAL_CHARS='value with spaces'");
    expect(commandCall).toContain("QUOTES='value'with'quotes'");
    expect(commandCall).toContain("EQUALS='key=value'");
  });
});
