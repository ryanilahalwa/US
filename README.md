# Our Orbit

A full-stack web application for organizing shared memories, chapters, and keepsakes in one place.

## Overview

Our Orbit is designed as a personal, collaborative memory space. The application includes dedicated views for an orbit home page, chapters, keepsakes, and feature exploration.

## Tech stack

- React 19 and TypeScript
- Vite and Tailwind CSS
- Express and tRPC
- Drizzle ORM with SQL/MySQL
- Vitest for testing
- Cloudinary and AWS S3-compatible storage integrations

## Project structure

- `client/` — React application and UI components
- `server/` — backend routes and server-side logic
- `shared/` — shared types and schemas
- `drizzle/` — database migration files

## Local development

1. Install dependencies with `pnpm install`.
2. Configure the environment variables required by the server and database integrations.
3. Start the development server with `pnpm dev`.
4. Run type checks with `pnpm check` and tests with `pnpm test`.

## Status

This is an active learning project. The codebase is being refined as I improve my full-stack development, testing, and deployment practices.
