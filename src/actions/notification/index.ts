"use server";

import { eq, desc, and, gte } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { notificationTable } from "@/db/schema";
import { auth } from "@/lib/auth";

export const getNotifications = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Não autorizado");
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const notifications = await db.query.notificationTable.findMany({
    where: and(
      eq(notificationTable.userId, session.user.id),
      gte(notificationTable.createdAt, sevenDaysAgo),
    ),
    orderBy: [desc(notificationTable.createdAt)],
    limit: 50,
  });

  return notifications;
};

export const markNotificationAsRead = async (notificationId: string) => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Não autorizado");
  }

  await db
    .update(notificationTable)
    .set({ isRead: true })
    .where(
      and(
        eq(notificationTable.id, notificationId),
        eq(notificationTable.userId, session.user.id),
      ),
    );

  return { success: true };
};

export const markAllNotificationsAsRead = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Não autorizado");
  }

  await db
    .update(notificationTable)
    .set({ isRead: true })
    .where(
      and(
        eq(notificationTable.userId, session.user.id),
        eq(notificationTable.isRead, false),
      ),
    );

  return { success: true };
};
