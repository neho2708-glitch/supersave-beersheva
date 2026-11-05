# Contributing

Set up the project as described in the [README](README.md), then run the checks before opening a pull request:

```bash
npm run typecheck
npm run lint
npm test
npm run test:engine
```

## Rules for data

These are the point of the project, so please keep to them:

- Never invent a price, promotion, branch, barcode or test result.
- Every price must trace back to an official source file.
- Don't mark a connector VERIFIED by hand. Status only comes from `verify.py`.
- Don't bypass a login, CAPTCHA or access limit. If a source isn't reachable, report it as UNAVAILABLE.
- Show uncertainty instead of hiding it: if a promotion or match isn't certain, it must not change a computed price.

Never commit `.env`, passwords, API keys or tokens.

## Adding a connector

See "How to add a source or a city" in [docs/data-sources.md](docs/data-sources.md).
