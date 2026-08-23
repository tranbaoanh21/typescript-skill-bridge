export const serviceNames = {
  api: 'skillbridge-api',
  web: 'skillbridge-web',
} as const;

export type ServiceName = (typeof serviceNames)[keyof typeof serviceNames];

export {
  eventTypes,
  routingKeys,
  type ApplicationAcceptedData,
  type IntegrationEventEnvelope,
  type SkillBridgeEvent,
} from './events.js';

export type {
  ClientToServerEvents,
  MessageSendInput,
  ProjectJoinInput,
  ProjectMessage,
  RealtimeAck,
  RealtimeTask,
  ServerToClientEvents,
  TypingInput,
} from './realtime.js';
