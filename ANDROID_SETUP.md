# KolorLab для Android

KolorLab использует Capacitor 8: React-приложение собирается как веб-интерфейс и запускается внутри Android WebView. Нативная оболочка позволяет подключать функции Android через плагины, сохраняя общий код для сайта и приложения.

Пользовательские цвета и краски можно переносить между приложением и сайтом через JSON-файл: в каталоге оттенков выберите **«Сохранить базу»**, чтобы открыть системное меню Android для передачи или сохранения файла, и **«Загрузить базу»**, чтобы импортировать её с устройства. `npm run android:sync` подключает используемые файловый и системный Share-плагины.

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

Изменения интерфейса попадают в Android-приложение после новой сборки и синхронизации. Локальные проекты в приложении хранятся отдельно от данных браузерной версии.
