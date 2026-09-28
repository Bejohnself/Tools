pluginManagement {
    repositories {
        maven("https://maven.aliyun.com/repository/google")       // 阿里云 google 镜像
        maven("https://maven.aliyun.com/repository/central")      // 阿里云 maven central 镜像
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        maven("https://maven.aliyun.com/repository/gradle-plugin") // 阿里云插件镜像
        gradlePluginPortal()
    }
}
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        maven("https://maven.aliyun.com/repository/google")  // 阿里云 google 镜像
        maven("https://maven.aliyun.com/repository/central") // 阿里云 maven central 镜像
        google()
        mavenCentral()
    }
}

rootProject.name = "PasswordManager"
include(":app")
