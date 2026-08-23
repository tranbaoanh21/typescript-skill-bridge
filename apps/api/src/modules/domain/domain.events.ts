import type { RealtimeTask } from '@skillbridge/contracts';

export type DomainEvent = {
  action: 'CREATED' | 'UPDATED';
  actorId: string;
  task: RealtimeTask;
  type: 'task.changed';
};

export interface DomainEventPublisher {
  publish(event: DomainEvent): void;
}

export class DomainEventBus implements DomainEventPublisher {
  private readonly listeners = new Set<(event: DomainEvent) => void>();

  publish(event: DomainEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Domain event listener failed.', error);
      }
    }
  }

  subscribe(listener: (event: DomainEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const noOpDomainEventPublisher: DomainEventPublisher = {
  publish: () => undefined,
};
