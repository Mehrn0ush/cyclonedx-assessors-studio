import { v4 as uuidv4 } from 'uuid';

export async function createNotification(
  db: any,
  params: {
    userId: string;
    type: string;
    title: string;
    message: string;
    link?: string;
  }
): Promise<void> {
  try {
    await db
      .insertInto('notification')
      .values({
        id: uuidv4(),
        user_id: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link || null,
        is_read: false,
      })
      .execute();
  } catch (error) {
    console.error('Failed to create notification', error);
  }
}
