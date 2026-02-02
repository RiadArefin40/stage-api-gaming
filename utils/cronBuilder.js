// utils/cronBuilder.ts
export function buildCronExpression(
  type,
  day,
  time
) {
  const [hour, minute] = time.split(':').map(Number);

  switch (type) {
    case 'daily':
      return `${minute} ${hour} * * *`;

    case 'weekly':
      return `${minute} ${hour} * * ${day}`;

    case 'monthly':
      return `${minute} ${hour} 1 * *`; // 1st day of month

    default:
      throw new Error('Invalid cron type');
  }
}
