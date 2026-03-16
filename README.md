# Everest Library

Shared family library web app with barcode lookup, tags, read tracking, loans, notes, role-based access, and CSV export.

## Tech stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Auth, Postgres, RLS)

## Local development

1. Install dependencies:

```sh
npm install
```

2. Add environment variables in `.env.local`:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ADMIN_EMAIL=courtney@futurefocus.co.nz
```

3. Start dev server:

```sh
npm run dev
```

4. Build for production:

```sh
npm run build
```

## Supabase SQL setup

Run the SQL scripts in `supabase/` as needed in Supabase SQL Editor:

- `notes-and-roles-setup.sql`
- `user-book-reads-setup.sql`
- `user-reading-state-setup.sql`
- `user-to-read-setup.sql`
- `books-tags-setup.sql`
- `admin-role-rpc.sql`

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Set Vercel env vars:
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_ANON_KEY`
	- `VITE_ADMIN_EMAIL`
4. Deploy.
5. In Supabase Auth URL Configuration, add your Vercel URL to Site URL and Redirect URLs.
