# KolorLab для Android

KolorLab использует Capacitor 8: React-приложение собирается как веб-интерфейс и запускается внутри Android WebView. Нативная оболочка позволяет подключать функции Android через плагины, сохраняя общий код для сайта и приложения.

Новые пользовательские цвета и краски добавляются без входа и сохраняются в приватный GitHub-репозиторий через Cloudflare Worker. API сейчас разрешает добавление, но не изменение и не удаление. Настройка API и секретов описана в [worker/README.md](./worker/README.md). Вход и карточки клиентов временно отключены.

Для локальной Android-сборки задайте публичный URL Worker до сборки React-приложения:

```powershell
$env:VITE_KOLORLAB_API_URL = "https://kolorlab-api.<account>.workers.dev"
npm run android:sync
Remove-Item Env:VITE_KOLORLAB_API_URL
```

URL API не секрет. В Android-приложение нельзя помещать GitHub token или SESSION_SECRET. JSON-экспорт пользовательской базы остаётся доступен как переносимый формат.

## Требования

- Node.js 22 или новее.
- Android Studio 2025.2.1 или новее с Android SDK.
- Установленный Android SDK Platform API 24 или новее.

Android Studio устанавливает подходящую версию JDK. Сейчас в рабочей среде установлена только Java 8, поэтому сгенерированный Android-проект уже готов, но собрать APK здесь пока нельзя. После установки Android Studio выберите её встроенный JDK в **Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK**.

Если проект расположен в пути с кириллицей на Windows, в `android\gradle.properties` включён параметр `android.overridePathCheck=true`. Он снимает проверку пути Android Gradle Plugin; для сборки нужен JDK 21 или новее.

## Разработка и сборка

```powershell
npm install
npm run android:sync
npm run android:open
```

`android:sync` собирает React-приложение и копирует его в нативный проект. В Android Studio выберите эмулятор или подключённый телефон и запустите конфигурацию `app`.

Для сборки отладочного APK из PowerShell:

```powershell
Push-Location .\android
.\gradlew.bat assembleDebug
Pop-Location
```

APK появится в `android\app\build\outputs\apk\debug\app-debug.apk`. Для публикации в Google Play создайте подписанный Android App Bundle (`.aab`) в Android Studio через **Build → Generate Signed Bundle / APK**.

Изменения интерфейса попадают в Android-приложение после новой сборки и синхронизации. Проекты остаются локальными для устройства; общими являются пользовательский каталог и профили клиентов в приватной базе.
