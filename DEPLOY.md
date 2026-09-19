# Развёртывание

Сервер: <IP сервера> (вне РФ). Telegram и Anthropic доступны оттуда напрямую.

## Один раз

```bash
sudo useradd -m -s /bin/bash grocery
sudo mkdir -p /opt/grocery-bot && sudo chown grocery:grocery /opt/grocery-bot
sudo npm install -g @anthropic-ai/claude-code
```

Браузер ставится не здесь, а после первой «Выкладки кода»: `npx playwright` берётся
из `node_modules` проекта, которого до `npm ci` ещё нет.

## Выкладка кода

С компьютера (Git Bash), из корня проекта:

```bash
tar --exclude=node_modules --exclude=browser --exclude=.env --exclude=state.json \
    --exclude=.git --exclude=spike/captures --exclude=.superpowers -czf /tmp/grocery.tgz .
scp -i ~/.ssh/<ключ> /tmp/grocery.tgz root@<IP сервера>:/tmp/
ssh -i ~/.ssh/<ключ> root@<IP сервера> 'cd /opt/grocery-bot && tar xzf /tmp/grocery.tgz && rm /tmp/grocery.tgz && chown -R grocery:grocery . && sudo -u grocery npm ci --omit=dev'
```

Браузер (первый раз и после обновления playwright): системные библиотеки от root,
сам chromium от имени grocery, чтобы он лёг в его `~/.cache`.

```bash
ssh -i ~/.ssh/<ключ> root@<IP сервера> 'sudo npx playwright install-deps chromium'
ssh -i ~/.ssh/<ключ> root@<IP сервера> "sudo -u grocery bash -c 'cd /opt/grocery-bot && npx playwright install chromium'"
```

## Секреты

`/opt/grocery-bot/.env` (права 600, владелец grocery): TELEGRAM_TOKEN, OWNER_ID, CLAUDE_CODE_OAUTH_TOKEN (из `claude setup-token` на компьютере владелицы), VKUSVILL_PHONE.

Профиль браузера с уже выполненным входом можно перенести с компьютера: скопировать папку `browser/profile` в `/opt/grocery-bot/browser/profile` (владелец grocery, права 700); тогда первый вход по СМС не понадобится.

Проверка модели от имени сервиса:

```bash
sudo -u grocery bash -c 'cd /opt/grocery-bot/workspace && CLAUDE_CODE_OAUTH_TOKEN=$(grep CLAUDE_CODE_OAUTH_TOKEN ../.env | cut -d= -f2) claude -p "ответь одним словом: ок" --model haiku --output-format json --strict-mcp-config --mcp-config mcp.json'
```

## Служба

```bash
sudo cp deploy/grocery-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now grocery-bot
journalctl -u grocery-bot -f
```

## Первый вход во ВкусВилл

Написать боту «собери корзину на карбонару». При первом размещении cart.mjs вернёт auth_required, бот попросит код из СМС. Прислать код. Сессия сохранится в /opt/grocery-bot/browser/profile.

## Обновление

Повторить «Выкладка кода», затем `sudo systemctl restart grocery-bot`.
