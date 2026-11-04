import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateMany } = vi.hoisted(() => ({
  updateMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    notification: {
      updateMany,
    },
  },
}));

import { markAllAsRead, markAsRead } from "@/lib/notifications";

describe("notification read-state updates", () => {
  beforeEach(() => {
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 1 });
  });

  it("marks one notification read and records readAt separately", async () => {
    const before = Date.now();

    await expect(markAsRead("notification-1", "user-1")).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "notification-1", userId: "user-1" },
      data: { read: true, readAt: expect.any(Date) },
    });
    const data = updateMany.mock.calls[0][0].data;
    expect(data.readAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("marks all unread notifications read and records readAt", async () => {
    await expect(markAllAsRead("user-1")).resolves.toBe(1);

    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", read: false },
      data: { read: true, readAt: expect.any(Date) },
    });
  });

  it("returns false when the requested notification does not belong to the user", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(markAsRead("notification-1", "other-user")).resolves.toBe(false);
  });
});
