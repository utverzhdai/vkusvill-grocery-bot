# Продуктовый бот

Telegram-бот: «собери корзину на карбонару, спагетти есть» → рецепт с источником → корзина во ВкусВилле в аккаунте владелицы → оплата в приложении.

- Мозг: Claude Code headless (`claude -p`, Sonnet, подписка), MCP ВкусВилла, веб-поиск, память в `workspace/memory/`.
- Корзина: `workspace/tools/cart.mjs` открывает ссылку корзины в сессии владелицы (Playwright) и проверяет наличие.
- Вход: `workspace/tools/login.mjs`, код из СМС присылается боту.

Спека: `docs/superpowers/specs/2026-09-13-grocery-bot-design.md`. Развёртывание: `DEPLOY.md`.

## Переменные `.env`

- `TELEGRAM_TOKEN` — токен бота от @BotFather.
- `OWNER_ID` — числовой id владелицы в Telegram: бот отвечает только ей и только в личном чате.
- `CLAUDE_CODE_OAUTH_TOKEN` — токен подписки, выдаёт `claude setup-token`.
- `VKUSVILL_PHONE` — телефон аккаунта ВкусВилла, на него приходит код из СМС.

Образец — `.env.example`.

Тесты: `npm test`. Локальный запуск: `npm run dev` (нужен `.env`).

Локально движок запускается только из Git Bash или WSL: `claude -p` вызывается через shell,
и в обычном `cmd.exe`/PowerShell аргументы и пути ведут себя иначе.
