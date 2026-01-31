import type { Job } from "@wms/queue";

interface NotificationJobData {
  type: string;
  [key: string]: unknown;
}

export async function processNotification(job: Job<NotificationJobData>) {
  const { type, ...payload } = job.data;

  console.log(`🔔 Sending notification: ${type}`);
  console.log(`   Payload:`, JSON.stringify(payload, null, 2));

  // Simulate notification delivery
  // Replace with: email, Slack webhook, push notification, etc.
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log(`✅ Notification sent: ${type}`);
  return { sent: true, type };
}
