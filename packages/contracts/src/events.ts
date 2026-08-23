export const eventTypes = {
  applicationAccepted: 'application.accepted',
} as const;

export const routingKeys = {
  applicationAccepted: 'notification.application.accepted',
} as const;

export interface ApplicationAcceptedData {
  applicantId: string;
  applicationId: string;
  managerId: string;
  projectId: string;
  projectTitle: string;
  recipientEmail: string;
}

export interface IntegrationEventEnvelope<TType extends string, TData> {
  correlationId: string;
  data: TData;
  id: string;
  occurredAt: string;
  type: TType;
  version: 1;
}

export type SkillBridgeEvent = IntegrationEventEnvelope<
  typeof eventTypes.applicationAccepted,
  ApplicationAcceptedData
>;
