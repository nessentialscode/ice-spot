-- ==============================================================================
-- Migration: 20261022000003_link_auth_users_to_profiles.sql
-- Description: Provision & link public.profiles records for existing Supabase Auth
--              accounts (Super Admin, Branch Admin, Delivery Staff) with strict
--              RLS policies, schema grants, and dynamic branch ID verification.
-- Note: Review carefully before executing in Supabase SQL Editor.
-- ==============================================================================

-- 1. Ensure Table Grants for Authenticated and Anon Roles
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.branches, public.products TO anon, authenticated;

-- 2. Ensure public.profiles table exists with valid constraints
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'branch_admin' CHECK (role IN ('super_admin', 'super-admin', 'branch_admin', 'branch-admin', 'delivery_staff', 'delivery-staff')),
    branch_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Ensure RLS is active
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Row Level Security Policies (Non-recursive, secure self-access)
-- ------------------------------------------------------------------------------
-- Drop any potentially recursive or outdated policies
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super Admin can manage profiles" ON public.profiles;

-- Allow any authenticated user to strictly read their own profile row
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (id = (SELECT auth.uid()));

-- Allow any authenticated user to update their own profile row (e.g. name, preferences)
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

-- 4. Dynamic Branch Identification & Idempotent Profile Linkage
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_ollur_branch_id TEXT;
    v_varavoor_branch_id TEXT;
    v_existing_role TEXT;
    v_existing_branch TEXT;
BEGIN
    -- 4a. Resolve or Seed Ice Spot Ollur Branch Record
    SELECT id INTO v_ollur_branch_id
    FROM public.branches
    WHERE LOWER(name) LIKE '%ollur%' OR LOWER(id) LIKE '%ollur%'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_ollur_branch_id IS NULL THEN
        -- Seed canonical Ollur branch if genuinely not present
        INSERT INTO public.branches (
            id, name, location, district, region, sub_region, status, is_factory_headquarters, phone, is_open
        ) VALUES (
            'ollur-branch',
            'Ice Spot Ollur',
            'Company Padi, Bus Stop, High Road, near Fun Movies, Ollur, Thrissur',
            'Thrissur',
            'thrissur',
            'town',
            'confirmed',
            false,
            '+91 94470 00002',
            true
        )
        ON CONFLICT (id) DO NOTHING;

        v_ollur_branch_id := 'ollur-branch';
        RAISE NOTICE 'Ollur branch was absent; seeded canonical record with ID: %', v_ollur_branch_id;
    ELSE
        RAISE NOTICE 'Found existing database branch record for Ollur with ID: %', v_ollur_branch_id;
    END IF;

    -- 4b. Resolve or Seed Varavoor Factory Headquarters Branch Record
    SELECT id INTO v_varavoor_branch_id
    FROM public.branches
    WHERE is_factory_headquarters = true OR LOWER(id) LIKE '%varavoor%'
    ORDER BY is_factory_headquarters DESC, created_at ASC
    LIMIT 1;

    IF v_varavoor_branch_id IS NULL THEN
        INSERT INTO public.branches (
            id, name, location, district, region, sub_region, status, is_factory_headquarters, phone, is_open
        ) VALUES (
            'varavoor-factory',
            'Ice Spot Varavoor Factory',
            'Main Production Factory & Central Franchise Hub, Varavoor, Wadakkanchery, Thrissur, Kerala 680585',
            'Thrissur',
            'thrissur',
            'town',
            'confirmed',
            true,
            '+91 94470 00000',
            true
        )
        ON CONFLICT (id) DO NOTHING;

        v_varavoor_branch_id := 'varavoor-factory';
        RAISE NOTICE 'Varavoor factory branch was absent; seeded canonical record with ID: %', v_varavoor_branch_id;
    ELSE
        RAISE NOTICE 'Found existing database branch record for Varavoor Factory with ID: %', v_varavoor_branch_id;
    END IF;

    -- --------------------------------------------------------------------------
    -- Account 1: Super Admin (Varavoor Factory Headquarters)
    -- UUID: 2236f15a-bba8-48ba-bd23-764380fb7cba
    -- --------------------------------------------------------------------------
    SELECT role, branch_id INTO v_existing_role, v_existing_branch
    FROM public.profiles
    WHERE id = '2236f15a-bba8-48ba-bd23-764380fb7cba';

    IF v_existing_role IS NOT NULL AND v_existing_role NOT IN ('super_admin', 'super-admin') THEN
        RAISE WARNING 'Conflict detected for Super Admin UUID 2236f15a-bba8-48ba-bd23-764380fb7cba: existing role is "%", expected "super_admin".', v_existing_role;
    END IF;

    INSERT INTO public.profiles (
        id, email, full_name, role, branch_id, is_active, updated_at
    ) VALUES (
        '2236f15a-bba8-48ba-bd23-764380fb7cba',
        'icespotvaravoor@gmail.com',
        'Varavoor Factory Super Administrator',
        'super_admin',
        v_varavoor_branch_id,
        true,
        timezone('utc'::text, now())
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        role = 'super_admin',
        branch_id = COALESCE(public.profiles.branch_id, v_varavoor_branch_id),
        is_active = true,
        updated_at = timezone('utc'::text, now());

    -- --------------------------------------------------------------------------
    -- Account 2: Branch Admin (Ice Spot Ollur)
    -- UUID: 99fce41f-a636-419f-855d-9f23db4769fb
    -- --------------------------------------------------------------------------
    SELECT role, branch_id INTO v_existing_role, v_existing_branch
    FROM public.profiles
    WHERE id = '99fce41f-a636-419f-855d-9f23db4769fb';

    IF v_existing_role IS NOT NULL AND v_existing_role NOT IN ('branch_admin', 'branch-admin') THEN
        RAISE WARNING 'Conflict detected for Branch Admin UUID 99fce41f-a636-419f-855d-9f23db4769fb: existing role is "%", expected "branch_admin".', v_existing_role;
    END IF;

    INSERT INTO public.profiles (
        id, email, full_name, role, branch_id, is_active, updated_at
    ) VALUES (
        '99fce41f-a636-419f-855d-9f23db4769fb',
        'icespotthrissur@gmail.com',
        'Thrissur Ollur Branch Administrator',
        'branch_admin',
        v_ollur_branch_id,
        true,
        timezone('utc'::text, now())
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        role = 'branch_admin',
        branch_id = v_ollur_branch_id,
        is_active = true,
        updated_at = timezone('utc'::text, now());

    -- --------------------------------------------------------------------------
    -- Account 3: Delivery Staff (Fleet Driver / Cold-Chain Logistics)
    -- UUID: cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43
    -- No branch assignment required
    -- --------------------------------------------------------------------------
    SELECT role, branch_id INTO v_existing_role, v_existing_branch
    FROM public.profiles
    WHERE id = 'cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43';

    IF v_existing_role IS NOT NULL AND v_existing_role NOT IN ('delivery_staff', 'delivery-staff') THEN
        RAISE WARNING 'Conflict detected for Delivery Staff UUID cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43: existing role is "%", expected "delivery_staff".', v_existing_role;
    END IF;

    INSERT INTO public.profiles (
        id, email, full_name, role, branch_id, is_active, updated_at
    ) VALUES (
        'cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43',
        'icespotstaff@gmail.com',
        'Icespot Reefer Logistics Staff',
        'delivery_staff',
        NULL,
        true,
        timezone('utc'::text, now())
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        role = 'delivery_staff',
        is_active = true,
        updated_at = timezone('utc'::text, now());

END $$;

-- 5. Final Verification Query
-- ------------------------------------------------------------------------------
SELECT 
    p.id AS profile_id,
    p.email,
    p.full_name,
    p.role,
    p.branch_id,
    b.name AS branch_name,
    p.is_active,
    CASE 
        WHEN p.role IN ('super_admin', 'super-admin') THEN '/admin/super-admin'
        WHEN p.role IN ('branch_admin', 'branch-admin') THEN '/admin/branch'
        WHEN p.role IN ('delivery_staff', 'delivery-staff') THEN '/admin/delivery'
        ELSE '/admin'
    END AS resolved_workspace
FROM public.profiles p
LEFT JOIN public.branches b ON p.branch_id = b.id
WHERE p.id IN (
    '2236f15a-bba8-48ba-bd23-764380fb7cba',
    '99fce41f-a636-419f-855d-9f23db4769fb',
    'cb3c5a34-ce3b-4a53-ae6e-7a18ff6f4f43'
);
