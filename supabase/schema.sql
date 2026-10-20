-- Busangi cloud tables. Browsers have no direct table or RPC access.
create table public.busangi_users (
 id uuid primary key default gen_random_uuid(), nickname text unique not null check (char_length(nickname) between 1 and 80),
 salt text not null, password_hash text not null, created_at timestamptz not null default now()
);
create table public.busangi_saves (
 user_id uuid primary key references public.busangi_users(id) on delete cascade,
 state jsonb not null check (jsonb_typeof(state)='object' and octet_length(state::text)<=250000),
 revision integer not null default 1 check(revision>0), updated_at timestamptz not null default now()
);
create table public.busangi_sessions (
 token_hash text primary key check(length(token_hash)=64), user_id uuid not null references public.busangi_users(id) on delete cascade,
 expires_at timestamptz not null
);
create index busangi_sessions_user_idx on public.busangi_sessions(user_id);
create index busangi_sessions_expiry_idx on public.busangi_sessions(expires_at);
create table public.busangi_rate_limits (bucket text primary key,hits integer not null,expires_at timestamptz not null);
create index busangi_rate_expiry_idx on public.busangi_rate_limits(expires_at);
create table public.busangi_quotes (code text primary key check(code ~ '^[0-9]{6}$'), payload jsonb not null,updated_at timestamptz not null default now());
create table public.busangi_kis_tokens (id integer primary key check(id=1),ciphertext text,expires_at timestamptz,lease_until timestamptz);
create table public.busangi_plaza_players (
 id uuid primary key,token_hash text not null check(length(token_hash)=64),user_id uuid references public.busangi_users(id) on delete cascade,
 profile jsonb not null,x double precision not null default 50 check(x between 7 and 93),direction smallint not null default 1 check(direction in (-1,1)),
 last_move timestamptz not null default now(),last_chat timestamptz,expires_at timestamptz not null default (now()+interval '60 seconds')
);
create unique index busangi_plaza_user_idx on public.busangi_plaza_players(user_id) where user_id is not null;
create index busangi_plaza_expiry_idx on public.busangi_plaza_players(expires_at);
create table public.busangi_plaza_messages (
 id bigint generated always as identity primary key,player_id uuid not null,nickname text not null,
 text text not null check(char_length(text) between 1 and 200),created_at timestamptz not null default now()
);
create index busangi_messages_time_idx on public.busangi_plaza_messages(created_at);
create table public.busangi_transfers (id text primary key,state jsonb not null,expires_at timestamptz not null);
create index busangi_transfers_expiry_idx on public.busangi_transfers(expires_at);

create function public.busangi_save(p_user uuid,p_state jsonb,p_revision integer) returns integer language plpgsql security invoker set search_path='' as $$
declare r integer;
begin
 if p_revision=0 then
  insert into public.busangi_saves(user_id,state) values(p_user,p_state) on conflict do nothing returning revision into r;
 else
  update public.busangi_saves set state=p_state,revision=revision+1,updated_at=now() where user_id=p_user and revision=p_revision returning revision into r;
 end if;
 if r is null then raise exception 'SAVE_CONFLICT';end if;return r;
end $$;
create function public.busangi_rate(p_bucket text,p_limit integer,p_seconds integer) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.busangi_rate_limits as t values(p_bucket,1,now()+make_interval(secs=>p_seconds))
 on conflict(bucket) do update set hits=case when t.expires_at<now() then 1 else t.hits+1 end,
 expires_at=case when t.expires_at<now() then now()+make_interval(secs=>p_seconds) else t.expires_at end returning hits into n;
 delete from public.busangi_rate_limits where expires_at<now()-interval '1 day';
 return n<=p_limit;
end $$;
create function public.busangi_kis_lease() returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.busangi_kis_tokens(id,lease_until) values(1,now()+interval '25 seconds') on conflict(id) do update set lease_until=excluded.lease_until where busangi_kis_tokens.lease_until is null or busangi_kis_tokens.lease_until<now();
 get diagnostics n=row_count;return n>0;
end $$;
create function public.busangi_plaza_join(p_id uuid,p_hash text,p_user uuid,p_profile jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cursor_id bigint;
begin
 perform pg_advisory_xact_lock(731946);
 delete from public.busangi_plaza_players where expires_at<now();
 if p_user is not null then delete from public.busangi_plaza_players where user_id=p_user;end if;
 if (select count(*) from public.busangi_plaza_players)>=30 then raise exception 'PLAZA_FULL';end if;
 insert into public.busangi_plaza_players(id,token_hash,user_id,profile,x) values(p_id,p_hash,p_user,p_profile,17+16*((select count(*) from public.busangi_plaza_players)%5));
 select coalesce(max(id),0) into cursor_id from public.busangi_plaza_messages;
 return jsonb_build_object('players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'profile',profile,'x',x,'direction',direction)),'[]') from public.busangi_plaza_players),'cursor',cursor_id);
end $$;
create function public.busangi_plaza_update(p_id uuid,p_hash text,p_x double precision,p_direction integer,p_profile jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.busangi_plaza_players%rowtype;step double precision;
begin
 select * into r from public.busangi_plaza_players where id=p_id and token_hash=p_hash and expires_at>now() for update;
 if not found then raise exception 'PLAZA_EXPIRED';end if;
 step=3+least(1000,extract(epoch from (now()-r.last_move))*1000)*.04;
 update public.busangi_plaza_players set x=greatest(7,least(93,r.x+greatest(-step,least(step,coalesce(p_x,r.x)-r.x)))),
 direction=case when p_direction=-1 then -1 else 1 end,profile=coalesce(p_profile,r.profile),last_move=now(),expires_at=now()+interval '60 seconds' where id=p_id;
 return true;
end $$;
create function public.busangi_plaza_chat(p_id uuid,p_hash text,p_text text) returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.busangi_plaza_players%rowtype;
begin
 select * into r from public.busangi_plaza_players where id=p_id and token_hash=p_hash and expires_at>now() for update;
 if not found then raise exception 'PLAZA_EXPIRED';end if;
 if r.last_chat>now()-interval '800 milliseconds' then raise exception 'CHAT_RATE';end if;
 if char_length(trim(p_text)) not between 1 and 200 then raise exception 'CHAT_LENGTH';end if;
 update public.busangi_plaza_players set last_chat=now(),expires_at=now()+interval '60 seconds' where id=p_id;
 insert into public.busangi_plaza_messages(player_id,nickname,text) values(p_id,r.profile->>'nickname',trim(p_text));
 delete from public.busangi_plaza_messages where id<(select coalesce(max(id),0)-500 from public.busangi_plaza_messages);
 return true;
end $$;
create function public.busangi_plaza_poll(p_id uuid,p_hash text,p_cursor bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 update public.busangi_plaza_players set expires_at=now()+interval '60 seconds' where id=p_id and token_hash=p_hash and expires_at>now();
 if not found then raise exception 'PLAZA_EXPIRED';end if;
 return jsonb_build_object('players',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'profile',profile,'x',x,'direction',direction)),'[]') from public.busangi_plaza_players where expires_at>now()),
 'messages',(select coalesce(jsonb_agg(jsonb_build_object('cursor',id,'id',player_id,'nickname',nickname,'text',text,'at',extract(epoch from created_at)*1000) order by id),'[]') from (select * from public.busangi_plaza_messages where id>p_cursor order by id limit 100) m));
end $$;
create function public.busangi_take_transfer(p_id text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s jsonb;
begin delete from public.busangi_transfers where id=p_id and expires_at>now() returning state into s;return s;end $$;

-- No browser can read credentials, sessions, saves or alter ranking/player state directly.
do $$ declare t text;f record;begin
 foreach t in array array['busangi_users','busangi_saves','busangi_sessions','busangi_rate_limits','busangi_quotes','busangi_kis_tokens','busangi_plaza_players','busangi_plaza_messages','busangi_transfers'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on table public.%I from public,anon,authenticated',t);
 execute format('grant all on table public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'busangi_%' loop
 execute format('revoke execute on function %s from public,anon,authenticated',f.sig);
 execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
revoke all on sequence public.busangi_plaza_messages_id_seq from public,anon,authenticated;
grant usage,select on sequence public.busangi_plaza_messages_id_seq to service_role;
create function public.busangi_login_lookup(p_nickname text) returns table(id uuid,nickname text,salt text,password_hash text) language sql stable security invoker set search_path='' as $$ select u.id,u.nickname,u.salt,u.password_hash from public.busangi_users u where u.nickname=p_nickname limit 1 $$;
revoke all on function public.busangi_login_lookup(text) from public,anon,authenticated;
grant execute on function public.busangi_login_lookup(text) to service_role;
