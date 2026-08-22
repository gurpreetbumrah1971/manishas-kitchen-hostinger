# Hostinger Business deployment

This is a PHP + MySQL build. It does not need Node.js, `package.json`, Prisma, PostgreSQL, or a continuously running process.

## Choose the PHP/HTML Git deployment option

In hPanel, deploy this repository from **Websites → [your website] → Dashboard → Advanced → Git → Continue with GitHub**. Select the `main` branch and set the deployment directory to `public_html` (or the domain's configured document root).

Do **not** deploy it through **Add Website → Deploy Web App / Node.js Web App / Static Frontend Web App**. Those flows expect `package.json` and serve only static files; they cannot run this application's PHP API (`/api`), so checkout, OTP, admin login, orders, and MySQL features will fail.

If a static web app was already created, create or switch to a **Custom PHP/HTML** website for the domain, then connect this repository using the Git option above. Point the domain to that PHP website before testing.

1. In hPanel, create a MySQL database and database user, then import `database.sql` in phpMyAdmin.
2. Edit `config.php` with the database host, database name, user, password, and a long unique `APP_SECRET`.
3. Change `ADMIN_DEFAULT_PASSWORD` before the first login. The first successful login creates that admin account automatically.
4. For Git deployment, Hostinger places the repository contents in `public_html` automatically. For a manual upload, upload the contents of this folder (not the folder itself) into the domain's `public_html` directory. Ensure hidden files are uploaded, especially `.htaccess`.
5. Open `https://your-domain.example/api/health`; it should return JSON with `"status":"ok"`.
6. Open `https://your-domain.example/admin/login` and sign in with `ADMIN_DEFAULT_USER` / `ADMIN_DEFAULT_PASSWORD`.

## MSG91 OTP

The PHP API supports the same MSG91 widget flow as the original app: the browser sends the OTP through the MSG91 widget and PHP verifies the supplied OTP against that widget session. For Hostinger, replace the empty fallback values for `MSG91_WIDGET_ID` and `MSG91_TOKEN_AUTH` in `config.php` before launch; leave `OTP_PROVIDER` set to `msg91`.

For local XAMPP only, this build reads the existing reference app's MSG91 setup without modifying it. When MSG91 is not configured, the deliberately visible local fallback OTP is `123456`.

## Included compatibility changes

- Apache rewrites retain `/menu`, `/checkout`, and `/admin/...` URLs.
- The `/api` implementation uses PHP PDO with MySQL and has no Node runtime dependency.
- Orders, menu availability, admin sign-in, customer sessions, wallet addresses, and order-status polling are implemented locally.
- `database.sql` includes the core current menu. Add any extra products from the Admin Menu screen after deployment.
- `package.json` is intentionally absent: it is not part of a PHP deployment and adding one would not make the PHP backend work in a static/Node deployment.
