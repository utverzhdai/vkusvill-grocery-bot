# Продуктовый бот

Telegram-бот: «собери корзину на карбонару, спагетти есть» → рецепт с источником → корзина во ВкусВилле в аккаунте владелицы → оплата в приложении.

- Мозг: Claude Code headless (`claude -p`, Sonnet, подписка), MCP ВкусВилла, веб-поиск, память в `workspace/memory/`.
- Корзина: `workspace/tools/cart.mjs` открывает ссылку корзины в сессии владелицы (Playwright) и проверяет наличие.
- Вход: `workspace/tools/login.mjs`, код из СМС присылается боту.

Спека: `docs/superpowers/specs/2026-09-13-grocery-bot-design.md`. Развёртывание: `DEPLOY.md`.

Тесты: `npm test`. Локальный запуск: `npm run dev` (нужен `.env`).
