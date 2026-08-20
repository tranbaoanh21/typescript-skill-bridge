export const serviceNames = {
  api: 'skillbridge-api',
  web: 'skillbridge-web',
} as const;

export type ServiceName = (typeof serviceNames)[keyof typeof serviceNames];
