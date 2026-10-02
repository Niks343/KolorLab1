# KolorLab

Цифровая лаборатория цвета и колеровки: подбор оттенков, визуализация поверхностей, расчёт краски и спецификация проекта.

## Сайт

После успешного GitHub Pages deployment сайт будет доступен по адресу:
[https://niks343.github.io/KolorLab1/](https://niks343.github.io/KolorLab1/).

## Запуск локально

Требуется Node.js 18 или новее.

```bash
npm install
npm run dev
```

## Проверка и production-сборка

```bash
npm test
npm run build
```

## Android

Проект использует Capacitor. После production-сборки синхронизируйте веб-ресурсы и Android-проект:

```bash
npm run android:sync
npm run android:open
```

Требования и шаги настройки описаны в [ANDROID_SETUP.md](./ANDROID_SETUP.md).
