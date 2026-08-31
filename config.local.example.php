<?php
// Copy this file to ../config.local.php (one directory ABOVE public_html) on
// Hostinger. Do not commit the copied file; config.local.php is gitignored.
return [
  'MSG91_WIDGET_ID' => 'paste-your-msg91-widget-id',
  'MSG91_TOKEN_AUTH' => 'paste-your-msg91-widget-token',
  'RESEND_API_KEY' => 'paste-your-resend-api-key',
  'RESEND_FROM_EMAIL' => "Manisha's Kitchen <orders@your-verified-domain.com>",
  'ORDER_NOTIFICATION_RECIPIENTS' => 'gurpreet.bumrah@gmail.com,manishaskitchen2026@gmail.com,aryanchavan131@gmail.com',
  // Required for WhatsApp order-confirmation messages (customer/index.php's
  // sendOrderConfirmationWhatsapp). Same MSG91 account authkey, not the
  // widget token above.
  'MSG91_AUTHKEY' => 'paste-your-msg91-account-authkey',
  // Optional: only set these if they differ from the defaults baked into
  // config.php (919653102273 / order_confirmation / the namespace from the
  // approved order_confirmation template).
  // 'MSG91_WHATSAPP_INTEGRATED_NUMBER' => '919653102273',
  // 'MSG91_WHATSAPP_TEMPLATE_NAME' => 'order_confirmation',
  // 'MSG91_WHATSAPP_NAMESPACE' => 'paste-template-namespace',
  // Optional: staff "new order placed" WhatsApp alert. Defaults to the three
  // restaurant numbers baked into config.php if not set here.
  // 'MSG91_WHATSAPP_NOTIFICATION_TEMPLATE' => 'order_notification',
  // 'ORDER_NOTIFICATION_WHATSAPP_RECIPIENTS' => '9819068372,8879630082,9076241129',
];
