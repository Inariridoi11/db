name: build-apk
on:
  push: {}
  workflow_dispatch: {}
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'
      - uses: android-actions/setup-android@v3
      - uses: gradle/actions/setup-gradle@v4
      - name: Generate wrapper
        run: gradle wrapper --gradle-version 8.7
      - name: Build debug APK
        run: ./gradlew assembleDebug --no-daemon --stacktrace
      - uses: actions/upload-artifact@v4
        with:
          name: dbizi-debug-apk
          path: app/build/outputs/apk/debug/app-debug.apk
