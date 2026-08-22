<?php
/* Copy this folder to public_html. Set these four values from hPanel > MySQL
 * Databases. Prefer keeping this file one directory above public_html when
 * possible, then update api/index.php to require that external path. */
/* Local XAMPP convenience: when this copy still has placeholder values, use
 * the reference application's local MySQL connection. Hostinger never has
 * that path, so production continues to use the values below. */
$localReferenceEnv = 'C:/XAMPP/htdocs/order booking system/server/.env';
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

// MSG91 widget credentials. Locally these are read from the working reference
// setup; for Hostinger replace the empty fallbacks with your MSG91 values.
function localEnvValue(string $key): string {
  global $localEnvText;
  if (!isset($localEnvText) || !preg_match('/^' . preg_quote($key, '/') . '\s*=\s*["\']?([^\r\n"\']+)/m', $localEnvText, $match)) return '';
  return trim($match[1]);
}
define('OTP_PROVIDER', localEnvValue('OTP_PROVIDER') ?: 'msg91');
define('MSG91_WIDGET_ID', localEnvValue('MSG91_WIDGET_ID') ?: '');
define('MSG91_TOKEN_AUTH', localEnvValue('MSG91_TOKEN_AUTH') ?: '');
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
