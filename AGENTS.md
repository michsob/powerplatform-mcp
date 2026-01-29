# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the MCP server implementation.
- `src/services/` holds Dataverse-facing service classes (core business logic).
- `src/tools/` exposes MCP tools that wrap services.
- `src/prompts/` contains prompt templates and prompt wiring.
- `src/models/` and `src/types.ts` define shared types and response shapes.
- `src/utils/` includes helper utilities like XML parsing.
- `tests/` mirrors the runtime structure; most tests in `tests/services/*.test.ts` are integration-style tests.

## Build, Test, and Development Commands
- `npm run build`: Compile TypeScript to `build/` using `tsc`.
- `npm start`: Run the compiled server (`build/index.js`).
- `npm run dev`: Build, then start.
- `npm test`: Run the Jest suite once.
- `npm run test:watch`: Run tests in watch mode for TDD.
- `npm run test:coverage`: Generate a coverage report in `coverage/`.
- `npm run inspector`: Build, then launch the MCP inspector.

## Coding Style & Naming Conventions
- Language: TypeScript (ESM). Prefer explicit, readable code.
- Indentation: 2 spaces; keep lines reasonably short.
- File naming: match existing patterns such as `EntityService.ts`, `entityTools.ts`, and `*.test.ts`.
- Exports: use focused named exports and keep `index.ts` files as thin barrels.

## Testing Guidelines
- Framework: Jest with `ts-jest` (`jest.config.js`).
- Approach: TDD first. Add or update a failing test before implementation.
- Tests are integration-heavy and may call the Dataverse Web API via `PowerPlatformClient`. Use a safe dev environment.
- Naming: `FeatureName.test.ts` and descriptive `describe`/`it` blocks.
- Run: start with `npm run test:watch`, finish with `npm test` and `npm run test:coverage`.

## Commit & Pull Request Guidelines
- Prefer short, imperative commit messages (examples from history: “Add support for national cloud authentication…”).
- A good pattern is: `type: brief summary` (e.g., `docs: add TDD workflow`).
- PRs should include:
  - What changed and why.
  - Any required env vars or setup notes.
  - Test evidence (commands run and key results).

## Security & Configuration Tips
- Required env vars: `POWERPLATFORM_URL`, `POWERPLATFORM_CLIENT_ID`, `POWERPLATFORM_CLIENT_SECRET`, `POWERPLATFORM_TENANT_ID`.
- Optional: `POWERPLATFORM_AUTHORITY_URL` for national clouds.
- Never commit real credentials or `.env` files.