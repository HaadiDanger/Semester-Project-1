import { PGlite } from "@electric-sql/pglite"
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm"
import { readFile, readdir } from "node:fs/promises"

// PostgreSQL role/claims tests, not a substitute for GoTrue, PostgREST or Storage integration.
export async function createDatabase() {
  const db = new PGlite({ extensions: { pg_trgm } })
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text unique, email_confirmed_at timestamptz,
      raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
        current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_setting('request.jwt.claims',true)::jsonb->>'role')
    $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean default false,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text references storage.buckets(id),
      name text, owner_id text, metadata jsonb, unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
  `)
  const directory = new URL("../../supabase/migrations/", import.meta.url)
  for (const file of (await readdir(directory)).filter(name => name.endsWith(".sql")).sort()) {
    try { await db.exec(await readFile(new URL(file, directory), "utf8")) }
    catch (error) { await db.close(); throw new Error(`Migration ${file}: ${error.message}`, { cause: error }) }
  }
  return db
}

export async function asRole(db, role, userId, sql, params = []) {
  if (!["anon", "authenticated", "service_role"].includes(role)) throw new Error("Unexpected test role")
  return db.transaction(async tx => {
    await tx.exec(`set local role ${role}`)
    await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role, sub: userId })])
    await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)", [userId || "", role])
    return tx.query(sql, params)
  })
}

export async function rpc(db, userId, name, args = {}, role = userId ? "authenticated" : "anon") {
  if (!/^[a-z_]+$/.test(name)) throw new Error("Invalid RPC name")
  const keys = Object.keys(args)
  if (keys.some(key => !/^p_[a-z_]+$/.test(key))) throw new Error("Invalid RPC parameter")
  const params = keys.map(key => typeof args[key] === "object" && args[key] !== null ? JSON.stringify(args[key]) : args[key])
  const result = await asRole(db, role, userId, `select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(",")}) as data`, params)
  return result.rows[0]?.data
}
