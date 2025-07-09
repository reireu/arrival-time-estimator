// =================================
// 設定・定数
// =================================
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjdmMjUwODVhMjgwZjQ0NTY4ZmI5MTNmZThjMDM4ODc1IiwiaCI6Im11cm11cjY0In0=';
//この子はbasic apiなので、もっと精密にしたい場合は自分で取ってきてくんろ
const DEFAULT_CENTER = [35.6762, 139.6503];
const DEFAULT_ZOOM = 13;

// =================================
// グローバル変数
// =================================
let map;
let startMarker = null;
let endMarker = null;
let routeLine = null;
let clickCount = 0; 
let startCoords = null;
let endCoords = null;   

// =================================
// UI更新ヘルパー関数
// =================================
/**
 * ステータス表示メッセージを更新します。
 * @param {string} message - 表示するメッセージ
 * @param {string} type - 'info', 'success', 'error', 'loading' のいずれか
 */
function updateStatus(message, type = 'info') {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `status ${type}`; // CSSクラスでスタイルを適用
    }
}

/**
 * 結果表示エリアの情報をクリアします。
 */
function clearResults() {
    document.getElementById('distance').textContent = '-';
    document.getElementById('duration').textContent = '-';
    document.getElementById('eta').textContent = '-';
}

// =================================
// 地図上の地点設定関数
// =================================
/**
 * 出発地点マーカーを地図に設定します。
 * @param {number} lat - 緯度
 * @param {number} lng - 経度
 */
function setStartPoint(lat, lng) {
    if (startMarker) {
        map.removeLayer(startMarker); // 既存マーカーを削除
    }
    startMarker = L.marker([lat, lng], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(map).bindPopup('出発地点').openPopup(); // マーカー追加とポップアップ設定
    startCoords = { lat, lng }; // 座標を保存
}

/**
 * 目的地マーカーを地図に設定します。
 * @param {number} lat - 緯度
 * @param {number} lng - 経度
 */
function setEndPoint(lat, lng) {
    if (endMarker) {
        map.removeLayer(endMarker); 
    }
    endMarker = L.marker([lat, lng], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(map).bindPopup('目的地').openPopup(); // マーカー追加とポップアップ設定
    endCoords = { lat, lng }; // 座標を保存
}

/**
 * 地図上のマーカーとルート、変数をリセットします。
 */
function resetPoints() {
    if (startMarker) {
        map.removeLayer(startMarker);
        startMarker = null;
    }
    if (endMarker) {
        map.removeLayer(endMarker);
        endMarker = null;
    }
    if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
    }
    
    startCoords = null;
    endCoords = null;
    clickCount = 0;
    
    clearResults(); // 結果表示をクリア
    updateStatus('地図上をクリックして出発地点を選択してください'); // ステータスを更新
    document.querySelector('.calculate-btn').disabled = true; // 計算ボタンを無効化
}

// =================================
// OpenRouteService API関連関数
// =================================
/**
 * OpenRouteService APIを呼び出し、ルートデータを取得します。
 * @param {string} transport - 移動手段 ('foot-walking' または 'cycling-regular')
 * @returns {Promise<Object>} - APIからのルートデータ
 */
async function callORSAPI(transport) {
    const profile = transport === 'foot-walking' ? 'foot-walking' : 'cycling-regular';
    
    // ORS APIは [経度, 緯度] の順を要求
    const url = `https://api.openrouteservice.org/v2/directions/${profile}?api_key=${ORS_API_KEY}&start=${startCoords.lng},${startCoords.lat}&end=${endCoords.lng},${endCoords.lat}`;

    const response = await fetch(url, {
        headers: {
            'Accept': 'application/json, application/geo+json, application/gpx+xml, application/polyline',
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`ORS APIエラー: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    console.log("ORS API Response:", data); // デバッグ用にAPIレスポンス全体を出力
    return data;
}

/**
 * ORS APIから取得したルートデータを処理し、結果を更新します。
 * @param {Object} routeFeature - ORS APIレスポンスの features[0] オブジェクト
 * @param {number} userSpeed - ユーザーが入力した速度 (km/h)
 */
function processRouteData(routeFeature, userSpeed) {
    // 距離はORS APIから正確な値を取得
    const distance = routeFeature.properties.segments[0].distance / 1000; // メートルをキロメートルに変換
    
    // ユーザーが入力した速度で時間を再計算
    const durationHours = distance / userSpeed; // 時間単位
    const durationMinutes = Math.round(durationHours * 60); // 分単位に変換して四捨五入

    // 到着予定時刻を計算
    const now = new Date();
    const arrivalTime = new Date(now.getTime() + durationMinutes * 60000); // ミリ秒単位に変換

    // 結果を表示
    updateResultsDisplay(distance, durationMinutes, arrivalTime);
}

/**
 * 計算結果（距離、所要時間、ETA）をUIに表示します。
 * @param {number} distance - 距離 (km)
 * @param {number} durationMinutes - 所要時間 (分)
 * @param {Date} arrivalTime - 到着予定時刻
 */
function updateResultsDisplay(distance, durationMinutes, arrivalTime) {
    document.getElementById('distance').textContent = `${distance.toFixed(2)} km`;

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    let durationText = '';
    if (hours > 0) {
        durationText = `${hours}時間${minutes}分`;
    } else {
        durationText = `${minutes}分`;
    }
    document.getElementById('duration').textContent = durationText;

    const etaText = arrivalTime.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('eta').textContent = etaText;
}

/**
 * ルートを地図上に描画します。
 * @param {Object} routeFeature - ORS APIレスポンスの features[0] オブジェクト
 */
function drawRouteOnMap(routeFeature) {
    if (routeLine) {
        map.removeLayer(routeLine); // 既存のルート線を削除
    }
    
    // ORSのgeoJSON形式のcoordinatesは [経度, 緯度] なので、Leafletの [緯度, 経度] に変換
    const routeCoordinates = routeFeature.geometry.coordinates.map(coord => [coord[1], coord[0]]);

    routeLine = L.polyline(routeCoordinates, {
        color: '#2196f3', // 青色
        weight: 4,
        opacity: 0.7
    }).addTo(map);

    map.fitBounds(routeLine.getBounds()); // ルート全体が画面に収まるように地図を調整
}

/**
 * 計算エラーを処理し、UIに表示します。
 * @param {Error} error - 発生したエラーオブジェクト
 */
function handleCalculationError(error) {
    console.error('Calculation Error:', error);
    updateStatus(`計算エラー: ${error.message}`, 'error');
}

// =================================
// 主要なイベントハンドラー
// =================================
/**
 * 地図クリックイベントのハンドラーです。出発地点と目的地を設定します。
 * @param {Object} e - Leafletのクリックイベントオブジェクト
 */
function handleMapClick(e) {
    const { lat, lng } = e.latlng;
    
    if (clickCount === 0) {
        setStartPoint(lat, lng);
        clickCount++;
        updateStatus('目的地をクリックしてください');
    } else if (clickCount === 1) {
        setEndPoint(lat, lng);
        clickCount++;
        updateStatus('出発地点と目的地が設定されました。計算ボタンを押してください', 'success');
        document.querySelector('.calculate-btn').disabled = false; // 計算ボタンを有効化
    } else {
        // 既に2点設定されている場合、リセットして新しい出発地点を設定
        resetPoints();
        setStartPoint(lat, lng);
        clickCount = 1;
        updateStatus('目的地をクリックしてください');
    }
}

/**
 * ETA計算ボタンがクリックされたときに実行されます。
 */
async function calculateETA() {
    if (!startCoords || !endCoords) {
        updateStatus('出発地点と目的地を設定してください', 'error');
        return;
    }

    const speed = parseFloat(document.getElementById('speed').value);
    const transport = document.querySelector('input[name="transport"]:checked').value;

    if (isNaN(speed) || speed <= 0) { // 数値と正の値をチェック
        updateStatus('有効な速度を入力してください', 'error');
        return;
    }

    updateStatus('ETA計算中...', 'loading');
    const calculateBtn = document.querySelector('.calculate-btn');
    calculateBtn.disabled = true; // 計算中はボタンを無効化

    try {
        const routeData = await callORSAPI(transport);
        
        // ORS APIのレスポンスは features 配列の中にルート情報が含まれる
        if (routeData && routeData.features && routeData.features.length > 0) {
            const routeFeature = routeData.features[0]; // features[0] をルートデータとして取得
            
            // ルートにproperties (summaryが含まれる) と geometry があるか確認
            if (routeFeature.properties && routeFeature.properties.segments && routeFeature.geometry) {
                // ユーザーが入力した速度を processRouteData に渡す
                processRouteData(routeFeature, speed);
                drawRouteOnMap(routeFeature);
                updateStatus('ETA計算完了！', 'success');
            } else {
                updateStatus('ルートの詳細データが見つかりませんでした。', 'error');
            }
        } else {
            updateStatus('ルートが見つかりませんでした。', 'error');
        }

    } catch (error) {
        handleCalculationError(error);
    } finally {
        calculateBtn.disabled = false; // 計算終了後にボタンを再度有効化
    }
}

// =================================
// 地図の初期化
// =================================
function initMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error('地図コンテナが見つかりません');
        updateStatus('地図の読み込みに失敗しました', 'error');
        return;
    }
    
    try {
        map = L.map('map', {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            zoomControl: true,
            scrollWheelZoom: true
        });
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(map);
        
        map.whenReady(function() {
            console.log('地図が正常に読み込まれました');
            updateStatus('地図上をクリックして出発地点を選択してください');
            map.on('click', handleMapClick); // 地図クリックイベントを設定
        });
        
    } catch (error) {
        console.error('地図の初期化に失敗しました:', error);
        updateStatus('地図の読み込みに失敗しました', 'error');
    }
}

// =================================
// 初期化処理（DOM読み込み完了時）
// =================================
document.addEventListener('DOMContentLoaded', function() {
    initMap(); // 地図の初期化
    
    // 移動手段変更時の速度調整
    document.querySelectorAll('input[name="transport"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const speedInput = document.getElementById('speed');
            if (this.value === 'foot-walking') {
                speedInput.value = 4; // 徒歩のデフォルト速度
            } else if (this.value === 'cycling-regular') {
                speedInput.value = 15; // 自転車のデフォルト速度
            }
        });
    });
});