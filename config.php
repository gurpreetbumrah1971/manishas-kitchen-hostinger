<?php
/* Copy this folder to public_html. Set these four values from hPanel > MySQL
 * Databases. Prefer keeping this file one directory above public_html when
 * possible, then update api/index.php to require that external path. */
/* Local XAMPP convenience: when this copy still has placeholder values, use
 * the reference application's local MySQL connection. Hostinger never has
 * that path, so production continues to use the values below. */
$localReferenceEnv = 'C:/XAMPP/htdocs/order booking system/server/.env';
$privateConfig = [];
// On shared hosting, keep secrets one directory above public_html. This file
// is deliberately ignored by Git, so deployments never overwrite or expose it.
$privateConfigPath = dirname(__DIR__) . '/config.local.php';
if (is_file($privateConfigPath)) {
  $loadedConfig = require $privateConfigPath;
  if (is_array($loadedConfig)) $privateConfig = $loadedConfig;
}
$localDatabaseUrl = null;
if (is_file($localReferenceEnv)) {
  // The reference .env has values which are not valid PHP INI syntax, so
  // extract only DATABASE_URL rather than parsing the complete file.
  $localEnvText = file_get_contents($localReferenceEnv);
  if (preg_match('/^DATABASE_URL\s*=\s*["\']?([^\r\n"\']+)/m', $localEnvText, $match)) {
    $localDatabaseUrl = trim($match[1]);
  }
}
$localDatabase = $localDatabaseUrl ? parse_url($localDatabaseUrl) : null;
define('DB_HOST', $localDatabase['host'] ?? 'localhost');
define('DB_NAME', $localDatabase ? 'order_booking_hostinger' : 'u515749657_manikitchen');
define('DB_USER', isset($localDatabase['user']) ? rawurldecode($localDatabase['user']) : 'u515749657_manisha');
define('DB_PASS', isset($localDatabase['pass']) ? rawurldecode($localDatabase['pass']) : 'Manisha1981!');
const APP_SECRET = '5fa703cb0bd8adc42c185ea066191b5d6bea2edf7cd26a079e3f398cdc54eceb';
const ADMIN_DEFAULT_USER = 'admin';
const ADMIN_DEFAULT_PASSWORD = 'admin123';

// MSG91 widget credentials. `MSG91_TOKEN_AUTH` is the widget token generated
// in MSG91's OTP Widget screen and is used by both the browser and PHP to
// verify the widget's reqId OTP session. `MSG91_AUTHKEY` is retained only for
// other MSG91 services and is not used by this OTP Widget flow.
// On shared hosting without environment variables, paste the three values
// below. Keep this file outside public_html when the host permits it.
$msg91WidgetId = '';
$msg91TokenAuth = '';
$msg91Authkey = '';
function localEnvValue(string $key): string {
  global $localEnvText;
  if (!isset($localEnvText) || !preg_match('/^' . preg_quote($key, '/') . '\s*=\s*["\']?([^\r\n"\']+)/m', $localEnvText, $match)) return '';
  return trim($match[1]);
}
function configValue(string ...$keys): string {
  global $privateConfig;
  foreach ($keys as $key) {
    $value = getenv($key);
    if ($value !== false && trim((string)$value) !== '') return trim((string)$value);
    $value = $privateConfig[$key] ?? '';
    if (is_string($value) && trim($value) !== '') return trim($value);
    $value = localEnvValue($key);
    if ($value !== '') return $value;
  }
  return '';
}
define('OTP_PROVIDER', strtolower(configValue('OTP_PROVIDER') ?: 'msg91'));
define('MSG91_WIDGET_ID', configValue('MSG91_WIDGET_ID') ?: $msg91WidgetId);
define('MSG91_TOKEN_AUTH', configValue('MSG91_TOKEN_AUTH', 'MSG91_WIDGET_TOKEN', 'MSG91_WIDGET_AUTH_TOKEN') ?: $msg91TokenAuth);
define('MSG91_AUTHKEY', configValue('MSG91_AUTHKEY', 'MSG91_AUTH_KEY') ?: $msg91Authkey);
// XAMPP's bundled CA list is outdated on this computer. Disable verification
// only for this local reference-assisted setup; Hostinger keeps it enabled.
define('MSG91_SSL_VERIFY', !is_file($localReferenceEnv));

function db(): PDO {
  static $pdo = null;
  if ($pdo === null) {
    $pdo = new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4', DB_USER, DB_PASS,
      [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
  }
  return $pdo;
}
