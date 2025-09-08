## ETA Map Calculator using OpenRouteService

公開URL
https://muds.gdl.jp/~s2322023
地図上で出発地点と目的地をクリックすることで、OpenRouteService APIを使って実際の道路ルートに沿ったETA（到着予想時刻）を計算・表示するWebアプリです。

## 機能

- 地図上での出発地点と目的地の選択
- OpenRouteServiceを使った徒歩・自転車などのルート計算
- 実ルートに基づいた距離・所要時間・到着時刻（ETA）の表示
- ルート線の描画と地図の自動ズーム
- Leaflet.jsによる地図UI


## 使用技術

- HTML / CSS / JavaScript
- [Leaflet.js](https://leafletjs.com/)
- [OpenRouteService API](https://openrouteservice.org/)
- OpenStreetMapタイル

## セットアップ方法

1. このリポジトリをクローン
    ```bash
    git clone https://github.com/reireu//arrival-time-estimator.git
    cd arrival-time-estimator
    ```

index.htmlをクリック or php -S localhost:8080
よりwebアクセス可能。

<img width="1484" alt="スクリーンショット 2025-07-09 13 09 40" src="https://github.com/user-attachments/assets/a031e082-ef04-477c-bf1c-4389edc6b954" />


## APIキーについて

- サイトにあるbasicapiを用いています
- 過剰アクセスや商用利用には有料プランが必要です

