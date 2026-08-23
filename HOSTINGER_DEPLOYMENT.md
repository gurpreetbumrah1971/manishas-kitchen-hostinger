# Hostinger Business deployment

This is a PHP + MySQL build. It does not need Node.js, `package.json`, Prisma, PostgreSQL, or a continuously running process.

## Release repository sync

Every release must be pushed to both configured Git remotes before checking the
online deployment:

- `origin` — `manishas-kitchen-hostinger`
- `deployment` — `manishas-kitchen-hostinger-clone` (the repository used by the online build)

Push the same `main` commit to both remotes. A change that is only on `origin`
will work locally but will not appear on the deployed website.

## Choose the PHP/HTML Git deployment option

In hPanel, deploy this repository from **Websites → [your website] → Dashboard → Advanced → Git → Continue with GitHub**. Select the `main` branch and set the deployment directory to `public_html` (or the domain's configured document root).

Do **not** deploy it through **Add Website → Deploy Web App / Node.js Web App / Static Frontend Web App**. Those flows expect `package.json` and serve only static files; they cannot run this application's PHP API (`/api`), so checkout, OTP, admin login, orders, and MySQL features will fail.

If a static web app was already created, create or switch to a **Custom PHP/HTML** website for the domain, then connect this repository using the Git option above. Point the domain to that PHP website before testing.

1. In hPanel, create a MySQL database and database user, then import `database.sql` in phpMyAdmin. It includes the complete current menu catalog and its image paths.
   - If you already imported an earlier `database.sql`, import `menu-migration.sql` instead. It safely updates the existing menu and adds missing items without recreating the tables.
2. Edit `config.php` with the database host, database name, user, password, and a long unique `APP_SECRET`.
3. Change `ADMIN_DEFAULT_PASSWORD` before the first login. The first successful login creates that admin account automatically.
4. For Git deployment, Hostinger places the repository contents in `public_html` automatically. For a manual upload, upload the contents of this folder (not the folder itself) into the domain's `public_html` directory. Ensure hidden files are uploaded, especially `.htaccess`.
5. Open `https://your-domain.example/api/health`; it should return JSON with `"status":"ok"`.
6. Open `https://your-domain.example/admin/login` and sign in with `ADMIN_DEFAULT_USER` / `ADMIN_DEFAULT_PASSWORD`.

## MSG91 OTP

The PHP API uses MSG91's OTP Widget. The same Widget token is used to initialise the browser widget and to verify the resulting `reqId` OTP session in PHP. `MSG91_AUTHKEY` is not used by this OTP flow.

For Hostinger Git deployments, create a private file named `config.local.php` **one directory above** the website's `public_html` directory. Copy the structure from `config.local.example.php` and set your `MSG91_WIDGET_ID` and `MSG91_TOKEN_AUTH` values from the MSG91 OTP Widget dashboard. This file is ignored by Git, so it persists through deployments and never enters the repository. Alternatively, define the same names as PHP environment variables if your hosting plan provides them.

For local XAMPP only, this build reads the existing reference app's MSG91 setup without modifying it. If any MSG91 credential is missing, OTP requests are rejected instead of falling back to a visible test code.

## Included compatibility changes

- Apache rewrites retain `/menu`, `/checkout`, and `/admin/...` URLs.
- The `/api` implementation uses PHP PDO with MySQL and has no Node runtime dependency.
- Orders, menu availability, admin sign-in, customer sessions, wallet addresses, and order-status polling are implemented locally.
- `database.sql` includes all 10 current menu categories and 69 menu items. The referenced food images are included in the repository under `assets/food/`.
- `package.json` is intentionally absent: it is not part of a PHP deployment and adding one would not make the PHP backend work in a static/Node deployment.
