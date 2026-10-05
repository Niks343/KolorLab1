# KolorLab API: общая база

Сайт использует Cloudflare Worker для чтения общей базы и добавления новых цветов и красок в приватный репозиторий GitHub [Niks343/KolorLabPrivateData](https://github.com/Niks343/KolorLabPrivateData). Вход по телефону и паролю, клиентские карточки, редактирование и удаление сейчас отключены.

Публичное добавление означает, что любой посетитель может внести новую запись. API запрещает заменять и удалять существующие записи и ограничивает добавление 10 запросами с одного IP в час. Это снижает случайный/автоматический спам, но не является полноценной защитой от целенаправленного злоупотребления. Токен GitHub никогда не передаётся сайту.

## 1. Проверьте репозиторий данных

Репозиторий `Niks343/KolorLabPrivateData` создан как **Private** с README и веткой `main`. Worker проверяет приватность репозитория перед чтением и записью. Не храните клиентские данные в этой базе, пока функция клиентских карточек выключена.

## 2. Cloudflare KV

Для текущего Worker production и preview namespaces уже созданы и указаны в `worker/wrangler.toml`. KV содержит только счётчики ограничения частоты запросов. При настройке с нуля используйте:

```powershell
npx wrangler login
npx wrangler kv namespace create AUTH_KV --config worker/wrangler.toml
npx wrangler kv namespace create AUTH_KV_PREVIEW --config worker/wrangler.toml
```

Замените namespace IDs в `worker/wrangler.toml` на значения, выданные Wrangler.

## 3. Создайте GitHub token

Создайте fine-grained personal access token с доступом только к `Niks343/KolorLabPrivateData` и разрешением **Contents: Read and write**. GitHub token задаётся только как Cloudflare Worker secret — не в чате, публичном репозитории или фронтенде.

## 4. Сохраните GitHub token в Cloudflare

Wrangler уже авторизован в Cloudflare, а случайный `SESSION_SECRET` создан и сохранён в secrets Worker. Owner/repository, branch и namespaces указаны в `worker/wrangler.toml`.

Из корня проекта выполните команду; Wrangler запросит token в терминале:

```powershell
npx wrangler secret put GITHUB_TOKEN --config worker/wrangler.toml
```

Вставьте fine-grained token в локальное приглашение Wrangler, а не в чат или файл проекта. Не задавайте token в переменных `VITE_*`: они встраиваются во фронтенд и доступны посетителям.

## 5. Разверните Worker

```powershell
npx wrangler deploy --config worker/wrangler.toml
```

Сохраните выданный URL вида `https://kolorlab-api.<account>.workers.dev`.

## 6. Подключите сайт

В публичном репозитории `KolorLab1` откройте **Settings → Secrets and variables → Actions → Variables** и создайте:

```text
KOLORLAB_API_URL=https://kolorlab-api.<account>.workers.dev
```

Подставьте реальный Worker URL и повторно запустите GitHub Actions workflow **Deploy to GitHub Pages**. Для локальной разработки URL можно передать через `VITE_KOLORLAB_API_URL`.

## Проверка

```powershell
npm test
npx wrangler dev --config worker/wrangler.toml
```

Успешное добавление создаёт GitHub commit в `catalog/colors/<id>.json` или `catalog/paints/<id>.json`. Повторный ID возвращает `409`; изменение и удаление возвращают `405`. SMS и пароль администратора сейчас не используются.
