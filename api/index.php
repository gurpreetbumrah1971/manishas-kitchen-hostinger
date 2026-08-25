<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/config.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

function out($data, int $status = 200): never { http_response_code($status); echo json_encode($data, JSON_UNESCAPED_SLASHES); exit; }
function body(): array { static $b=null; if ($b===null) $b=json_decode(file_get_contents('php://input'),true) ?: []; return $b; }
function path(): string {
  $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '';
  // Works both in Hostinger public_html (/api/health) and in a local XAMPP
  // subfolder (/order%20booking%20system%20hostinger/api/health).
  $parts = preg_split('#/api(?:/|$)#', $uri, 2);
  return trim($parts[1] ?? '', '/');
}
function method(): string { return $_SERVER['REQUEST_METHOD']; }
function money($n): float { return round(max(0,(float)$n),2); }
function mobile($n): string { $n=preg_replace('/\D/','',(string)$n); return strlen($n)===10 ? '91'.$n : $n; }
function token(array $claims, int $ttl): string { $claims['exp']=time()+$ttl; $p=rtrim(strtr(base64_encode(json_encode($claims)),'+/','-_'),'='); return $p.'.'.hash_hmac('sha256',$p,APP_SECRET); }
function tokenClaims(string $value): ?array {
  $v=preg_replace('/^Bearer\s+/i','',$value); [$p,$s]=array_pad(explode('.',$v,2),2,''); if (!$p || !hash_equals(hash_hmac('sha256',$p,APP_SECRET),$s)) return null; $d=json_decode(base64_decode(strtr($p,'-_','+/')),true); return is_array($d) && ($d['exp']??0)>time() ? $d : null;
}
function claims(): ?array {
  // Apache/FastCGI installations expose this header differently. Support the
  // standard, redirected, and request-header variants used by XAMPP/Hostinger.
  $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
  if (!$authorization && function_exists('getallheaders')) {
    $headers = getallheaders();
    $authorization = $headers['Authorization'] ?? $headers['authorization'] ?? '';
  }
  return tokenClaims($authorization);
}
function auth(string $type): array { $c=claims(); if (!$c || ($c['type']??'')!==$type) out(['error'=>'Unauthorized'],401); return $c; }
function stmt(string $sql,array $params=[]): PDOStatement { $s=db()->prepare($sql); $s->execute($params); return $s; }
function defaultAdmin(): void { $count=(int)db()->query('SELECT COUNT(*) FROM admin')->fetchColumn(); if (!$count) stmt('INSERT INTO admin(username,password) VALUES (?,?)',[ADMIN_DEFAULT_USER,password_hash(ADMIN_DEFAULT_PASSWORD,PASSWORD_DEFAULT)]); }
function projectUrl(string $url): string {
  if ($url === '' || preg_match('#^https?://#i', $url)) return $url;
  $base = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'))), '/');
  $base = str_replace(' ', '%20', $base);
  // The original database uses /food/... URLs, while this PHP build serves
  // those copied files from assets/food/.
  if (str_starts_with($url, '/food/')) $url = '/assets' . $url;
  return $base . (str_starts_with($url, '/') ? $url : '/' . $url);
}
function menuRow(array $r): array { $r['isVeg']=(bool)$r['isVeg']; $r['isAvailable']=(bool)$r['isAvailable']; $r['categoryId']=(int)$r['categoryId']; $r['price']=(float)$r['price']; $r['image']=projectUrl((string)($r['image'] ?? '')); $r['category']=['id'=>(int)$r['categoryId'],'name'=>$r['categoryName']]; unset($r['categoryName']); return $r; }
function customerFor(string $mobileNumber,string $name=''): array { $p=db(); $s=stmt('SELECT * FROM customer WHERE mobileNumber=?',[$mobileNumber]); $c=$s->fetch(); if (!$c) { $code='MK'.strtoupper(substr(bin2hex(random_bytes(5)),0,8)); stmt('INSERT INTO customer(mobileNumber,name,referralCode) VALUES(?,?,?)',[$mobileNumber,$name?:null,$code]); $c=stmt('SELECT * FROM customer WHERE id=?',[$p->lastInsertId()])->fetch(); } elseif ($name) { stmt('UPDATE customer SET name=? WHERE id=?',[$name,$c['id']]); $c['name']=$name; } return $c; }
function wallet(int $id): array { $c=stmt('SELECT id,mobileNumber,name,birthday,anniversary,referralCode,cashbackBalance FROM customer WHERE id=?',[$id])->fetch(); if (!$c) out(['error'=>'Customer not found'],404); $c['id']=(int)$c['id'];$c['cashbackBalance']=(float)$c['cashbackBalance']; $c['savedAddresses']=stmt('SELECT id,label,address FROM customeraddress WHERE customerId=? ORDER BY updatedAt DESC',[$id])->fetchAll(); $tx=stmt('SELECT ct.id,ct.type,ct.amount,ct.balanceAfter balanceAfter,ct.note,ct.createdAt createdAt,o.orderNumber orderNumber FROM cashbacktransaction ct LEFT JOIN `order` o ON o.id=ct.orderId WHERE ct.customerId=? ORDER BY ct.createdAt DESC,ct.id DESC LIMIT 50',[$id])->fetchAll(); foreach($tx as &$row){$row['id']=(int)$row['id'];$row['amount']=(float)$row['amount'];$row['balanceAfter']=(float)$row['balanceAfter'];} return ['customer'=>$c,'transactions'=>$tx]; }
function adminCustomer(int $id): array { $row=stmt('SELECT id,mobileNumber number,name,birthday,anniversary,referralCode referralCode,cashbackBalance,createdAt createdAt,updatedAt updatedAt FROM customer WHERE id=?',[$id])->fetch(); if(!$row) throw new RuntimeException('Customer not found'); $row['id']=(int)$row['id'];$row['cashbackBalance']=(float)$row['cashbackBalance'];$row['orders']=stmt('SELECT id,orderNumber,orderType,status,grandTotal,createdAt,address FROM `order` WHERE customerId=? ORDER BY createdAt DESC',[$id])->fetchAll();$row['deliveryAddresses']=stmt("SELECT address FROM `order` WHERE customerId=? AND address IS NOT NULL AND address<>'' GROUP BY address ORDER BY MAX(createdAt) DESC",[$id])->fetchAll(PDO::FETCH_COLUMN);$row['totalSpent']=array_sum(array_map(fn($order)=>(float)$order['grandTotal'],$row['orders']));$row['firstOrderAt']=count($row['orders'])?end($row['orders'])['createdAt']:null;$row['latestOrderAt']=count($row['orders'])?$row['orders'][0]['createdAt']:null;return $row; }
function adminOrder(array $order): array {
  $order['id'] = (int)$order['id'];
  foreach (['totalAmount','gstAmount','discountAmount','grandTotal','cashbackEarned','cashbackRedeemed','referralDiscount'] as $key) if (isset($order[$key])) $order[$key] = (float)$order[$key];
  if (isset($order['preparationMinutes'])) $order['preparationMinutes'] = (int)$order['preparationMinutes'];
  $items = stmt('SELECT oi.id,oi.foodItemId,oi.quantity,oi.unitPrice,oi.subtotal,f.name,f.image FROM orderitem oi JOIN fooditem f ON f.id=oi.foodItemId WHERE oi.orderId=?', [$order['id']])->fetchAll();
  $order['orderItems'] = array_map(function (array $item): array {
    return ['id'=>(int)$item['id'],'foodItemId'=>(int)$item['foodItemId'],'quantity'=>(int)$item['quantity'],'unitPrice'=>(float)$item['unitPrice'],'subtotal'=>(float)$item['subtotal'],'foodItem'=>['id'=>(int)$item['foodItemId'],'name'=>$item['name'],'image'=>projectUrl((string)$item['image'])]];
  }, $items);
  return $order;
}
function uploadedFile(string $key,array $allowed,string $folder,int $maxBytes): string { auth('admin'); if(empty($_FILES[$key])||($_FILES[$key]['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK) throw new RuntimeException('Please choose a file to upload.'); $file=$_FILES[$key]; if(($file['size']??0)>$maxBytes) throw new RuntimeException('The upload is too large.'); $mime=(new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']); if(!isset($allowed[$mime])) throw new RuntimeException('This file type is not allowed.'); $dir=dirname(__DIR__).'/uploads/'.$folder; if(!is_dir($dir)&&!mkdir($dir,0755,true)&&!is_dir($dir)) throw new RuntimeException('Unable to prepare the upload directory.'); $name=bin2hex(random_bytes(16)).'.'.$allowed[$mime]; if(!move_uploaded_file($file['tmp_name'],$dir.'/'.$name)) throw new RuntimeException('Unable to save the upload.'); return projectUrl('/uploads/'.$folder.'/'.$name); }
function orderItemsFromPayload(array $items): array {
  if (!$items) throw new RuntimeException('Order items are required');
  $resolved=[];
  foreach ($items as $item) {
    $name=trim(preg_replace('/\s*\+\s*(?:Extra )?Cheese\s*$/i','',(string)($item['name']??'')));
    $legacyNames=['Egg Burji + 2 Pav (Single)'=>'Single Egg Burjee + 2 Butter Pav','Egg Burji + 2 Pav (Double)'=>'Double Egg Burjee + 4 Butter Pav','Egg Omelet + 2 Pav (Single)'=>'Single Egg Omelet + 2 Butter Pav','Egg Omelet + 2 Pav (Double)'=>'Double Omelet + 4 Butter Pav'];
    $name=$legacyNames[$name]??$name;
    $food=$name?stmt('SELECT * FROM fooditem WHERE name=? AND isAvailable=1',[$name])->fetch():false;
    if (!$food) throw new RuntimeException('An item in your cart is unavailable. Please refresh the menu.');
    $quantity=max(1,(int)($item['quantity']??1)); $price=(float)$food['price'];
    $resolved[]=['food'=>$food,'quantity'=>$quantity,'price'=>$price,'subtotal'=>round($quantity*$price,2)];
  }
  return $resolved;
}
function deliveryChargeForOrder(float $subtotal, string $orderType, string $locality, string $sector, string $customLocation): float {
  // Mirrors assets/app.js's deliveryChargeForSubtotal() so the stored total matches what the customer saw at checkout.
  if ($orderType !== 'DELIVERY') return 0;
  if ($locality === 'koparkhairne') {
    $sectorNum = (int)$sector;
    if (!$sectorNum) return 0;
    if ($sectorNum === 17) return 0;
    if ($sectorNum >= 16 && $sectorNum <= 22) return $subtotal < 199 ? 20 : 0;
    if ($subtotal < 199) return 30;
    if ($subtotal < 300) return 20;
    return 0;
  }
  if (in_array($locality, ['bonkhode', 'ghansoli'], true)) {
    if ($subtotal < 199) return 50;
    if ($subtotal < 300) return 35;
    return 20;
  }
  if ($locality === 'vashi') {
    if ($subtotal < 199) return 65;
    if ($subtotal < 300) return 45;
    return 30;
  }
  if ($locality === 'other' && trim($customLocation) !== '') {
    if ($subtotal < 199) return 50;
    if ($subtotal < 300) return 40;
    return 0;
  }
  return 0;
}
function createOrderFromRequest(array $b): never {
  $identity=auth('customer');
  $customer=stmt('SELECT * FROM customer WHERE id=?',[(int)$identity['id']])->fetch();
  if (!$customer) out(['error'=>'Customer account not found. Please log in again.'],401);
  $pdo=db(); $pdo->beginTransaction();
  try {
    $items=orderItemsFromPayload($b['items']??[]); $subtotal=array_sum(array_column($items,'subtotal'));
    $delivery=deliveryChargeForOrder($subtotal,(string)($b['orderType']??''),(string)($b['locality']??''),(string)($b['sector']??''),(string)($b['customLocation']??''));
    $discount=money($b['discountAmount']??0); $referralCode=strtoupper(trim((string)($b['referralCode']??''))); $referrer=null; $referralDiscount=0;
    if ($referralCode !== '') { $referrer=stmt('SELECT id,cashbackBalance FROM customer WHERE referralCode=?',[$referralCode])->fetch(); $prior=(int)stmt('SELECT COUNT(*) FROM `order` WHERE customerId=?',[$customer['id']])->fetchColumn(); if (!$referrer || (int)$referrer['id']===(int)$customer['id'] || $prior>0) { $referrer=null; $referralCode=''; } else { $referralDiscount=money($subtotal*0.05); $discount=money($discount+$referralDiscount); } }
    $beforeCashback=money($subtotal+money($b['gstAmount']??0)-$discount);
    $requested=money($b['cashbackRedeemAmount']??0);
    $redeemed=min($requested,(float)$customer['cashbackBalance'],$beforeCashback);
    $foodBillAfterCashback=money($beforeCashback-$redeemed); $grand=money($foodBillAfterCashback+$delivery); $cashbackRate=$referrer?0.05:0.10; $earned=money($foodBillAfterCashback*$cashbackRate); $number='ORD-'.round(microtime(true)*1000); $session=bin2hex(random_bytes(24));
    stmt('INSERT INTO `order`(orderNumber,customerId,customerName,mobileNumber,whatsappNumber,email,address,tableNumber,orderType,paymentMethod,totalAmount,gstAmount,discountAmount,referralCode,referrerId,referralDiscount,cashbackRedeemed,cashbackEarned,grandTotal,customerSessionToken,customerSessionExpiresAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))',[$number,$customer['id'],$b['customerName']??'Guest',$customer['mobileNumber'],$b['whatsappNumber']??null,$b['email']??null,$b['address']??null,$b['tableNumber']??null,in_array($b['orderType']??'', ['DINE_IN','TAKEAWAY','DELIVERY'])?$b['orderType']:'DINE_IN',in_array($b['paymentMethod']??'', ['CASH','UPI','CARD'])?$b['paymentMethod']:'UPI',$subtotal,money($b['gstAmount']??0),$discount,$referralCode?:null,$referrer['id']??null,$referralDiscount,$redeemed,$earned,$grand,$session]);
    $orderId=(int)$pdo->lastInsertId(); foreach($items as $item) stmt('INSERT INTO orderitem(orderId,foodItemId,quantity,unitPrice,subtotal) VALUES(?,?,?,?,?)',[$orderId,$item['food']['id'],$item['quantity'],$item['price'],$item['subtotal']]);
    $balance=(float)$customer['cashbackBalance']; if($redeemed>0){$balance=money($balance-$redeemed);stmt('INSERT INTO cashbacktransaction(customerId,orderId,type,amount,balanceAfter,note) VALUES(?,?,?,?,?,?)',[$customer['id'],$orderId,'REDEEMED',$redeemed,$balance,'Redeemed on order '.$number]); stmt('UPDATE customer SET cashbackBalance=? WHERE id=?',[$balance,$customer['id']]);}
    $pdo->commit(); out(['id'=>$orderId,'orderNumber'=>$number,'grandTotal'=>$grand,'cashbackRedeemed'=>$redeemed,'cashbackEarned'=>$earned,'customerReferralCode'=>$customer['referralCode'],'referralApplied'=>(bool)$referrer,'customerSessionToken'=>$session,'customerSessionExpiresAt'=>date(DATE_ATOM,time()+1800)],201);
  } catch (Throwable $error) { if($pdo->inTransaction())$pdo->rollBack(); throw $error; }
}
function discountRateForSubtotal(float $subtotal): float {
  // Mirrors assets/app.js's discountRateForSubtotal() and checkout.html's data-discount-tiers.
  $tiers = ['1000' => 0.2, '800' => 0.15, '400' => 0.1];
  $best = 0.0;
  foreach ($tiers as $threshold => $rate) if ($subtotal >= (float)$threshold && $rate > $best) $best = $rate;
  return $best;
}
function syncCashbackForOrder(int $orderId): void {
  // Delta-based so it is safe to call both right after confirmation and again
  // after later item additions increase cashbackEarned - it only ever tops up
  // the difference, never re-credits what was already paid out.
  $order=stmt('SELECT * FROM `order` WHERE id=?',[$orderId])->fetch();
  if (!$order || empty($order['confirmedAt'])) return;
  $creditedSoFar=(float)stmt("SELECT COALESCE(SUM(amount),0) FROM cashbacktransaction WHERE orderId=? AND type='EARNED' AND customerId=?",[$orderId,$order['customerId']])->fetchColumn();
  $due=money((float)$order['cashbackEarned']-$creditedSoFar);
  if ($due>0 && $order['customerId']) { $customer=stmt('SELECT cashbackBalance FROM customer WHERE id=?',[$order['customerId']])->fetch(); if ($customer) { $balance=money((float)$customer['cashbackBalance']+$due); stmt('UPDATE customer SET cashbackBalance=? WHERE id=?',[$balance,$order['customerId']]); stmt('INSERT INTO cashbacktransaction(customerId,orderId,type,amount,balanceAfter,note) VALUES(?,?,?,?,?,?)',[$order['customerId'],$orderId,'EARNED',$due,$balance,'Cashback credited for order '.$order['orderNumber']]); } }
  if (!empty($order['referrerId'])) { $rewardDue=money((float)$order['grandTotal']*0.05); $referrerCreditedSoFar=(float)stmt("SELECT COALESCE(SUM(amount),0) FROM cashbacktransaction WHERE orderId=? AND type='EARNED' AND customerId=?",[$orderId,$order['referrerId']])->fetchColumn(); $referrerDue=money($rewardDue-$referrerCreditedSoFar); if ($referrerDue>0) { $referrer=stmt('SELECT cashbackBalance FROM customer WHERE id=?',[$order['referrerId']])->fetch(); if ($referrer) { $balance=money((float)$referrer['cashbackBalance']+$referrerDue); stmt('UPDATE customer SET cashbackBalance=? WHERE id=?',[$balance,$order['referrerId']]); stmt('INSERT INTO cashbacktransaction(customerId,orderId,type,amount,balanceAfter,note) VALUES(?,?,?,?,?,?)',[$order['referrerId'],$orderId,'EARNED',$referrerDue,$balance,'Referral cashback credited for order '.$order['orderNumber']]); } } }
}
function addItemsToOrder(string $orderNumber, array $b): never {
  $identity=auth('customer');
  $order=stmt('SELECT * FROM `order` WHERE orderNumber=? AND customerId=?',[$orderNumber,(int)$identity['id']])->fetch();
  if (!$order) out(['error'=>'Order not found'],404);
  if ($order['orderType']!=='DINE_IN') out(['error'=>'Only dine-in orders can be updated after booking.'],422);
  if (in_array($order['status'],['DELIVERED','CANCELLED'],true)) out(['error'=>'This order can no longer be updated.'],422);
  $newItems=orderItemsFromPayload($b['items']??[]);
  $pdo=db(); $pdo->beginTransaction();
  try {
    foreach ($newItems as $item) stmt('INSERT INTO orderitem(orderId,foodItemId,quantity,unitPrice,subtotal) VALUES(?,?,?,?,?)',[$order['id'],$item['food']['id'],$item['quantity'],$item['price'],$item['subtotal']]);
    // The final food value across the whole order (not just the new items) decides which discount tier applies.
    $subtotal=money((float)stmt('SELECT COALESCE(SUM(subtotal),0) FROM orderitem WHERE orderId=?',[$order['id']])->fetchColumn());
    $gst=money($subtotal*0.05);
    $tierDiscount=money($subtotal*discountRateForSubtotal($subtotal));
    $referralDiscount=!empty($order['referrerId'])?money($subtotal*0.05):0;
    $studentEligible=trim((string)($b['studentInstitution']??''))!=='' && trim((string)($b['studentGrade']??''))!=='';
    $studentDiscount=$studentEligible?money($subtotal*0.10):0;
    $discount=money($tierDiscount+$referralDiscount+$studentDiscount);
    $beforeCashback=money($subtotal+$gst-$discount);
    $redeemed=(float)$order['cashbackRedeemed'];
    $foodBillAfterCashback=money(max(0,$beforeCashback-$redeemed));
    $cashbackRate=!empty($order['referrerId'])?0.05:0.10;
    $earned=money($foodBillAfterCashback*$cashbackRate);
    $grand=$foodBillAfterCashback; // Dine-in never carries a delivery charge.
    stmt('UPDATE `order` SET totalAmount=?,gstAmount=?,discountAmount=?,referralDiscount=?,cashbackEarned=?,grandTotal=? WHERE id=?',[$subtotal,$gst,$discount,$referralDiscount,$earned,$grand,$order['id']]);
    syncCashbackForOrder($order['id']);
    $pdo->commit();
    out(adminOrder(stmt('SELECT * FROM `order` WHERE id=?',[$order['id']])->fetch()));
  } catch (Throwable $error) { if($pdo->inTransaction())$pdo->rollBack(); throw $error; }
}
function msg91Enabled(): bool { return OTP_PROVIDER === 'msg91' && MSG91_WIDGET_ID !== '' && MSG91_TOKEN_AUTH !== ''; }
function verifyMsg91Otp(string $otp, string $requestId): void {
  if (!msg91Enabled()) throw new RuntimeException('MSG91 OTP is not configured.');
  if ($requestId === '') throw new RuntimeException('MSG91 OTP session is missing. Please request a new OTP.');
  if (!preg_match('/^\d{4}$/', $otp)) throw new RuntimeException('Enter the 4-digit OTP sent to your phone.');
  // Verify the reqId session with the same Widget token used to send it.
  // Using the account Authkey here triggers MSG91 AuthenticationFailure.
  $payload = json_encode(['tokenAuth' => MSG91_TOKEN_AUTH, 'widgetId' => MSG91_WIDGET_ID, 'reqId' => $requestId, 'otp' => $otp]);
  $headers = ['tokenAuth: ' . MSG91_TOKEN_AUTH, 'Content-Type: application/json', 'Accept: application/json'];
  if (function_exists('curl_init')) {
    $curl = curl_init('https://control.msg91.com/api/v5/widget/verifyOtp');
    curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_HTTPHEADER => $headers, CURLOPT_POSTFIELDS => $payload, CURLOPT_SSL_VERIFYPEER => MSG91_SSL_VERIFY, CURLOPT_SSL_VERIFYHOST => MSG91_SSL_VERIFY ? 2 : 0]);
    $raw = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_HTTP_CODE); $curlError = curl_error($curl); curl_close($curl);
  } else {
    $context = stream_context_create(['http' => ['method' => 'POST', 'header' => implode("\r\n", $headers), 'content' => $payload, 'timeout' => 20, 'ignore_errors' => true], 'ssl' => ['verify_peer' => MSG91_SSL_VERIFY, 'verify_peer_name' => MSG91_SSL_VERIFY]]);
    $raw = @file_get_contents('https://control.msg91.com/api/v5/widget/verifyOtp', false, $context);
    $statusLine = $http_response_header[0] ?? ''; preg_match('#\s(\d{3})\s#', $statusLine, $statusMatch); $status = (int)($statusMatch[1] ?? 0); $curlError = '';
  }
  $result = json_decode((string)$raw, true) ?: [];
  $verified = ($result['success'] ?? false) === true || strtolower((string)($result['type'] ?? $result['status'] ?? '')) === 'success';
  if ($status < 200 || $status >= 300 || !$verified) throw new RuntimeException($result['message'] ?? $curlError ?: 'Invalid or expired OTP');
}

try {
  $p=path(); $m=method();
  if ($p==='health') out(['status'=>'ok','runtime'=>'php-mysql']);
  if ($p==='customer/otp-config' && $m==='GET') { if(!msg91Enabled()) out(['error'=>'MSG91 OTP is not configured. Set MSG91_WIDGET_ID and MSG91_TOKEN_AUTH.'],503); out(['widgetId'=>MSG91_WIDGET_ID,'tokenAuth'=>MSG91_TOKEN_AUTH,'captchaRenderId'=>'']); }
  if ($p==='orders' && $m==='POST') createOrderFromRequest(body());
  if (preg_match('#^orders/([^/]+)/items$#',$p,$x) && $m==='PATCH') addItemsToOrder($x[1],body());
  if (preg_match('#^orders/([^/]+)$#',$p,$x) && $m==='GET') { $identity=auth('customer'); $order=stmt('SELECT * FROM `order` WHERE orderNumber=? AND customerId=?',[$x[1],(int)$identity['id']])->fetch(); if (!$order) out(['error'=>'Order not found'],404); out(adminOrder($order)); }
  if ($p==='admin/login' && $m==='POST') { defaultAdmin(); $b=body(); $a=stmt('SELECT * FROM admin WHERE username=?',[trim($b['username']??'')])->fetch(); if (!$a || !password_verify((string)($b['password']??''),$a['password'])) out(['error'=>'Invalid credentials'],401); $exp=date(DATE_ATOM,time()+1800); out(['token'=>token(['type'=>'admin','id'=>(int)$a['id'],'username'=>$a['username']],1800),'username'=>$a['username'],'expiresAt'=>$exp]); }
  if ($p==='categories' && $m==='GET') { $rows=stmt('SELECT c.*,COUNT(f.id) foodCount FROM category c LEFT JOIN fooditem f ON f.categoryId=c.id AND f.isAvailable=1 GROUP BY c.id ORDER BY FIELD(c.name,"Parathas","Frankies","Kebabs","Pakodas","Egg Dishes","Snacks","Beverages")')->fetchAll(); foreach($rows as &$r){$r['id']=(int)$r['id'];$r['image']=projectUrl((string)($r['image'] ?? ''));$r['_count']=['foodItems'=>(int)$r['foodCount']];unset($r['foodCount']);} out($rows); }
  if ($p==='menu' && $m==='GET') { $sql='SELECT f.*,c.name categoryName FROM fooditem f JOIN category c ON c.id=f.categoryId'; $q=[]; $where=[]; if (!isset($_GET['admin'])) $where[]='f.isAvailable=1'; if (!empty($_GET['categoryId'])) {$where[]='f.categoryId=?';$q[]=(int)$_GET['categoryId'];} if($where)$sql.=' WHERE '.implode(' AND ',$where); $sql.=' ORDER BY f.id'; $rows=stmt($sql,$q)->fetchAll(); out(array_map('menuRow',$rows)); }
  if (preg_match('#^orders/([^/]+)/status$#',$p,$x) && $m==='GET') { $o=stmt('SELECT * FROM `order` WHERE orderNumber=? AND customerSessionToken=? AND customerSessionExpiresAt>NOW()',[$x[1],$_GET['token']??''])->fetch(); if(!$o)out(['error'=>'Order session expired or not found'],404); $o['statusLabel']=$o['status']==='COMPLETED'?'READY':($o['status']==='PENDING'&&!empty($o['confirmedAt'])?'CONFIRMED':$o['status']); if(!empty($o['preparationStartedAt'])&&!empty($o['preparationMinutes'])){$started=DateTimeImmutable::createFromFormat('Y-m-d H:i:s',(string)$o['preparationStartedAt'],new DateTimeZone('Asia/Kolkata'));$o['preparationEndsAt']=$started?$started->modify('+'.(int)$o['preparationMinutes'].' minutes')->format(DATE_ATOM):null;} else $o['preparationEndsAt']=null; out($o); }
  if ($p==='orders' && $m==='POST') { $b=body(); if(empty($b['items'])||!is_array($b['items']))out(['error'=>'Order items are required'],400); $db=db();$db->beginTransaction(); try {$cust=customerFor(mobile($b['mobileNumber']??$b['whatsappNumber']??''),(string)($b['customerName']??''));$items=[];$subtotal=0;foreach($b['items'] as $i){$name=trim(preg_replace('/\s*\+\s*(?:Extra )?Cheese\s*$/i','',$i['name']??''));$f=!empty($i['foodItemId'])?stmt('SELECT * FROM food_items WHERE id=?',[(int)$i['foodItemId']])->fetch():false; if(!$f&&$name)$f=stmt('SELECT * FROM food_items WHERE name=?',[$name])->fetch();if(!$f)throw new Exception('Invalid food item');$qty=max(1,(int)($i['quantity']??1));$price=(float)$f['price'];$line=round($price*$qty,2);$subtotal+=$line;$items[]=[$f,$qty,$price,$line];}$delivery=($b['orderType']??'')==='DELIVERY'&&$subtotal<=300?($subtotal<150?50:30):0;$gst=money($b['gstAmount']??0);$discount=money($b['discountAmount']??0);$referralCode=strtoupper(trim((string)($b['referralCode']??'')));$referralApplied=false;if($referralCode!==''){$referrer=stmt('SELECT id FROM customers WHERE referral_code=?',[$referralCode])->fetch();$priorOrders=(int)stmt('SELECT COUNT(*) FROM orders WHERE customer_id=?',[$cust['id']])->fetchColumn();if($referrer&&(int)$referrer['id']!==(int)$cust['id']&&$priorOrders===0){$discount=money($discount+($subtotal*0.05));$referralApplied=true;}}$grand=money($subtotal+$gst-$discount+$delivery);$num='ORD-'.round(microtime(true)*1000);$session=bin2hex(random_bytes(24));stmt('INSERT INTO orders(order_number,customer_id,customer_name,mobile_number,whatsapp_number,email,address,table_number,order_type,payment_method,total_amount,gst_amount,discount_amount,grand_total,session_token,session_expires_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(),INTERVAL 30 MINUTE))',[$num,$cust['id'],$b['customerName']??'Guest',$cust['mobile_number'],$b['whatsappNumber']??null,$b['email']??null,$b['address']??null,$b['tableNumber']??null,in_array($b['orderType']??'', ['DINE_IN','TAKEAWAY','DELIVERY'])?$b['orderType']:'DINE_IN',in_array($b['paymentMethod']??'', ['CASH','UPI','CARD'])?$b['paymentMethod']:'UPI',$subtotal,$gst,$discount,$grand,$session]);$id=(int)$db->lastInsertId();foreach($items as [$f,$q,$price,$line])stmt('INSERT INTO order_items(order_id,food_item_id,quantity,unit_price,subtotal) VALUES(?,?,?,?,?)',[$id,$f['id'],$q,$price,$line]);$db->commit();out(['id'=>$id,'orderNumber'=>$num,'grandTotal'=>$grand,'customerSessionToken'=>$session,'customerSessionExpiresAt'=>date(DATE_ATOM,time()+1800),'customerReferralCode'=>$cust['referral_code']??'','referralApplied'=>$referralApplied],201);}catch(Throwable $e){$db->rollBack();throw $e;} }
  if ($p==='customer/referral/validate' && $m==='POST') { $b=body();$code=strtoupper(trim((string)($b['code']??'')));$number=mobile($b['mobileNumber']??'');if($code==='')out(['error'=>'Referral code is required'],400);$referrer=stmt('SELECT id,name FROM customer WHERE referralCode=?',[$code])->fetch();if(!$referrer)out(['valid'=>false,'message'=>'Invalid referral code. Please check and try again.']);$customer=$number?stmt('SELECT id FROM customer WHERE mobileNumber=?',[$number])->fetch():false;if($customer&&(int)$customer['id']===(int)$referrer['id'])out(['valid'=>false,'message'=>'You cannot use your own referral code.']);if($customer&&(int)stmt('SELECT COUNT(*) FROM `order` WHERE customerId=?',[$customer['id']])->fetchColumn()>0)out(['valid'=>false,'message'=>'Referral discount applies only to your first order.']);out(['valid'=>true,'discountPercent'=>5,'referrerName'=>$referrer['name']??null,'message'=>!empty($referrer['name'])?'Referral accepted! 5% off from '.$referrer['name'].'.':'Referral accepted! You get 5% off on this order.']); }
  if ($p==='customer/profile' && $m==='PATCH') { $b=body();$identity=claims();$customerId=$identity&&($identity['type']??'')==='customer'?(int)$identity['id']:0;if(!$customerId&&!empty($b['orderNumber'])&&!empty($b['orderSessionToken'])){$order=stmt('SELECT customerId FROM `order` WHERE orderNumber=? AND sessionToken=? AND sessionExpiresAt>NOW()',[(string)$b['orderNumber'],(string)$b['orderSessionToken']])->fetch();$customerId=(int)($order['customerId']??0);}if(!$customerId)out(['error'=>'Customer login or a valid order session is required.'],401);$birthday=!empty($b['birthday'])?(string)$b['birthday']:null;if($birthday!==null&&!preg_match('/^\d{4}-\d{2}-\d{2}$/',$birthday))out(['error'=>'Please enter a valid birthday.'],400);stmt('UPDATE customer SET birthday=? WHERE id=?',[$birthday,$customerId]);out(wallet($customerId)); }
  if ($p==='customer/request-otp' && $m==='POST') { $b=body();$n=mobile($b['mobileNumber']??'');$intent=$b['intent']??'existing';$name=trim((string)($b['name']??''));if(strlen($n)!==12)out(['error'=>'A valid 10-digit mobile number is required'],400);if(!in_array($intent,['existing','new'],true))out(['error'=>'Invalid login type.'],400);$existing=stmt('SELECT id FROM customer WHERE mobileNumber=?',[$n])->fetch();if($existing&&$intent==='new')out(['error'=>'This mobile number is already registered. Please sign in as an Existing User.','existingUser'=>true],409);if(!$existing&&$intent==='existing')out(['error'=>'This mobile number is not registered. Please choose New User and enter your name.','notRegistered'=>true],404);if($intent==='new'&&$name==='')out(['error'=>'Your name is required for a new user.'],422);if(!msg91Enabled())out(['error'=>'MSG91 OTP is not configured. Set MSG91_WIDGET_ID and MSG91_TOKEN_AUTH.'],503);$expiresAt=date(DATE_ATOM,time()+600);out(['ok'=>true,'mobileNumber'=>$n,'provider'=>'msg91','expiresAt'=>$expiresAt,'message'=>'OTP sent through MSG91.'],201); }
  if ($p==='customer/verify-otp' && $m==='POST') { $b=body();$otp=(string)($b['otp']??'');$n=mobile($b['mobileNumber']??'');$intent=$b['intent']??'existing';$name=trim((string)($b['name']??''));if(strlen($n)!==12||!in_array($intent,['existing','new'],true))out(['error'=>'Invalid login request. Please request a new OTP.'],400);try { if(!msg91Enabled()) out(['error'=>'MSG91 OTP is not configured.'],503); verifyMsg91Otp($otp,(string)($b['msg91RequestId']??'')); } catch (RuntimeException $error) { out(['error'=>$error->getMessage()],401); }$c=stmt('SELECT * FROM customer WHERE mobileNumber=?',[$n])->fetch();if($c&&$intent==='new')out(['error'=>'This mobile number is already registered. Please sign in as an Existing User.'],409);if(!$c&&$intent==='existing')out(['error'=>'This mobile number is not registered. Please choose New User.'],404);if(!$c){if($name==='')out(['error'=>'Your name is required for a new user.'],422);$c=customerFor($n,$name);}$w=wallet((int)$c['id']);out(['token'=>token(['type'=>'customer','id'=>(int)$c['id'],'mobileNumber'=>$c['mobileNumber']],2592000),'expiresAt'=>date(DATE_ATOM,time()+2592000)]+$w); }
  if ($p==='customer/wallet' && $m==='GET') { $c=auth('customer');out(wallet((int)$c['id'])); }
  if ($p==='customer/account' && $m==='GET') { $c=auth('customer');$w=wallet((int)$c['id']);$w['orders']=stmt('SELECT id,orderNumber,grandTotal,status,orderType,paymentMethod,createdAt FROM `order` WHERE customerId=? ORDER BY createdAt DESC',[$c['id']])->fetchAll();foreach($w['orders'] as &$order){$order['id']=(int)$order['id'];$order['items']=stmt('SELECT oi.quantity,oi.unitPrice unitPrice,oi.subtotal,f.name,f.image FROM orderitem oi JOIN fooditem f ON f.id=oi.foodItemId WHERE oi.orderId=?',[$order['id']])->fetchAll();foreach($order['items'] as &$item){$item['quantity']=(int)$item['quantity'];$item['unitPrice']=(float)$item['unitPrice'];$item['subtotal']=(float)$item['subtotal'];$item['image']=projectUrl((string)$item['image']);}}out($w); }
  if ($p==='customer/addresses' && $m==='POST') {$c=auth('customer');$b=body();if(empty($b['label'])||empty($b['address']))out(['error'=>'An address title and address are required.'],400);stmt('INSERT INTO customeraddress(customerId,label,address) VALUES(?,?,?) ON DUPLICATE KEY UPDATE address=VALUES(address)',[$c['id'],substr($b['label'],0,40),substr($b['address'],0,1000)]);out(wallet((int)$c['id']),201);}
  if (preg_match('#^customer/addresses/(\d+)$#',$p,$x)&&$m==='DELETE'){$c=auth('customer');stmt('DELETE FROM customeraddress WHERE id=? AND customerId=?',[(int)$x[1],$c['id']]);out(wallet((int)$c['id']));}
  if ($p==='admin/menu' && $m==='POST') { auth('admin');$b=body();if(empty($b['name'])||empty($b['categoryId'])||(float)($b['price']??0)<=0)out(['error'=>'Name, category and price are required'],400);stmt('INSERT INTO fooditem(categoryId,name,description,price,image,isVeg,isAvailable) VALUES(?,?,?,?,?,?,?)',[(int)$b['categoryId'],trim($b['name']),$b['description']??null,(float)$b['price'],$b['image']??null,!empty($b['isVeg']),!empty($b['isAvailable'])]);$row=stmt('SELECT f.*,c.name categoryName FROM fooditem f JOIN category c ON c.id=f.categoryId WHERE f.id=?',[db()->lastInsertId()])->fetch();out(menuRow($row),201); }
  if (preg_match('#^admin/menu/(\d+)$#',$p,$x) && $m==='PUT') {auth('admin');$b=body();stmt('UPDATE fooditem SET categoryId=?,name=?,description=?,price=?,image=?,isVeg=?,isAvailable=? WHERE id=?',[(int)$b['categoryId'],trim($b['name']),$b['description']??null,(float)$b['price'],$b['image']??null,!empty($b['isVeg']),!empty($b['isAvailable']),(int)$x[1]]);$row=stmt('SELECT f.*,c.name categoryName FROM fooditem f JOIN category c ON c.id=f.categoryId WHERE f.id=?',[(int)$x[1]])->fetch();out(menuRow($row));}
  if (preg_match('#^admin/menu/(\d+)/availability$#',$p,$x) && $m==='PATCH') {auth('admin');$available=!empty(body()['isAvailable']);stmt('UPDATE fooditem SET isAvailable=? WHERE id=?',[$available,$x[1]]);out(['id'=>(int)$x[1],'isAvailable'=>$available]);}
  if (preg_match('#^admin/menu/(\d+)$#',$p,$x) && $m==='DELETE') {auth('admin');stmt('DELETE FROM fooditem WHERE id=?',[(int)$x[1]]);out([],204);}
  if ($p==='admin/uploads/menu-image' && $m==='POST') out(['imageUrl'=>uploadedFile('image',['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','image/gif'=>'gif'],'menu',5*1024*1024)],201);
  if ($p==='admin/uploads/campaign-media' && $m==='POST') out(['mediaUrl'=>uploadedFile('media',['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','image/gif'=>'gif','video/mp4'=>'mp4','video/webm'=>'webm'],'campaign',25*1024*1024)],201);
  if ($p==='admin/customers' && $m==='POST') {auth('admin');$b=body();$number=mobile($b['number']??$b['mobileNumber']??'');if(strlen($number)<10)out(['error'=>'A valid mobile number is required'],422);$existing=stmt('SELECT id FROM customer WHERE mobileNumber=?',[$number])->fetch();if($existing)out(['error'=>'A customer with this number already exists'],409);$code='MK'.strtoupper(substr(bin2hex(random_bytes(5)),0,8));stmt('INSERT INTO customer(mobileNumber,name,birthday,anniversary,referralCode) VALUES(?,?,?,?,?)',[$number,trim((string)($b['name']??''))?:null,$b['birthday']?:null,$b['anniversary']?:null,$code]);out(adminCustomer((int)db()->lastInsertId()),201);}
  if (preg_match('#^admin/customers/(\d+)$#',$p,$x)&&$m==='PATCH') {auth('admin');$b=body();$id=(int)$x[1];$exists=stmt('SELECT id FROM customer WHERE id=?',[$id])->fetch();if(!$exists)out(['error'=>'Customer not found'],404);$number=mobile($b['number']??$b['mobileNumber']??'');if(strlen($number)<10)out(['error'=>'A valid mobile number is required'],422);try{stmt('UPDATE customer SET mobileNumber=?,name=?,birthday=?,anniversary=? WHERE id=?',[$number,trim((string)($b['name']??''))?:null,$b['birthday']?:null,$b['anniversary']?:null,$id]);}catch(PDOException $e){out(['error'=>'A customer with this number already exists'],409);}out(adminCustomer($id));}
  if (preg_match('#^admin/customers/(\d+)/cashback$#',$p,$x)&&$m==='POST') {auth('admin');$b=body();$id=(int)$x[1];$amount=round((float)($b['amount']??0),2);if($amount==0)out(['error'=>'Enter a non-zero cashback amount'],422);$customer=stmt('SELECT cashbackBalance FROM customer WHERE id=?',[$id])->fetch();if(!$customer)out(['error'=>'Customer not found'],404);$balance=round(max(0,(float)$customer['cashbackBalance']+$amount),2);$actual=$balance-(float)$customer['cashbackBalance'];if($actual==0)out(['error'=>'Cashback balance cannot be negative'],422);stmt('UPDATE customer SET cashbackBalance=? WHERE id=?',[$balance,$id]);stmt('INSERT INTO cashbacktransaction(customerId,type,amount,balanceAfter,note) VALUES(?,?,?,?,?)',[$id,'ADJUSTED',$actual,$balance,trim((string)($b['note']??''))?:'Admin cashback adjustment']);out(adminCustomer($id));}
  if ($p==='admin/customers' && $m==='GET') {auth('admin');$ids=stmt('SELECT id FROM customer ORDER BY updatedAt DESC')->fetchAll(PDO::FETCH_COLUMN);out(array_map(fn($id)=>adminCustomer((int)$id),$ids));}
  if ($p==='admin/orders' && $m==='GET') {auth('admin');$orders=stmt('SELECT * FROM `order` ORDER BY createdAt DESC')->fetchAll();out(array_map('adminOrder',$orders));}
  if ($p==='admin/export/orders' && $m==='GET') {auth('admin');header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="orders-export-'.date('Y-m-d').'.csv"');$out=fopen('php://output','w');fputcsv($out,['Order ID','Order Number','Timestamp','Customer','Mobile','WhatsApp','Address','Table','Subtotal','GST','Discount','Cashback Redeemed','Cashback Earned','Grand Total','Status','Order Type','Payment Method']);$orders=stmt('SELECT id,orderNumber,createdAt,customerName,mobileNumber,whatsappNumber,address,tableNumber,totalAmount,gstAmount,discountAmount,cashbackRedeemed,cashbackEarned,grandTotal,status,orderType,paymentMethod FROM `order` ORDER BY createdAt DESC')->fetchAll();foreach($orders as $o){fputcsv($out,[$o['id'],$o['orderNumber'],$o['createdAt'],$o['customerName'],$o['mobileNumber'],$o['whatsappNumber'],$o['address'],$o['tableNumber'],$o['totalAmount'],$o['gstAmount'],$o['discountAmount'],$o['cashbackRedeemed'],$o['cashbackEarned'],$o['grandTotal'],$o['status'],$o['orderType'],$o['paymentMethod']]);}fclose($out);exit;}
  if ($p==='admin/export/customers' && $m==='GET') {auth('admin');header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="lms-customers-export-'.date('Y-m-d').'.csv"');$out=fopen('php://output','w');fputcsv($out,['Customer ID','Name','Mobile Number','Birthday','Anniversary','Referral Code','Cashback Balance','Order Count','Total Spent','First Order','Last Order','Created At']);$customers=stmt('SELECT c.id,c.name,c.mobileNumber,c.birthday,c.anniversary,c.referralCode,c.cashbackBalance,c.createdAt,COUNT(o.id) orderCount,COALESCE(SUM(o.grandTotal),0) totalSpent,MIN(o.createdAt) firstOrder,MAX(o.createdAt) lastOrder FROM customer c LEFT JOIN `order` o ON o.customerId=c.id GROUP BY c.id ORDER BY c.updatedAt DESC')->fetchAll();foreach($customers as $c){fputcsv($out,[$c['id'],$c['name'] ?? '',$c['mobileNumber'],$c['birthday'],$c['anniversary'],$c['referralCode'],$c['cashbackBalance'],$c['orderCount'],$c['totalSpent'],$c['firstOrder'],$c['lastOrder'],$c['createdAt']]);}fclose($out);exit;}
  if (preg_match('#^admin/orders/(\d+)/status$#',$p,$x)&&$m==='PATCH') {auth('admin');$b=body();$a=strtoupper($b['action']??$b['status']??'');$map=['CONFIRM'=>null,'CONFIRMED'=>null,'PREPARING'=>'PREPARING','READY'=>'COMPLETED','COMPLETED'=>'COMPLETED','DELIVERED'=>'DELIVERED','CANCELLED'=>'CANCELLED'];if(!array_key_exists($a,$map))out(['error'=>'Invalid order action'],400);$sets=[];if($a==='CONFIRM'||$a==='CONFIRMED')$sets[]='confirmedAt=COALESCE(confirmedAt,NOW())';if($map[$a])$sets[]='status='.db()->quote($map[$a]);if($a==='PREPARING'){$sets[]='preparationStartedAt=NOW()';$sets[]='preparationMinutes='.(int)max(1,min(180,$b['preparationMinutes']??1));}if($a==='READY'||$a==='COMPLETED')$sets[]='readyAt=NOW()';if($a==='DELIVERED')$sets[]='deliveredAt=NOW()';if($sets)stmt('UPDATE `order` SET '.implode(',',$sets).' WHERE id=?',[(int)$x[1]]);if($a==='CONFIRM'||$a==='CONFIRMED')syncCashbackForOrder((int)$x[1]);out(adminOrder(stmt('SELECT * FROM `order` WHERE id=?',[(int)$x[1]])->fetch()));}
  if (preg_match('#^admin/orders/(\d+)$#',$p,$x)&&$m==='DELETE') {auth('admin');$id=(int)$x[1];$pdo=db();$pdo->beginTransaction();try{$order=stmt('SELECT customerId,referrerId FROM `order` WHERE id=?',[$id])->fetch();if(!$order)out(['error'=>'Order not found'],404);$affected=array_unique(array_filter([(int)$order['customerId'],(int)$order['referrerId']]));stmt('DELETE FROM cashbacktransaction WHERE orderId=?',[$id]);stmt('DELETE FROM `order` WHERE id=?',[$id]);foreach($affected as $customerId){$balance=(float)stmt("SELECT COALESCE(SUM(CASE WHEN type='REDEEMED' THEN -amount ELSE amount END),0) FROM cashbacktransaction WHERE customerId=?",[$customerId])->fetchColumn();stmt('UPDATE customer SET cashbackBalance=? WHERE id=?',[$balance,$customerId]);}$pdo->commit();out(['deleted'=>true]);}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}}
  out(['error'=>'Route not found'],404);
} catch(Throwable $e) { error_log('Order app API: '.$e->getMessage()); if($e instanceof RuntimeException) out(['error'=>$e->getMessage()],422); out(['error'=>'Server error. Check database configuration and server error log.'],500); }
