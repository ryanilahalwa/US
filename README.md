# Our Orbit

A full-stack memory application for organizing shared memories, chapters, and keepsakes through a structured, responsive web experience.

> A learning project demonstrating full-stack TypeScript, typed API boundaries, relational data modelling, database migrations, automated testing, and cloud media integration.

## Recruiter quick scan

| Area | Evidence |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, responsive components |
| Backend | Node.js, Express, tRPC, typed client-server communication |
| Data | Drizzle ORM, SQL/MySQL-compatible tooling, relational schema, migrations |
| Quality | Vitest, TypeScript checks, Prettier, error-boundary components |
| Deployment | Vercel, Render, Railway configuration files |
| Engineering foundations | Authentication/session flows, environment configuration, reusable UI architecture |
| Current level | Active first-year student project with documented limitations and roadmap |

## Overview

Our Orbit is designed as a personal, collaborative memory space. The application includes dedicated views for an orbit home page, chapters, keepsakes, and feature exploration. The repository is organized as a full-stack TypeScript application with separate frontend, server, shared, and database-migration concerns.

## What I built

- Structured the application into client, server, shared, and database-migration layers.
- Built a React and TypeScript frontend with reusable responsive UI components.
- Implemented an Express server and typed tRPC procedures for client-server communication.
- Modelled relational data with Drizzle ORM, SQL schemas, relations, and migration files.
- Added automated tests with Vitest, including application and authentication-related test coverage.
- Prepared cloud media workflows using Cloudinary and AWS S3-compatible storage integrations.
- Added deployment configuration for Vercel, Render, and Railway workflows.

## Key features

- Organize memories into chapters and keepsakes.
- Navigate a responsive orbit-style application interface.
- Use shared types and schemas across the frontend and backend.
- Persist application data through a relational database model.
- Support media-related workflows through cloud storage integrations.
- Handle authentication-related application flows and session state.

## Technology stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Radix UI components
- **Backend:** Node.js, Express, tRPC
- **Data:** Drizzle ORM, SQL/MySQL-compatible database tooling, schema relations, migrations
- **Forms and client data:** React Hook Form, Zod, TanStack React Query
- **Storage and integrations:** Cloudinary, AWS S3-compatible storage
- **Testing and tooling:** Vitest, TypeScript, Prettier, pnpm
- **Deployment configuration:** Vercel, Render, Railway

## Architecture

```text
client/       React application, routes, pages, hooks, and UI components
server/       Express server, tRPC procedures, business logic, auth, and storage access
shared/       Shared types, schemas, constants, and error definitions
drizzle/      Database schema relations and migration files
```

The separated structure keeps interface concerns, API logic, shared contracts, and persistence easier to understand and maintain.

## Testing and quality

The repository includes automated test files and scripts for static checking, formatting, building, and test execution.

```bash
pnpm check
pnpm test
pnpm build
```

The project uses TypeScript checks to catch type errors, Vitest for automated tests, and Prettier for consistent formatting. The test suite and quality checks will continue to expand as the application develops.

## Security and privacy

- Secrets and service credentials are loaded through environment variables rather than committed to the repository.
- Local configuration is represented through example environment files.
- Authentication, cookies, storage access, and server-side integrations are kept outside the client-only code path.
- Further work is planned around stronger authorization rules, input validation, secure deployment configuration, and production observability.

## Local development

### Requirements

- Node.js
- pnpm
- A configured SQL-compatible database
- Environment variables for the services used by the application

### Setup

```bash
pnpm install
pnpm dev
```

Configure the required environment variables before starting the application. Do not commit `.env` files, credentials, personal media, or production service keys.

## Deployment

The repository includes deployment configuration for Vercel, Render, and Railway. Deployment requires environment-specific database, authentication, and storage configuration. A public live demo is not currently listed; the source repository is the authoritative project reference.

## Current limitations and roadmap

This is an active learning project rather than a claim of production readiness. Planned improvements include:

- broader unit, integration, and end-to-end test coverage;
- formal keyboard-navigation and screen-reader accessibility review;
- stronger authentication and authorization boundaries;
- improved validation, error handling, and observability;
- database and media performance optimization;
- a verified public demo with production-safe environment configuration.

## Lessons learned

This project has strengthened my practical understanding of full-stack TypeScript, API boundaries, relational data modelling, migrations, reusable UI systems, authentication-related flows, testing, environment configuration, and deployment preparation.

## Kurzbeschreibung

Our Orbit ist eine Full-Stack-Webanwendung zur Organisation gemeinsamer Erinnerungen, Kapitel und Andenken. Das Projekt demonstriert praktische Erfahrungen mit React, TypeScript, Express, tRPC, Drizzle ORM, SQL-Datenmodellierung, Datenbankmigrationen, automatisierten Tests und Cloud-Medienintegration.

## Project status

**Active learning project.** The application is being refined as I improve my full-stack development, testing, accessibility, security, and deployment practices.

## License

The project package is configured with the MIT license. Confirm that a repository license file is present before treating the repository as formally licensed.
