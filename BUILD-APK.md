# AI人生档案馆 - Android APK 构建指南

## 前提条件

构建 APK 需要以下环境（本机可能未安装 Android SDK，需按以下步骤操作）：

### 1. 安装 Java JDK 17

```bash
# Windows: 下载并安装 Oracle JDK 17 或 OpenJDK 17
# https://adoptium.net/

# 设置环境变量 JAVA_HOME 指向 JDK 安装目录
# 例如: C:\Program Files\Java\jdk-17
```

### 2. 安装 Android Studio

```bash
# 下载 Android Studio
# https://developer.android.com/studio

# 安装时勾选 Android SDK、Android SDK Platform-Tools、Android Emulator
```

### 3. 配置 Android SDK

安装 Android Studio 后，打开它并安装：
- Android SDK Platform 34 (Android 14)
- Android SDK Build-Tools 34.0.0
- Android SDK Platform-Tools

设置环境变量：
```
ANDROID_HOME=C:\Users\你的用户名\AppData\Local\Android\Sdk
ANDROID_SDK_ROOT=C:\Users\你的用户名\AppData\Local\Android\Sdk
```

将以下路径添加到 PATH：
```
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\tools
%ANDROID_HOME%\emulator
```

## 构建步骤

### 步骤 1：同步 Web 资源

确保 `www/` 目录包含最新的前端文件，然后执行：

```bash
# 复制前端文件到 www 目录（如果尚未复制）
Copy-Item -Path index.html, app.js, manifest.json -Destination www\ -Force
Copy-Item -Path assets -Destination www\assets -Recurse -Force

# 同步到 Android 项目
npx cap copy android
```

### 步骤 2：使用 Android Studio 打开项目

```bash
npx cap open android
```

这会用 Android Studio 打开 `android/` 目录。

### 步骤 3：构建 APK

**方式 A：通过 Android Studio GUI**

1. 等待 Gradle 同步完成（右下角进度条）
2. 菜单栏：Build → Build Bundle(s) / APK(s) → Build APK(s)
3. 等待构建完成，点击通知栏的 "locate" 找到 APK 文件

**方式 B：通过命令行**

```bash
cd android
./gradlew assembleDebug
```

生成的 APK 位于：
```
android/app/build/outputs/apk/debug/app-debug.apk
```

### 步骤 4：安装到手机

**方式 A：USB 连接安装**

1. 手机开启「开发者选项」和「USB 调试」
2. USB 连接电脑
3. 执行：
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

**方式 B：直接传输 APK**

将 `app-debug.apk` 文件传到手机，点击安装。

## 构建发布版 APK（Release）

### 1. 生成签名密钥

```bash
keytool -genkey -v -keystore life-archive.keystore -alias life-archive -keyalg RSA -keysize 2048 -validity 10000
```

按提示输入密码和信息。

### 2. 配置签名

编辑 `android/app/build.gradle`，在 `android {}` 块中添加：

```gradle
signingConfigs {
    release {
        storeFile file('../../life-archive.keystore')
        storePassword '你的密钥库密码'
        keyAlias 'life-archive'
        keyPassword '你的密钥密码'
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

### 3. 构建发布版

```bash
cd android
./gradlew assembleRelease
```

生成的 APK 位于：
```
android/app/build/outputs/apk/release/app-release.apk
```

## 常见问题

### Q: Gradle 同步失败

- 检查 `android/local.properties` 中的 `sdk.dir` 路径是否正确
- 确保网络能访问 Google Maven 仓库（可能需要配置代理）

### Q: `npx cap copy` 报错 "." is not a valid webDir

Capacitor 不允许使用 "." 作为 webDir。已改为使用 "www" 目录。
每次修改前端代码后，需要将文件复制到 `www/` 目录再执行 `npx cap copy android`。

### Q: 构建时提示缺少 SDK

打开 Android Studio → Settings → Appearance & Behavior → System Settings → Android SDK，
安装所需版本的 SDK Platform 和 Build-Tools。

### Q: 应用启动后白屏

- 检查 `www/index.html` 是否存在且正确
- 确认 `capacitor.config.json` 中 `webDir` 设置为 `"www"`
- 执行 `npx cap copy android` 重新同步资源
