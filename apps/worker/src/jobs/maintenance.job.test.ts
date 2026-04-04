import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loggerInfoMock,
  poolQueryMock,
  workerConstructorMock,
} = vi.hoisted(() => ({
  loggerInfoMock: vi.fn(),
  poolQueryMock: vi.fn(),
  workerConstructorMock: vi.fn(function WorkerMock(
    _queueName: string,
    processor: (job: { id: string; name: string }) => Promise<void>,
  ) {
    return {
      processor,
    };
  }),
}));

vi.mock("bullmq", () => ({
  Worker: workerConstructorMock,
}));

vi.mock("../config/env", () => ({
  env: {
    WORKER_CONCURRENCY: 2,
  },
}));

vi.mock("../config/logger", () => ({
  logger: {
    info: loggerInfoMock,
  },
}));

vi.mock("../db/pool", () => ({
  pool: {
    query: poolQueryMock,
  },
}));

vi.mock("../queues", () => ({
  maintenanceQueueName: "maintenance",
  redisConnection: {},
}));

import { createMaintenanceWorker } from "./maintenance.job";

describe("maintenance.job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes locked chat rooms that crossed retention", async () => {
    poolQueryMock.mockResolvedValue({
      rows: [
        { id: "room-1", booking_id: "booking-1" },
        { id: "room-2", booking_id: "booking-2" },
      ],
    });

    const worker = createMaintenanceWorker() as unknown as {
      processor: (job: { id: string; name: string }) => Promise<void>;
    };

    await worker.processor({
      id: "job-1",
      name: "delete-locked-chat-rooms",
    });

    const [sql] = poolQueryMock.mock.calls[0] ?? [];
    expect(String(sql)).toContain("DELETE FROM chat_rooms");
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          deleted: 2,
        }),
      }),
      "Processed maintenance recovery job",
    );
  });
});
