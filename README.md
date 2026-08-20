# HCMUT SkillBridge

HCMUT SkillBridge is a TypeScript full-stack learning project that helps students discover projects, recruit teammates, collaborate, and turn completed work into portfolio evidence.

The intended product journey is:

```text
Create a profile → Find a project → Apply → Form a team → Collaborate → Review → Portfolio
```

## Project status

The project is currently in product discovery and software architecture planning. Application scaffolding will be introduced through reviewed, short-lived feature branches.

## Planned platform

- React, Tailwind CSS, and Taste Skill for the web experience
- Node.js, Express, and TypeScript for the API
- PostgreSQL for transactional data
- Swagger UI and Postman for API documentation and testing
- Docker and GitHub Actions for reproducible delivery
- Redis, Socket.IO, and RabbitMQ for advanced realtime and asynchronous workflows
- React Native for the mobile client
- Vercel, Neon, and an optional AWS learning deployment

## Development principles

- Start with a modular monolith and earn additional complexity.
- Keep PostgreSQL as the source of truth.
- Protect business invariants with database constraints and transactions.
- Deliver changes through focused pull requests with automated checks.
- Add infrastructure only when it solves a documented product or learning need.

Detailed requirements, architecture diagrams, phase gates, and acceptance criteria will be maintained in the project roadmap.
