# KolorLab API: общая база

Сайт использует Cloudflare Worker для чтения общей базы и добавления новых цветов и красок в приватный репозиторий GitHub [LesNik3301/KolorLabPrivateDate](https://github.com/LesNik3301/KolorLabPrivateDate). Вход по телефону и паролю, клиентские карточки, редактирование и удаление сейчас отключены.

Публичное добавление означает, что любой посетитель может внести новую запись. API строго запрещает заменять или удалять существующие записи и ограничивает добавление 10 запросами с одного IP в час. Это снижает случайный/автоматический спам, но не является полноценной защитой от целенаправленного злоупотребления. Токен GitHub никогда не передаётся сайту.

## 1. Проверьте репозиторий данных

Убедитесь в GitHub, что `LesNik3301/KolorLabPrivateDate` имеет статус **Private** и в нём есть ветка `main`. Worker проверяет приватность репозитория перед чтением и записью. Не храните клиентские данные здесь, пока функция клиентских карточек выключена.

## 2. Создайте KV namespace Cloudflare

В PowerShell из корня проекта:

```powershell
npx wrangler login
npx wrangler kv namespace create AUTH_KV --config worker/wrangler.toml
npx wrangler kv namespace create AUTH_KV --preview --config worker/wrangler.toml
```

Вставьте полученные IDs в `worker/wrangler.toml` вместо `REPLACE_WITH_PRODUCTION_KV_NAMESPACE_ID` и `REPLACE_WITH_PREVIEW_KV_NAMESPACE_ID`. KV хранит только счётчики ограничения частоты запросов.

## 3. Создайте GitHub token

Создайте fine-grained personal access token с доступом только к приватному репозиторию `KolorLabPrivateDate` и разрешением **Contents: Read and write**. Токен задаётся только как Cloudflare Worker secret — не в чате, не в публичном репозитории и не во фронтенде.

## 4. Установите секреты Worker

Задайте секреты командами из корня проекта. Wrangler запросит значение в терминале:

```powershell
npx wrangler secret put GITHUB_TOKEN --config worker/wrangler.toml
npx wrangler secret put GITHUB_OWNER --config worker/wrangler.toml
npx wrangler secret put GITHUB_REPO --config worker/wrangler.toml
npx wrangler secret put SESSION_SECRET --config worker/wrangler.toml
```

Вводите значения:

- `GITHUB_TOKEN` — созданный fine-grained token;
- `GITHUB_OWNER` — `LesNik3301`;
- `GITHUB_REPO` — `KolorLabPrivateDate`;
- `SESSION_SECRET` — отдельная случайная строка не короче 32 байт, используемая для защиты ключей ограничения частоты запросов.

Случайную строку можно сгенерировать локально в PowerShell:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Не задавайте GitHub token или секрет в переменных `VITE_*`: значения, встроенные во фронтенд, доступны посетителям сайта.

## 5. Разверните Worker

```powershell
npx wrangler deploy --config worker/wrangler.toml
```

Сохраните выданный URL, например `https://kolorlab-api.<account>.workers.dev`.

## 6. Подключите сайт к Worker

В публичном репозитории `KolorLab1` откройте **Settings → Secrets and variables → Actions → Variables** и добавьте:

```text
KOLORLAB_API_URL=https://kolorlab-api.<account>.workers.dev
```

Подставьте реальный URL Worker, затем повторно запустите GitHub Actions workflow **Deploy to GitHub Pages**. Для локальной разработки можно передать URL через `VITE_KOLORLAB_API_URL`.

## Проверка

```powershell
npm test
npx wrangler dev --config worker/wrangler.toml
```

Успешное добавление создаёт GitHub commit в `catalog/colors/<id>.json` или `catalog/paints/<id>.json`. Повторное создание того же ID возвращает `409`; попытки изменить или удалить запись возвращают `405`. SMS-провайдер и пароль администратора сейчас не используются.
