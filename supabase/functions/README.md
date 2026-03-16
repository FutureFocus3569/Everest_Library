# Supabase Edge Function setup

This project includes `invite-user`, `admin-users`, `delete-user`, and `save-reading-state` so your admin can manage access and users can reliably save reading progress from inside the app.

## 1) Login and link project

```bash
supabase login
supabase link --project-ref wadfeynvgnfersnfuovt
```

## 2) Set required secrets

```bash
supabase secrets set \
  SUPABASE_URL=https://wadfeynvgnfersnfuovt.supabase.co \
  SUPABASE_ANON_KEY=<your-anon-or-publishable-key> \
  SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key> \
  ADMIN_EMAIL=courtney@futurefocus.co.nz
```

## 3) Deploy the functions

```bash
supabase functions deploy invite-user
supabase functions deploy admin-users
supabase functions deploy delete-user --no-verify-jwt
supabase functions deploy save-reading-state
```

After deploy, the app page `/admin/users` can send invites, view users, and delete users. Deleted users can be invited again later using the same email.
