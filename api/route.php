<?php
/**
 * ETA計算API
 * 出発地点と目的地点から実際の道路距離を取得し、ETA を計算する
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// POSTリクエストのみ許可
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// リクエストボディを取得
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
    exit;
}

// 必要なパラメータの検証
$required_params = ['start', 'end', 'speed'];
foreach ($required_params as $param) {
    if (!isset($input[$param])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => "Missing parameter: $param"]);
        exit;
    }
}

$start = $input['start'];
$end = $input['end'];
$speed = floatval($input['speed']);
$transport = isset($input['transport']) ? $input['transport'] : 'foot-walking';

// 座標の検証
if (!isset($start['lat']) || !isset($start['lng']) || !isset($end['lat']) || !isset($end['lng'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid coordinates']);
    exit;
}

if ($speed <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid speed']);
    exit;
}

try {
    // 実際の道路距離を取得
    $distance = getRoadDistance($start, $end, $transport);
    
    if ($distance === false) {
        throw new Exception('Failed to calculate distance');
    }
    
    // ETA計算
    $eta_data = calculateETA($distance, $speed);
    
    echo json_encode([
        'success' => true,
        'distance' => $distance,
        'duration' => $eta_data['duration'],
        'eta' => $eta_data['eta'],
        'eta_formatted' => $eta_data['eta_formatted']
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

/**
 * 実際の道路距離を取得する関数
 * OpenRouteService API を使用
 */
function getRoadDistance($start, $end, $transport = 'foot-walking') {
    // OpenRouteService API キー
    $ors_api_key = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjdmMjUwODVhMjgwZjQ0NTY4ZmI5MTNmZThjMDM4ODc1IiwiaCI6Im11cm11cjY0In0=';
    
    // OpenRouteService API を使用
    $distance = getOpenRouteServiceDistance($start, $end, $ors_api_key, $transport);
    
    if ($distance !== false) {
        return $distance;
    }
    
    // APIが失敗した場合は直線距離×1.3で推定
    logMessage("OpenRouteService API failed, using straight distance estimation");
    return calculateStraightDistance($start, $end) * 1.3;
}

/**
 * OpenRouteService API を使用して距離を取得
 */
function getOpenRouteServiceDistance($start, $end, $api_key, $transport = 'foot-walking') {
    $url = 'https://api.openrouteservice.org/v2/directions/' . $transport;
    $data = [
        'coordinates' => [
            [$start['lng'], $start['lat']],
            [$end['lng'], $end['lat']]
        ]
    ];
    
    $options = [
        'http' => [
            'header' => [
                'Content-Type: application/json',
                'Authorization: ' . $api_key
            ],
            'method' => 'POST',
            'content' => json_encode($data)
        ]
    ];
    
    $context = stream_context_create($options);
    $response = file_get_contents($url, false, $context);
    
    if ($response === false) {
        logMessage("OpenRouteService API request failed");
        return false;
    }
    
    $result = json_decode($response, true);
    
    if (isset($result['routes'][0]['summary']['distance'])) {
        $distance = $result['routes'][0]['summary']['distance'] / 1000; // メートルからキロメートルに変換
        logMessage("OpenRouteService API success: distance = " . $distance . " km");
        return $distance;
    }
    
    if (isset($result['error'])) {
        logMessage("OpenRouteService API error: " . json_encode($result['error']));
    }
    
    return false;
}

/**
 * 直線距離を計算（Haversine公式）
 */
function calculateStraightDistance($start, $end) {
    $earth_radius = 6371; // 地球の半径（km）
    
    $lat1 = deg2rad($start['lat']);
    $lon1 = deg2rad($start['lng']);
    $lat2 = deg2rad($end['lat']);
    $lon2 = deg2rad($end['lng']);
    
    $dlat = $lat2 - $lat1;
    $dlon = $lon2 - $lon1;
    
    $a = sin($dlat/2) * sin($dlat/2) + cos($lat1) * cos($lat2) * sin($dlon/2) * sin($dlon/2);
    $c = 2 * atan2(sqrt($a), sqrt(1-$a));
    
    return $earth_radius * $c;
}

/**
 * ETA計算
 */
function calculateETA($distance, $speed) {
    // 所要時間（時間）
    $duration_hours = $distance / $speed;
    
    // 所要時間（分）
    $duration_minutes = round($duration_hours * 60);
    
    // 現在時刻
    $now = new DateTime();
    
    // 到着予定時刻
    $eta = clone $now;
    $eta->add(new DateInterval('PT' . $duration_minutes . 'M'));
    
    return [
        'duration' => $duration_minutes,
        'eta' => $eta->format('H:i'),
        'eta_formatted' => $eta->format('Y-m-d H:i:s')
    ];
}

/**
 * ログ出力関数（デバッグ用）
 */
function logMessage($message) {
    $log_file = 'eta_log.txt';
    $timestamp = date('Y-m-d H:i:s');
    file_put_contents($log_file, "[$timestamp] $message\n", FILE_APPEND);
}

/**
 * エラー処理
 */
function handleError($error_message) {
    logMessage("Error: $error_message");
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $error_message]);
    exit;
}

/*
使用例：

POSTリクエストの例：
{
    "start": {
        "lat": 35.6762,
        "lng": 139.6503
    },
    "end": {
        "lat": 35.6585,
        "lng": 139.7454
    },
    "speed": 4.5
}

レスポンスの例：
{
    "success": true,
    "distance": 8.234,
    "duration": 110,
    "eta": "15:30",
    "eta_formatted": "2025-07-09 15:30:00"
}
*/