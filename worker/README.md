# KolorLab API: общая база

Сайт использует Cloudflare Worker для чтения общей базы и добавления, редактирования и удаления цветов и красок в приватном репозитории GitHub [Niks343/KolorLabPrivateData](https://github.com/Niks343/KolorLabPrivateData).

Любой посетитель сайта может добавлять, редактировать и удалять записи общей пользовательской базы. API ограничивает добавление 10 запросами с одного IP в час, а изменение и удаление — 60 запросами с одного IP в час. Специального входа и авторизации для записи нет; ограничение запросов не защищает от целенаправленного удаления или порчи каталога. Изменения записываются коммитами в приватный GitHub-репозиторий; токен GitHub остаётся на Worker.

Карточки клиентов доступны всем посетителям и сохраняются в каталоге `clients/` приватного репозитория. API ограничивает чтение 120, создание/изменение 10, а удаление 20 запросами с одного IP в час. Полный телефон сохраняется в приватном репозитории; публичное чтение возвращает только имя и последние четыре цифры. Интерфейс требует подтверждение согласия клиента. Ограничение запросов не заменяет авторизацию: посетители могут создавать или удалять общие карточки. Проверьте [PRIVACY.md](../PRIVACY.md) и не сохраняйте данные без согласия клиента.

## 1. Проверьте репозиторий данных

Репозиторий `Niks343/KolorLabPrivateData` создан как **Private** с README и веткой `main`. Worker проверяет приватность репозитория перед чтением и записью. Учитывайте, что любой посетитель может менять общие карточки клиентов.

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

Успешное добавление, изменение и удаление создают GitHub commit в `catalog/colors/<id>.json` или `catalog/paints/<id>.json`. Повторный ID при добавлении возвращает `409`. Встроенные записи можно изменять тем же `PUT`: файл с исходным ID применяется поверх встроенного объекта. Для удаления Worker сохраняет tombstone (`deleted: true`), поэтому исходная запись скрывается в клиенте и не появляется снова после перезагрузки. Публичное редактирование и удаление ограничиваются лимитом запросов с IP.

Карточки клиента сохраняются в `clients/<id>.json`; удаление записывает tombstone, чтобы карточка не отображалась повторно. Предыдущие версии файла могут содержать номер в истории коммитов GitHub.
